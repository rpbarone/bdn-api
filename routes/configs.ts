import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Config, { IConfig } from '../models/Config';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetConfigsQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  domain?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
}

interface GetConfigParams {
  id: string;
}

interface CreateConfigBody {
  domain: 'legal' | 'shipping' | 'financial';
  configs: any;
}

interface UpdateConfigBody {
  domain?: 'legal' | 'shipping' | 'financial';
  configs?: any;
}

export default async function configRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/configs/stats
   * Retorna estatísticas sobre configurações (apenas para admin+)
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['Configs'],
        summary: 'Obter estatísticas de configurações',
        description: 'Endpoint para obter estatísticas sobre configurações do sistema'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin ou super_admin
      if (!['admin', 'super_admin'].includes(request.user!.role)) {
        return customReply.erro('Acesso negado: apenas administradores podem acessar estas estatísticas', 403);
      }

      // Executar queries agregadas
      const [totalConfigs, configsByDomain, lastUpdated] = await Promise.all([
        // Total de configurações
        Config.countDocuments(),
        
        // Quantidade por domínio
        Config.aggregate([
          { $group: { _id: '$domain', count: { $sum: 1 } } }
        ]),

        // Última atualização por domínio
        Config.aggregate([
          { $sort: { updatedAt: -1 } },
          { $group: { 
            _id: '$domain', 
            lastUpdate: { $first: '$updatedAt' },
            updatedBy: { $first: '$updatedBy' }
          }}
        ])
      ]);

      // Formatar resultado dos domínios
      const domainStats = configsByDomain.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      // Formatar últimas atualizações
      const lastUpdates = lastUpdated.reduce((acc: any, curr: any) => {
        acc[curr._id] = {
          lastUpdate: curr.lastUpdate,
          updatedBy: curr.updatedBy
        };
        return acc;
      }, {});

      const statistics = {
        total: totalConfigs,
        porDominio: {
          legal: domainStats.legal || 0,
          shipping: domainStats.shipping || 0,
          financial: domainStats.financial || 0
        },
        ultimasAtualizacoes: lastUpdates,
        dominiosConfigurados: Object.keys(domainStats).length,
        dominiosPendentes: 3 - Object.keys(domainStats).length // Total de domínios possíveis - configurados
      };

      return customReply.sucesso(statistics, 'Estatísticas de configurações obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/configs/domain/:domain
   * Busca configuração por domínio
   */
  fastify.get<{ Params: { domain: string } }>('/domain/:domain', {
    preHandler: [authenticateJWT, verificarPermissoes('Config')],
    schema: {
      params: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: { type: 'string', enum: ['legal', 'shipping', 'financial'] }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { domain: string } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const config = await Config.findOne({ domain: request.params.domain }).lean();
      
      if (!config) {
        return customReply.erro(`Configuração para o domínio ${request.params.domain} não encontrada`, 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredConfig = request.permissionFilter ? request.permissionFilter(config) : config;

      return customReply.sucesso(filteredConfig);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar configuração', 500);
    }
  });

  /**
   * GET /api/configs
   * Lista todas as configurações com paginação e filtros
   */
  fastify.get<{ Querystring: GetConfigsQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Config')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          domain: { type: 'string', enum: ['legal', 'shipping', 'financial'] },
          createdFrom: { type: 'string', format: 'date' },
          createdTo: { type: 'string', format: 'date' },
          updatedFrom: { type: 'string', format: 'date' },
          updatedTo: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetConfigsQuery }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        ...filters
      } = request.query;

      // Construir query
      const query: any = {};

      // Filtro de domínio
      if (filters.domain) {
        query.domain = filters.domain;
      }

      // Filtro de período de criação
      if (filters.createdFrom || filters.createdTo) {
        query.createdAt = {};
        if (filters.createdFrom) {
          query.createdAt.$gte = new Date(filters.createdFrom);
        }
        if (filters.createdTo) {
          const endDate = new Date(filters.createdTo);
          endDate.setHours(23, 59, 59, 999);
          query.createdAt.$lte = endDate;
        }
      }

      // Filtro de período de atualização
      if (filters.updatedFrom || filters.updatedTo) {
        query.updatedAt = {};
        if (filters.updatedFrom) {
          query.updatedAt.$gte = new Date(filters.updatedFrom);
        }
        if (filters.updatedTo) {
          const endDate = new Date(filters.updatedTo);
          endDate.setHours(23, 59, 59, 999);
          query.updatedAt.$lte = endDate;
        }
      }

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query
      const [configs, total] = await Promise.all([
        Config.find(query)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .populate('updatedBy', 'name email')
          .lean(),
        Config.countDocuments(query)
      ]);

      // Aplicar filtro de campos baseado nas permissões
      const filteredConfigs = request.permissionFilter ? configs.map(request.permissionFilter) : configs;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredConfigs,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext,
          hasPrev
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao listar configurações', 500);
    }
  });

  /**
   * GET /api/configs/:id
   * Busca uma configuração específica
   */
  fastify.get<{ Params: GetConfigParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Config')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetConfigParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const config = await Config.findById(request.params.id)
        .populate('updatedBy', 'name email')
        .lean();
      
      if (!config) {
        return customReply.erro('Configuração não encontrada', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredConfig = request.permissionFilter ? request.permissionFilter(config) : config;

      return customReply.sucesso(filteredConfig);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar configuração', 500);
    }
  });

  /**
   * POST /api/configs
   * Cria uma nova configuração
   */
  fastify.post<{ Body: CreateConfigBody }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Config'), aplicarHooks('Config', 'create')],
    schema: {
      body: {
        type: 'object',
        required: ['domain', 'configs'],
        properties: {
          domain: { type: 'string', enum: ['legal', 'shipping', 'financial'] },
          configs: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateConfigBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const configData = {
        ...(hookCtx?.data || request.body),
        updatedBy: request.user!._id
      };

      // Criar configuração
      const config = new Config(configData);
      await config.save();

      // Buscar configuração criada para retornar com virtuals
      const createdConfig = await Config.findById(config._id)
        .populate('updatedBy', 'name email')
        .lean();

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(createdConfig);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredConfig = request.permissionFilter ? request.permissionFilter(createdConfig) : createdConfig;

      return customReply.sucesso(filteredConfig, 'Configuração criada com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      
      // Erros de validação do Mongoose
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err: any) => err.message);
        return customReply.erro(errors.join(', '), 400);
      }
      
      // Erro de duplicação
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return customReply.erro(`${field} já existe`, 409);
      }
      
      return customReply.erro('Erro ao criar configuração', 500);
    }
  });

  /**
   * PUT /api/configs/:id
   * Atualiza uma configuração
   */
  fastify.put<{ Params: GetConfigParams; Body: UpdateConfigBody }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Config'), aplicarHooks('Config', 'update')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      },
      body: {
        type: 'object',
        properties: {
          domain: { type: 'string', enum: ['legal', 'shipping', 'financial'] },
          configs: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetConfigParams; Body: UpdateConfigBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = {
        ...(hookCtx?.data || request.body),
        updatedBy: request.user!._id
      };

      // Atualizar configuração
      const config = await Config.findByIdAndUpdate(
        request.params.id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('updatedBy', 'name email')
      .lean();

      if (!config) {
        return customReply.erro('Configuração não encontrada', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(config);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredConfig = request.permissionFilter ? request.permissionFilter(config) : config;

      return customReply.sucesso(filteredConfig, 'Configuração atualizada com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      
      // Erros de validação do Mongoose
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err: any) => err.message);
        return customReply.erro(errors.join(', '), 400);
      }
      
      // Erro de duplicação
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return customReply.erro(`${field} já existe`, 409);
      }
      
      return customReply.erro('Erro ao atualizar configuração', 500);
    }
  });

  /**
   * PATCH /api/configs/:id/configs
   * Atualiza parcialmente o objeto configs (merge)
   */
  fastify.patch<{ Params: GetConfigParams; Body: { configs: any } }>('/:id/configs', {
    preHandler: [authenticateJWT, verificarPermissoes('Config')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      },
      body: {
        type: 'object',
        required: ['configs'],
        properties: {
          configs: { type: 'object' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetConfigParams; Body: { configs: any } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Buscar configuração atual
      const currentConfig = await Config.findById(request.params.id);
      
      if (!currentConfig) {
        return customReply.erro('Configuração não encontrada', 404);
      }

      // Fazer merge dos configs
      const mergedConfigs = {
        ...(currentConfig.configs || {}),
        ...request.body.configs
      };

      // Atualizar com os configs mesclados
      const config = await Config.findByIdAndUpdate(
        request.params.id,
        {
          configs: mergedConfigs,
          updatedBy: request.user!._id
        },
        { new: true, runValidators: true }
      )
      .populate('updatedBy', 'name email')
      .lean();

      // Aplicar filtro de campos baseado nas permissões
      const filteredConfig = request.permissionFilter ? request.permissionFilter(config) : config;

      return customReply.sucesso(filteredConfig, 'Configuração atualizada com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao atualizar configuração', 500);
    }
  });

  /**
   * DELETE /api/configs/:id
   * Remove uma configuração
   */
  fastify.delete<{ Params: GetConfigParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Config'), aplicarHooks('Config', 'delete')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetConfigParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const config = await Config.findByIdAndDelete(request.params.id);
      
      if (!config) {
        return customReply.erro('Configuração não encontrada', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(config);
      }

      return customReply.sucesso(null, 'Configuração removida com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao remover configuração', 500);
    }
  });
}
