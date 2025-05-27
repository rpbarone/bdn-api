import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import AbandonedCheckout, { IAbandonedCheckout } from '../models/AbandonedCheckout';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetCheckoutsQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  type?: 'b2c' | 'b2i';
  influencerId?: string;
  customerId?: string;
  guestEmail?: string;
  guestPhone?: string;
  stage?: string;
  convertedToOrder?: boolean;
  createdFrom?: string;
  createdTo?: string;
  abandonedFrom?: string;
  abandonedTo?: string;
  minTotal?: number;
  maxTotal?: number;
}

interface GetCheckoutParams {
  id: string;
}

interface TrackTimeBody {
  timeSpentSeconds: number;
}

interface TrackVisitBody {
  incrementView?: boolean;
}

interface GetByTypeParams {
  typeId: string;
}

export default async function abandonedCheckoutRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/abandonedcheckouts/stats
   * Retorna estatísticas gerais sobre checkouts abandonados
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['AbandonedCheckouts'],
        summary: 'Obter estatísticas de checkouts abandonados',
        description: 'Retorna métricas gerais sobre checkouts abandonados'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Filtro base para influencer
      const baseFilter: any = {};
      if (request.user!.role === 'influencer') {
        baseFilter.influencerId = (request.user as any)!._id;
      }

      // Executar queries agregadas
      const [
        totalCheckouts,
        convertedCheckouts,
        checkoutsByStage,
        checkoutsByType,
        last30Days
      ] = await Promise.all([
        // Total de checkouts abandonados
        AbandonedCheckout.countDocuments(baseFilter),
        
        // Checkouts convertidos
        AbandonedCheckout.countDocuments({ ...baseFilter, 'convertedToOrder.status': true }),
        
        // Por estágio de abandono
        AbandonedCheckout.aggregate([
          { $match: baseFilter },
          { $group: { _id: '$abandonedAt.stage', count: { $sum: 1 } } }
        ]),
        
        // Por tipo (B2C/B2I)
        AbandonedCheckout.aggregate([
          { $match: baseFilter },
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ]),
        
        // Últimos 30 dias
        AbandonedCheckout.countDocuments({
          ...baseFilter,
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        })
      ]);

      // Formatar resultados
      const stageStats = checkoutsByStage.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const typeStats = checkoutsByType.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const conversionRate = totalCheckouts > 0 
        ? ((convertedCheckouts / totalCheckouts) * 100).toFixed(2) + '%' 
        : '0%';

      const statistics = {
        total: totalCheckouts,
        convertidos: convertedCheckouts,
        taxaConversao: conversionRate,
        ultimos30Dias: last30Days,
        porEstagio: {
          personal_data: stageStats.personal_data || 0,
          shipping_data: stageStats.shipping_data || 0,
          shipping_method: stageStats.shipping_method || 0,
          payment: stageStats.payment || 0
        },
        porTipo: {
          b2c: typeStats.b2c || 0,
          b2i: typeStats.b2i || 0
        }
      };

      return customReply.sucesso(statistics, 'Estatísticas obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/abandonedcheckouts
   * Lista todos os checkouts abandonados com paginação e filtros
   */
  fastify.get<{ Querystring: GetCheckoutsQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('AbandonedCheckout')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          type: { type: 'string', enum: ['b2c', 'b2i'] },
          influencerId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          customerId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          guestEmail: { type: 'string' },
          guestPhone: { type: 'string' },
          stage: { type: 'string', enum: ['personal_data', 'shipping_data', 'shipping_method', 'payment'] },
          convertedToOrder: { type: 'boolean' },
          createdFrom: { type: 'string', format: 'date' },
          createdTo: { type: 'string', format: 'date' },
          abandonedFrom: { type: 'string', format: 'date' },
          abandonedTo: { type: 'string', format: 'date' },
          minTotal: { type: 'number' },
          maxTotal: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetCheckoutsQuery }>, reply: FastifyReply) => {
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

      // Se usuário é influencer, força ver apenas seus checkouts
      if (request.user!.role === 'influencer') {
        query.influencerId = (request.user as any)!._id;
      }

      // Filtros exatos
      if (filters.type) query.type = filters.type;
      if (filters.influencerId) query.influencerId = filters.influencerId;
      if (filters.customerId) query.customerId = filters.customerId;
      if (filters.stage) query['abandonedAt.stage'] = filters.stage;
      if (filters.convertedToOrder !== undefined) {
        query['convertedToOrder.status'] = filters.convertedToOrder;
      }

      // Filtros de texto (busca parcial)
      if (filters.guestEmail) {
        query.guestEmail = { $regex: filters.guestEmail, $options: 'i' };
      }
      if (filters.guestPhone) {
        query.guestPhone = { $regex: filters.guestPhone.replace(/\D/g, ''), $options: 'i' };
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

      // Filtro de período de abandono
      if (filters.abandonedFrom || filters.abandonedTo) {
        query['abandonedAt.timestamp'] = {};
        if (filters.abandonedFrom) {
          query['abandonedAt.timestamp'].$gte = new Date(filters.abandonedFrom);
        }
        if (filters.abandonedTo) {
          const endDate = new Date(filters.abandonedTo);
          endDate.setHours(23, 59, 59, 999);
          query['abandonedAt.timestamp'].$lte = endDate;
        }
      }

      // Filtro de total (soma de cash + bodycoins)
      if (filters.minTotal !== undefined || filters.maxTotal !== undefined) {
        const pipeline: any[] = [
          { $match: query },
          {
            $addFields: {
              totalValue: { $add: ['$totals.products.cash', '$totals.products.bodycoins'] }
            }
          }
        ];

        if (filters.minTotal !== undefined) {
          pipeline.push({ $match: { totalValue: { $gte: filters.minTotal } } });
        }
        if (filters.maxTotal !== undefined) {
          pipeline.push({ $match: { totalValue: { $lte: filters.maxTotal } } });
        }

        // Adicionar paginação e ordenação
        pipeline.push(
          { $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } },
          { $skip: (page - 1) * limit },
          { $limit: limit }
        );

        const [checkouts, countResult] = await Promise.all([
          AbandonedCheckout.aggregate(pipeline),
          AbandonedCheckout.aggregate([
            ...pipeline.slice(0, -3), // Remover sort, skip e limit
            { $count: 'total' }
          ])
        ]);

        const total = (countResult[0] as any)?.total || 0;
        const totalPages = Math.ceil(total / limit);

        return customReply.sucesso({
          data: checkouts,
          pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        });
      }

      // Query normal sem filtro de total
      const skip = (page - 1) * limit;

      const [checkouts, total] = await Promise.all([
        AbandonedCheckout.find(query)
          .populate('influencerId', 'id name email')
          .populate('customerId', 'name email')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AbandonedCheckout.countDocuments(query)
      ]);

      // Aplicar filtro de campos baseado nas permissões
      const filteredCheckouts = request.permissionFilter ? checkouts.map(request.permissionFilter) : checkouts;

      const totalPages = Math.ceil(total / limit);

      return customReply.sucesso({
        data: filteredCheckouts,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao listar checkouts abandonados', 500);
    }
  });

  /**
   * GET /api/abandonedcheckouts/b2i/:influencerId
   * Lista checkouts abandonados de um influencer específico
   */
  fastify.get<{ Params: GetByTypeParams; Querystring: GetCheckoutsQuery }>('/b2i/:typeId', {
    preHandler: [authenticateJWT],
    schema: {
      params: {
        type: 'object',
        required: ['typeId'],
        properties: {
          typeId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetByTypeParams; Querystring: GetCheckoutsQuery }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar permissão: influencer só pode ver seus próprios
      if (request.user!.role === 'influencer' && (request.user as any)!._id.toString() !== request.params.typeId) {
        return customReply.erro('Sem permissão para acessar checkouts de outro influencer', 403);
      }

      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = request.query;

      const query: any = {
        type: 'b2i',
        influencerId: request.params.typeId
      };

      const skip = (page - 1) * limit;

      const [checkouts, total] = await Promise.all([
        AbandonedCheckout.find(query)
          .populate('customerId', 'name email')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AbandonedCheckout.countDocuments(query)
      ]);

      const totalPages = Math.ceil(total / limit);

      return customReply.sucesso({
        data: checkouts,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao listar checkouts B2I', 500);
    }
  });

  /**
   * GET /api/abandonedcheckouts/b2c/:customerId
   * Lista checkouts abandonados de um customer específico
   */
  fastify.get<{ Params: GetByTypeParams; Querystring: GetCheckoutsQuery }>('/b2c/:typeId', {
    preHandler: [authenticateJWT, verificarPermissoes('AbandonedCheckout')],
    schema: {
      params: {
        type: 'object',
        required: ['typeId'],
        properties: {
          typeId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetByTypeParams; Querystring: GetCheckoutsQuery }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = request.query;

      const query: any = {
        type: 'b2c',
        customerId: request.params.typeId
      };

      const skip = (page - 1) * limit;

      const [checkouts, total] = await Promise.all([
        AbandonedCheckout.find(query)
          .populate('influencerId', 'id name email')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AbandonedCheckout.countDocuments(query)
      ]);

      const totalPages = Math.ceil(total / limit);

      return customReply.sucesso({
        data: checkouts,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao listar checkouts B2C', 500);
    }
  });

  /**
   * GET /api/abandonedcheckouts/:id
   * Busca um checkout abandonado específico
   */
  fastify.get<{ Params: GetCheckoutParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('AbandonedCheckout')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCheckoutParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const checkout = await AbandonedCheckout.findById(request.params.id)
        .populate('influencerId', 'id name email')
        .populate('customerId', 'name email')
        .lean();
      
      if (!checkout) {
        return customReply.erro('Checkout abandonado não encontrado', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCheckout = request.permissionFilter ? request.permissionFilter(checkout) : checkout;

      return customReply.sucesso(filteredCheckout);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar checkout abandonado', 500);
    }
  });

  /**
   * PUT /api/abandonedcheckouts/:id/track-time
   * Atualiza o tempo gasto no checkout
   */
  fastify.put<{ Params: GetCheckoutParams; Body: TrackTimeBody }>('/:id/track-time', {
    preHandler: [authenticateJWT],
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
        required: ['timeSpentSeconds'],
        properties: {
          timeSpentSeconds: { type: 'number', minimum: 0 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCheckoutParams; Body: TrackTimeBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const checkout = await AbandonedCheckout.findById(request.params.id);
      
      if (!checkout) {
        return customReply.erro('Checkout abandonado não encontrado', 404);
      }

      // Verificar permissão: influencer só pode atualizar seus próprios
      if (request.user!.role === 'influencer' && 
          (checkout as any).influencerId?.toString() !== (request.user as any)!._id.toString()) {
        return customReply.erro('Sem permissão para atualizar este checkout', 403);
      }

      // Incrementar tempo gasto (não substituir)
      checkout.checkoutAnalytics.timeSpentSeconds += request.body.timeSpentSeconds;
      checkout.checkoutAnalytics.lastViewedDate = new Date();
      
      await checkout.save();

      return customReply.sucesso({
        timeSpentSeconds: checkout.checkoutAnalytics.timeSpentSeconds,
        lastViewedDate: checkout.checkoutAnalytics.lastViewedDate
      }, 'Tempo rastreado com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao rastrear tempo', 500);
    }
  });

  /**
   * PUT /api/abandonedcheckouts/:id/track-visit
   * Registra uma visita ao checkout
   */
  fastify.put<{ Params: GetCheckoutParams; Body: TrackVisitBody }>('/:id/track-visit', {
    preHandler: [authenticateJWT],
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
          incrementView: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCheckoutParams; Body: TrackVisitBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const checkout = await AbandonedCheckout.findById(request.params.id);
      
      if (!checkout) {
        return customReply.erro('Checkout abandonado não encontrado', 404);
      }

      // Verificar permissão: influencer só pode atualizar seus próprios
      if (request.user!.role === 'influencer' && 
          (checkout as any).influencerId?.toString() !== (request.user as any)!._id.toString()) {
        return customReply.erro('Sem permissão para atualizar este checkout', 403);
      }

      // Incrementar visualizações se solicitado
      if (request.body.incrementView !== false) {
        checkout.checkoutAnalytics.viewCount += 1;
      }
      
      checkout.checkoutAnalytics.lastViewedDate = new Date();
      
      await checkout.save();

      return customReply.sucesso({
        viewCount: checkout.checkoutAnalytics.viewCount,
        lastViewedDate: checkout.checkoutAnalytics.lastViewedDate
      }, 'Visita registrada com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao registrar visita', 500);
    }
  });
}
