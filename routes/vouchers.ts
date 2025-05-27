import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import Voucher, { IVoucher } from '../models/Voucher';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetVouchersQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  code?: string;
  description?: string;
  isActive?: boolean;
  status?: string;
  discountType?: 'percentual' | 'fixed';
  minDiscountValue?: number;
  maxDiscountValue?: number;
  minOrderValue?: number;
  maxOrderValue?: number;
  freeShipping?: boolean;
  oneTimePerUser?: boolean;
  niche?: string;
  specificInfluencer?: string;
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  currentlyValid?: boolean;
  hasUsesRemaining?: boolean;
}

interface GetVoucherParams {
  id: string;
}

interface CreateVoucherBody {
  code: string;
  description: string;
  maxUses?: number;
  minimumOrderValue?: number;
  startDate: string;
  endDate: string;
  isActive?: boolean;
  discountType: 'percentual' | 'fixed';
  discountValue: number;
  minItemQuantity?: number;
  freeShipping?: boolean;
  oneTimePerUser?: boolean;
  niches?: string[];
  specificInfluencers?: string[];
  exceptions?: {
    excludedCategories?: string[];
    excludedProducts?: string[];
  };
}

interface UpdateVoucherBody extends Partial<CreateVoucherBody> {}

export default async function voucherRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/vouchers/stats
   * Retorna estatísticas sobre vouchers
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT, verificarPermissoes('Voucher')],
    config: {
      swagger: {
        tags: ['Vouchers'],
        summary: 'Obter estatísticas de vouchers',
        description: 'Endpoint para obter estatísticas gerais sobre vouchers'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Executar queries agregadas
      const now = new Date();
      const [totalVouchers, activeVouchers, scheduledVouchers, totalUses, expiredVouchers, vouchersByType] = await Promise.all([
        // Total de vouchers
        Voucher.countDocuments({}),
        
        // Vouchers ativos (em período válido e não esgotados)
        Voucher.countDocuments({ 
          isActive: true,
          startDate: { $lte: now },
          endDate: { $gte: now }
        }),
        
        // Vouchers agendados (ainda não iniciaram)
        Voucher.countDocuments({
          isActive: true,
          startDate: { $gt: now }
        }),
        
        // Total de usos
        Voucher.aggregate([
          { $group: { _id: null, total: { $sum: '$currentUses' } } }
        ]),
        
        // Vouchers expirados
        Voucher.countDocuments({ endDate: { $lt: now } }),
        
        // Quantidade por tipo
        Voucher.aggregate([
          { $group: { _id: '$discountType', count: { $sum: 1 } } }
        ])
      ]);

      // Formatar resultado dos tipos
      const typeStats = vouchersByType.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const statistics = {
        totalVouchers,
        vouchersAtivos: activeVouchers,
        totalUsos: totalUses[0]?.total || 0,
        agendados: scheduledVouchers,
        expirados: expiredVouchers,
        porTipo: {
          percentual: typeStats.percentual || 0,
          fixo: typeStats.fixed || 0
        },
        percentualAtivos: totalVouchers > 0 ? ((activeVouchers / totalVouchers) * 100).toFixed(2) + '%' : '0%'
      };

      return customReply.sucesso(statistics, 'Estatísticas de vouchers obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/vouchers
   * Lista todos os vouchers com paginação e filtros
   */
  fastify.get<{ Querystring: GetVouchersQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Voucher')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          code: { type: 'string' },
          description: { type: 'string' },
          isActive: { type: 'boolean' },
          discountType: { type: 'string', enum: ['percentual', 'fixed'] },
          minDiscountValue: { type: 'number' },
          maxDiscountValue: { type: 'number' },
          minOrderValue: { type: 'number' },
          maxOrderValue: { type: 'number' },
          freeShipping: { type: 'boolean' },
          oneTimePerUser: { type: 'boolean' },
          niche: { type: 'string' },
          specificInfluencer: { type: 'string' },
          startDateFrom: { type: 'string', format: 'date' },
          startDateTo: { type: 'string', format: 'date' },
          endDateFrom: { type: 'string', format: 'date' },
          endDateTo: { type: 'string', format: 'date' },
          currentlyValid: { type: 'boolean' },
          hasUsesRemaining: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetVouchersQuery }>, reply: FastifyReply) => {
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

      // Filtros de texto (busca parcial case-insensitive)
      if (filters.code) {
        query.code = { $regex: filters.code.toUpperCase(), $options: 'i' };
      }
      if (filters.description) {
        query.normalizedDescription = { $regex: filters.description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), $options: 'i' };
      }

      // Filtros exatos
      if (filters.isActive !== undefined) query.isActive = filters.isActive;
      if (filters.discountType) query.discountType = filters.discountType;
      if (filters.freeShipping !== undefined) query.freeShipping = filters.freeShipping;
      if (filters.oneTimePerUser !== undefined) query.oneTimePerUser = filters.oneTimePerUser;

      // Filtro por status calculado
      if (filters.status) {
        const now = new Date();
        switch (filters.status.toLowerCase()) {
          case 'ativo':
            query.isActive = true;
            query.startDate = { $lte: now };
            query.endDate = { $gte: now };
            break;
          case 'agendado':
            query.isActive = true;
            query.startDate = { $gt: now };
            break;
          case 'expirado':
            query.endDate = { $lt: now };
            break;
          case 'inativo':
            query.isActive = false;
            break;
          case 'todos':
            // Não adiciona filtros
            break;
        }
      }

      // Filtros de range numérico
      if (filters.minDiscountValue !== undefined || filters.maxDiscountValue !== undefined) {
        query.discountValue = {};
        if (filters.minDiscountValue !== undefined) query.discountValue.$gte = filters.minDiscountValue;
        if (filters.maxDiscountValue !== undefined) query.discountValue.$lte = filters.maxDiscountValue;
      }
      if (filters.minOrderValue !== undefined || filters.maxOrderValue !== undefined) {
        query.minimumOrderValue = {};
        if (filters.minOrderValue !== undefined) query.minimumOrderValue.$gte = filters.minOrderValue;
        if (filters.maxOrderValue !== undefined) query.minimumOrderValue.$lte = filters.maxOrderValue;
      }

      // Filtro de nicho e influenciador específico
      if (filters.niche) {
        query.niches = { $in: [filters.niche] };
      }
      if (filters.specificInfluencer) {
        query.specificInfluencers = { $in: [filters.specificInfluencer] };
      }

      // Filtros de data
      if (filters.startDateFrom || filters.startDateTo) {
        query.startDate = {};
        if (filters.startDateFrom) {
          query.startDate.$gte = new Date(filters.startDateFrom);
        }
        if (filters.startDateTo) {
          const endDate = new Date(filters.startDateTo);
          endDate.setHours(23, 59, 59, 999);
          query.startDate.$lte = endDate;
        }
      }
      if (filters.endDateFrom || filters.endDateTo) {
        query.endDate = {};
        if (filters.endDateFrom) {
          query.endDate.$gte = new Date(filters.endDateFrom);
        }
        if (filters.endDateTo) {
          const endDate = new Date(filters.endDateTo);
          endDate.setHours(23, 59, 59, 999);
          query.endDate.$lte = endDate;
        }
      }

      // Filtros especiais
      const now = new Date();
      if (filters.currentlyValid) {
        query.isActive = true;
        query.startDate = { $lte: now };
        query.endDate = { $gte: now };
      }
      if (filters.hasUsesRemaining) {
        query.$or = [
          { maxUses: { $exists: false } },
          { maxUses: null },
          { $expr: { $lt: ['$currentUses', '$maxUses'] } }
        ];
      }

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query
      const [vouchers, total] = await Promise.all([
        Voucher.find(query)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .populate('niches', 'name')
          .populate('specificInfluencers', 'name id')
          .populate('exceptions.excludedCategories', 'name')
          .populate('exceptions.excludedProducts', 'name')
          .lean(),
        Voucher.countDocuments(query)
      ]);

      // Aplicar filtro de campos baseado nas permissões
      const filteredVouchers = request.permissionFilter ? vouchers.map(request.permissionFilter) : vouchers;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredVouchers,
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
      return customReply.erro('Erro ao listar vouchers', 500);
    }
  });

  /**
   * GET /api/vouchers/:id
   * Busca um voucher específico
   */
  fastify.get<{ Params: GetVoucherParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Voucher')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetVoucherParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const voucher = await Voucher.findById(request.params.id)
        .populate('niches', 'name')
        .populate('specificInfluencers', 'name id')
        .populate('exceptions.excludedCategories', 'name')
        .populate('exceptions.excludedProducts', 'name')
        .lean();
      
      if (!voucher) {
        return customReply.erro('Voucher não encontrado', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredVoucher = request.permissionFilter ? request.permissionFilter(voucher) : voucher;

      return customReply.sucesso(filteredVoucher);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar voucher', 500);
    }
  });

  /**
   * POST /api/vouchers
   * Cria um novo voucher
   */
  fastify.post<{ Body: CreateVoucherBody }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Voucher'), aplicarHooks('Voucher', 'create')],
    schema: {
      body: {
        type: 'object',
        required: ['code', 'description', 'startDate', 'endDate', 'discountType', 'discountValue'],
        properties: {
          code: { type: 'string', minLength: 3, maxLength: 20 },
          description: { type: 'string', minLength: 5, maxLength: 200 },
          maxUses: { type: 'number', minimum: 1 },
          minimumOrderValue: { type: 'number', minimum: 0 },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          isActive: { type: 'boolean' },
          discountType: { type: 'string', enum: ['percentual', 'fixed'] },
          discountValue: { type: 'number', minimum: 0 },
          minItemQuantity: { type: 'number', minimum: 1 },
          freeShipping: { type: 'boolean' },
          oneTimePerUser: { type: 'boolean' },
          niches: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          specificInfluencers: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          exceptions: {
            type: 'object',
            properties: {
              excludedCategories: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
              excludedProducts: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateVoucherBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const voucherData = {
        ...(hookCtx?.data || request.body),
        updatedBy: (request.user as any)!._id,
        createdBy: (request.user as any)!._id
      };

      // Criar voucher
      const voucher = new Voucher(voucherData);
      await voucher.save();

      // Buscar voucher criado para retornar com populates
      const createdVoucher = await Voucher.findById(voucher._id)
        .populate('niches', 'name')
        .populate('specificInfluencers', 'name id')
        .populate('exceptions.excludedCategories', 'name')
        .populate('exceptions.excludedProducts', 'name')
        .lean();

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(createdVoucher);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredVoucher = request.permissionFilter ? request.permissionFilter(createdVoucher) : createdVoucher;

      return customReply.sucesso(filteredVoucher, 'Voucher criado com sucesso');

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
        return customReply.erro(`${field} já está em uso`, 409);
      }
      
      return customReply.erro('Erro ao criar voucher', 500);
    }
  });

  /**
   * PUT /api/vouchers/:id
   * Atualiza um voucher
   */
  fastify.put<{ Params: GetVoucherParams; Body: UpdateVoucherBody }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Voucher'), aplicarHooks('Voucher', 'update')],
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
          code: { type: 'string', minLength: 3, maxLength: 20 },
          description: { type: 'string', minLength: 5, maxLength: 200 },
          maxUses: { type: 'number', minimum: 1 },
          minimumOrderValue: { type: 'number', minimum: 0 },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          isActive: { type: 'boolean' },
          discountType: { type: 'string', enum: ['percentual', 'fixed'] },
          discountValue: { type: 'number', minimum: 0 },
          minItemQuantity: { type: 'number', minimum: 1 },
          freeShipping: { type: 'boolean' },
          oneTimePerUser: { type: 'boolean' },
          niches: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          specificInfluencers: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
          exceptions: {
            type: 'object',
            properties: {
              excludedCategories: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
              excludedProducts: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetVoucherParams; Body: UpdateVoucherBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = {
        ...(hookCtx?.data || request.body),
        updatedBy: (request.user as any)!._id
      };

      // Atualizar voucher
      const voucher = await Voucher.findByIdAndUpdate(
        request.params.id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('niches', 'name')
      .populate('specificInfluencers', 'name id')
      .populate('exceptions.excludedCategories', 'name')
      .populate('exceptions.excludedProducts', 'name')
      .lean();

      if (!voucher) {
        return customReply.erro('Voucher não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(voucher);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredVoucher = request.permissionFilter ? request.permissionFilter(voucher) : voucher;

      return customReply.sucesso(filteredVoucher, 'Voucher atualizado com sucesso');

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
        return customReply.erro(`${field} já está em uso`, 409);
      }
      
      return customReply.erro('Erro ao atualizar voucher', 500);
    }
  });

  /**
   * DELETE /api/vouchers/:id
   * Remove um voucher
   */
  fastify.delete<{ Params: GetVoucherParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Voucher'), aplicarHooks('Voucher', 'delete')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetVoucherParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const voucher = await Voucher.findByIdAndDelete(request.params.id);
      
      if (!voucher) {
        return customReply.erro('Voucher não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(voucher);
      }

      return customReply.sucesso(null, 'Voucher removido com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao remover voucher', 500);
    }
  });

  /**
   * GET /api/vouchers/validate/:code
   * Valida se um voucher está disponível para uso
   */
  fastify.get<{ Params: { code: string } }>('/validate/:code', {
    preHandler: [authenticateJWT],
    schema: {
      params: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const voucher = await Voucher.findOne({ 
        code: request.params.code.toUpperCase() 
      }).lean();
      
      if (!voucher) {
        return customReply.erro('Voucher não encontrado', 404);
      }

      const now = new Date();
      const validationResult = {
        valid: false,
        reason: '',
        voucher: {
          code: voucher.code,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
          minimumOrderValue: voucher.minimumOrderValue,
          freeShipping: voucher.freeShipping
        }
      };

      // Verificar se está ativo
      if (!voucher.isActive) {
        validationResult.reason = 'Voucher inativo';
        return customReply.sucesso(validationResult);
      }

      // Verificar período de validade
      if (now < voucher.startDate) {
        validationResult.reason = 'Voucher ainda não está válido';
        return customReply.sucesso(validationResult);
      }
      if (now > voucher.endDate) {
        validationResult.reason = 'Voucher expirado';
        return customReply.sucesso(validationResult);
      }

      // Verificar limite de usos
      if (voucher.maxUses && voucher.currentUses >= voucher.maxUses) {
        validationResult.reason = 'Voucher atingiu o limite de usos';
        return customReply.sucesso(validationResult);
      }

      // Voucher válido
      validationResult.valid = true;
      validationResult.reason = 'Voucher válido';

      return customReply.sucesso(validationResult);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao validar voucher', 500);
    }
  });

  /**
   * GET /api/vouchers/search/influencers
   * Busca influenciadores por nicho ou nome
   */
  fastify.get<{ Querystring: { q?: string; niche?: string; niches?: string[] } }>('/search/influencers', {
    preHandler: [authenticateJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Termo de busca (nome ou @username)' },
          niche: { type: 'string', description: 'ID do nicho' },
          niches: { type: 'array', items: { type: 'string' }, description: 'IDs dos nichos' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { q?: string; niche?: string; niches?: string[] } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (request.user!.role === 'influencer') {
        return customReply.erro('Sem permissão para buscar influenciadores', 403);
      }

      const { q, niche, niches } = request.query;
      const User = mongoose.model('User');
      const Niche = mongoose.model('Niche');

      // Construir query
      const query: any = { role: 'influencer', status: 'ativo' };

      // Busca por nome ou instagram
      if (q) {
        query.$or = [
          { normalizedName: { $regex: q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), $options: 'i' } },
          { 'social.instagram': { $regex: q.replace('@', ''), $options: 'i' } }
        ];
      }

      // Filtro por nicho(s)
      if (niche) {
        query.niches = { $in: [niche] };
      } else if (niches && niches.length > 0) {
        query.niches = { $in: niches };
      }

      // Buscar influenciadores
      const influencers = await User.find(query)
        .select('id name email social.instagram niches')
        .populate('niches', 'name')
        .limit(50)
        .lean();

      // Se foram especificados nichos, buscar informações dos nichos
      let nicheInfo: any[] = [];
      if (niches && niches.length > 0) {
        nicheInfo = await Niche.find({ _id: { $in: niches } }).select('name').lean();
      }

      return customReply.sucesso({
        influenciadores: influencers,
        nichosEspecificos: nicheInfo,
        total: influencers.length
      });

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar influenciadores', 500);
    }
  });

  /**
   * GET /api/vouchers/search/niches
   * Busca nichos disponíveis
   */
  fastify.get<{ Querystring: { q?: string } }>('/search/niches', {
    preHandler: [authenticateJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Termo de busca' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { q?: string } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (request.user!.role === 'influencer') {
        return customReply.erro('Sem permissão para buscar nichos', 403);
      }

      const { q } = request.query;
      const Niche = mongoose.model('Niche');

      // Construir query
      const query: any = {};
      if (q) {
        query.name = { $regex: q, $options: 'i' };
      }

      // Buscar nichos
      const niches = await Niche.find(query)
        .select('name')
        .sort('name')
        .limit(50)
        .lean();

      return customReply.sucesso(niches);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar nichos', 500);
    }
  });

  /**
   * GET /api/vouchers/search/categories
   * Busca categorias de produtos
   */
  fastify.get<{ Querystring: { q?: string } }>('/search/categories', {
    preHandler: [authenticateJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Termo de busca' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { q?: string } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (request.user!.role === 'influencer') {
        return customReply.erro('Sem permissão para buscar categorias', 403);
      }

      const { q } = request.query;
      const ProductCategory = mongoose.model('ProductCategory');

      // Construir query
      const query: any = { isActive: true };
      if (q) {
        query.name = { $regex: q, $options: 'i' };
      }

      // Buscar categorias - se não houver busca, retornar as principais
      const categories = await ProductCategory.find(query)
        .select('name')
        .sort('name')
        .limit(q ? 50 : 10) // Se tem busca, retorna até 50, senão retorna 10 principais
        .lean();

      return customReply.sucesso(categories);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar categorias', 500);
    }
  });

  /**
   * GET /api/vouchers/search/products
   * Busca produtos
   */
  fastify.get<{ Querystring: { q?: string; category?: string } }>('/search/products', {
    preHandler: [authenticateJWT],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Termo de busca' },
          category: { type: 'string', description: 'ID da categoria' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { q?: string; category?: string } }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (request.user!.role === 'influencer') {
        return customReply.erro('Sem permissão para buscar produtos', 403);
      }

      const { q, category } = request.query;
      const Product = mongoose.model('Product');

      // Construir query
      const query: any = { isActive: true };
      
      if (q) {
        query.$or = [
          { name: { $regex: q, $options: 'i' } },
          { sku: { $regex: q, $options: 'i' } }
        ];
      }

      if (category) {
        query.category = category;
      }

      // Buscar produtos - se não houver busca, retornar os principais
      const products = await Product.find(query)
        .select('name sku priceB2I category')
        .populate('category', 'name')
        .sort('-createdAt')
        .limit(q || category ? 50 : 10) // Se tem filtro, retorna até 50, senão retorna 10 principais
        .lean();

      // Formatar produtos para incluir categoria no formato esperado
      const formattedProducts = products.map((product: any) => ({
        _id: product._id,
        id: product._id,
        name: product.name,
        sku: product.sku,
        priceB2I: product.priceB2I,
        category: product.category?.name || 'Sem categoria'
      }));

      return customReply.sucesso(formattedProducts);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar produtos', 500);
    }
  });
}
