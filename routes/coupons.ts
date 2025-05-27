import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import Coupon, { ICoupon } from '../models/Coupon';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetCouponsQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  code?: string;
  description?: string;
  origin?: string;
  associatedInfluencer?: string;
  isActive?: boolean;
  status?: string;
  discountType?: string;
  minDiscountValue?: number;
  maxDiscountValue?: number;
  minOrderValue?: number;
  freeShipping?: boolean;
  oneTimePerUser?: boolean;
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  minCurrentUses?: number;
  maxCurrentUses?: number;
}

interface GetCouponParams {
  id: string;
}

interface CreateCouponBody {
  origin: 'all' | 'organic' | 'trafficPaid';
  associatedInfluencer?: string;
  code: string;
  description: string;
  maxUses?: number;
  minimumOrderValue?: number;
  startDate: string;
  endDate: string;
  discountType: 'percentual' | 'fixed';
  discountValue: number;
  minItemQuantity?: number;
  freeShipping?: boolean;
  oneTimePerUser?: boolean;
  exceptions?: {
    excludedCategories?: string[];
    excludedProducts?: string[];
  };
  isActive?: boolean;
}

interface UpdateCouponBody extends Partial<CreateCouponBody> {}

export default async function couponRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/coupons/stats
   * Retorna estatísticas gerais sobre cupons (apenas para admin+)
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['Coupons'],
        summary: 'Obter estatísticas de cupons',
        description: 'Endpoint exclusivo para admin+ obter estatísticas sobre cupons'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (request.user!.role === 'influencer') {
        return customReply.erro('Acesso negado: apenas administradores podem acessar estas estatísticas', 403);
      }

      // Executar queries agregadas
      const now = new Date();
      const [total, ativos, agendados, totalUsos, inativos, porOrigem, porTipo] = await Promise.all([
        // Total de cupons
        Coupon.countDocuments(),
        
        // Cupons ativos (em período válido)
        Coupon.countDocuments({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } }),
        
        // Cupons agendados (ainda não iniciaram)
        Coupon.countDocuments({ isActive: true, startDate: { $gt: now } }),
        
        // Total de usos
        Coupon.aggregate([
          { $group: { _id: null, total: { $sum: '$currentUses' } } }
        ]),
        
        // Cupons inativos ou expirados
        Coupon.countDocuments({ $or: [{ isActive: false }, { endDate: { $lt: now } }] }),
        
        // Quantidade por origem
        Coupon.aggregate([
          { $group: { _id: '$origin', count: { $sum: 1 } } }
        ]),
        
        // Quantidade por tipo de desconto
        Coupon.aggregate([
          { $group: { _id: '$discountType', count: { $sum: 1 }, avgDiscount: { $avg: '$discountValue' } } }
        ])
      ]);

      // Formatar resultados
      const origemStats = porOrigem.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const tipoStats = porTipo.reduce((acc: any, curr: any) => {
        acc[curr._id] = {
          count: curr.count,
          avgDiscount: curr.avgDiscount.toFixed(2)
        };
        return acc;
      }, {});

      const statistics = {
        totalCupons: total,
        cuponsAtivos: ativos,
        totalUsos: totalUsos[0]?.total || 0,
        cuponsTrafegoPago: origemStats.trafficPaid || 0,
        agendados,
        inativos,
        expirados: await Coupon.countDocuments({ endDate: { $lt: now } }),
        porOrigem: {
          all: origemStats.all || 0,
          organic: origemStats.organic || 0,
          trafficPaid: origemStats.trafficPaid || 0
        },
        porTipo: tipoStats,
        percentualAtivos: total > 0 ? ((ativos / total) * 100).toFixed(2) + '%' : '0%'
      };

      return customReply.sucesso(statistics, 'Estatísticas de cupons obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/coupons
   * Lista todos os cupons com paginação e filtros
   */
  fastify.get<{ Querystring: GetCouponsQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Coupon')],
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
          origin: { type: 'string', enum: ['all', 'organic', 'trafficPaid'] },
          associatedInfluencer: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          isActive: { type: 'boolean' },
          status: { type: 'string', enum: ['Todos', 'Ativo', 'Agendado', 'Expirado', 'Inativo', 'todos', 'ativo', 'agendado', 'expirado', 'inativo'] },
          discountType: { type: 'string', enum: ['percentual', 'fixed'] },
          minDiscountValue: { type: 'number' },
          maxDiscountValue: { type: 'number' },
          minOrderValue: { type: 'number' },
          freeShipping: { type: 'boolean' },
          oneTimePerUser: { type: 'boolean' },
          startDateFrom: { type: 'string', format: 'date' },
          startDateTo: { type: 'string', format: 'date' },
          endDateFrom: { type: 'string', format: 'date' },
          endDateTo: { type: 'string', format: 'date' },
          minCurrentUses: { type: 'number' },
          maxCurrentUses: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetCouponsQuery }>, reply: FastifyReply) => {
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
        query.normalizedDescription = { 
          $regex: filters.description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), 
          $options: 'i' 
        };
      }

      // Filtros exatos
      if (filters.origin) query.origin = filters.origin;
      if (filters.associatedInfluencer) query.associatedInfluencer = filters.associatedInfluencer;
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
      if (filters.minOrderValue !== undefined) {
        query.minimumOrderValue = { $gte: filters.minOrderValue };
      }
      if (filters.minCurrentUses !== undefined || filters.maxCurrentUses !== undefined) {
        query.currentUses = {};
        if (filters.minCurrentUses !== undefined) query.currentUses.$gte = filters.minCurrentUses;
        if (filters.maxCurrentUses !== undefined) query.currentUses.$lte = filters.maxCurrentUses;
      }

      // Filtros de data
      if (filters.startDateFrom || filters.startDateTo) {
        query.startDate = {};
        if (filters.startDateFrom) query.startDate.$gte = new Date(filters.startDateFrom);
        if (filters.startDateTo) {
          const endDate = new Date(filters.startDateTo);
          endDate.setHours(23, 59, 59, 999);
          query.startDate.$lte = endDate;
        }
      }
      if (filters.endDateFrom || filters.endDateTo) {
        query.endDate = {};
        if (filters.endDateFrom) query.endDate.$gte = new Date(filters.endDateFrom);
        if (filters.endDateTo) {
          const endDate = new Date(filters.endDateTo);
          endDate.setHours(23, 59, 59, 999);
          query.endDate.$lte = endDate;
        }
      }

      // Se usuário é influencer, força ver apenas seus cupons
      if (request.user!.role === 'influencer') {
        query.associatedInfluencer = (request.user as any)!._id;
      }

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query
      const [coupons, total] = await Promise.all([
        Coupon.find(query)
          .populate('associatedInfluencer', 'id name email')
          .populate('exceptions.excludedCategories', 'name')
          .populate('exceptions.excludedProducts', 'name')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Coupon.countDocuments(query)
      ]);

      // Aplicar filtro de campos baseado nas permissões
      const filteredCoupons = request.permissionFilter ? coupons.map(request.permissionFilter) : coupons;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredCoupons,
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
      return customReply.erro('Erro ao listar cupons', 500);
    }
  });

  /**
   * GET /api/coupons/:id
   * Busca um cupom específico
   */
  fastify.get<{ Params: GetCouponParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Coupon')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCouponParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const coupon = await Coupon.findById(request.params.id)
        .populate('associatedInfluencer', 'id name email')
        .populate('exceptions.excludedCategories', 'name')
        .populate('exceptions.excludedProducts', 'name')
        .lean();
      
      if (!coupon) {
        return customReply.erro('Cupom não encontrado', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCoupon = request.permissionFilter ? request.permissionFilter(coupon) : coupon;

      return customReply.sucesso(filteredCoupon);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar cupom', 500);
    }
  });

  /**
   * GET /api/coupons/code/:code
   * Busca um cupom pelo código
   */
  fastify.get<{ Params: { code: string } }>('/code/:code', {
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
      const coupon = await Coupon.findOne({ code: request.params.code.toUpperCase() })
        .populate('associatedInfluencer', 'id name email')
        .populate('exceptions.excludedCategories', 'name')
        .populate('exceptions.excludedProducts', 'name')
        .lean();
      
      if (!coupon) {
        return customReply.erro('Cupom não encontrado', 404);
      }

      // Verificar permissões
      if (request.user!.role === 'influencer' && 
          coupon.associatedInfluencer && 
          typeof coupon.associatedInfluencer === 'object' &&
          (coupon.associatedInfluencer as any)._id.toString() !== (request.user as any)!._id.toString()) {
        return customReply.erro('Sem permissão para visualizar este cupom', 403);
      }

      return customReply.sucesso(coupon);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar cupom', 500);
    }
  });

  /**
   * POST /api/coupons
   * Cria um novo cupom
   */
  fastify.post<{ Body: CreateCouponBody }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Coupon'), aplicarHooks('Coupon', 'create')],
    schema: {
      body: {
        type: 'object',
        required: ['origin', 'code', 'description', 'startDate', 'endDate', 'discountType', 'discountValue'],
        properties: {
          origin: { type: 'string', enum: ['all', 'organic', 'trafficPaid'] },
          associatedInfluencer: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          code: { type: 'string', minLength: 3, maxLength: 20 },
          description: { type: 'string', minLength: 5, maxLength: 200 },
          maxUses: { type: 'number', minimum: 1 },
          minimumOrderValue: { type: 'number', minimum: 0 },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          discountType: { type: 'string', enum: ['percentual', 'fixed'] },
          discountValue: { type: 'number', minimum: 0 },
          minItemQuantity: { type: 'number', minimum: 1 },
          freeShipping: { type: 'boolean' },
          oneTimePerUser: { type: 'boolean' },
          exceptions: {
            type: 'object',
            properties: {
              excludedCategories: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
              excludedProducts: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }
            }
          },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateCouponBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const couponData = {
        ...(hookCtx?.data || request.body),
        createdBy: (request.user as any)!._id,
        updatedBy: (request.user as any)!._id
      };

      // Criar cupom
      const coupon = new Coupon(couponData);
      await coupon.save();

      // Buscar cupom criado para retornar com virtuals e populações
      const createdCoupon = await Coupon.findById(coupon._id)
        .populate('associatedInfluencer', 'id name email')
        .populate('exceptions.excludedCategories', 'name')
        .populate('exceptions.excludedProducts', 'name')
        .lean();

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(createdCoupon);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCoupon = request.permissionFilter ? request.permissionFilter(createdCoupon) : createdCoupon;

      return customReply.sucesso(filteredCoupon, 'Cupom criado com sucesso');

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
      
      return customReply.erro('Erro ao criar cupom', 500);
    }
  });

  /**
   * PUT /api/coupons/:id
   * Atualiza um cupom
   */
  fastify.put<{ Params: GetCouponParams; Body: UpdateCouponBody }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Coupon'), aplicarHooks('Coupon', 'update')],
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
          origin: { type: 'string', enum: ['all', 'organic', 'trafficPaid'] },
          associatedInfluencer: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          code: { type: 'string', minLength: 3, maxLength: 20 },
          description: { type: 'string', minLength: 5, maxLength: 200 },
          maxUses: { type: 'number', minimum: 1 },
          minimumOrderValue: { type: 'number', minimum: 0 },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          discountType: { type: 'string', enum: ['percentual', 'fixed'] },
          discountValue: { type: 'number', minimum: 0 },
          minItemQuantity: { type: 'number', minimum: 1 },
          freeShipping: { type: 'boolean' },
          oneTimePerUser: { type: 'boolean' },
          exceptions: {
            type: 'object',
            properties: {
              excludedCategories: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
              excludedProducts: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }
            }
          },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCouponParams; Body: UpdateCouponBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = {
        ...(hookCtx?.data || request.body),
        updatedBy: (request.user as any)!._id
      };

      // Atualizar cupom
      const coupon = await Coupon.findByIdAndUpdate(
        request.params.id,
        updateData,
        { new: true, runValidators: true }
      ).populate('associatedInfluencer', 'id name email')
       .populate('exceptions.excludedCategories', 'name')
       .populate('exceptions.excludedProducts', 'name')
       .lean();

      if (!coupon) {
        return customReply.erro('Cupom não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(coupon);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCoupon = request.permissionFilter ? request.permissionFilter(coupon) : coupon;

      return customReply.sucesso(filteredCoupon, 'Cupom atualizado com sucesso');

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
      
      return customReply.erro('Erro ao atualizar cupom', 500);
    }
  });

  /**
   * DELETE /api/coupons/:id
   * Remove um cupom
   */
  fastify.delete<{ Params: GetCouponParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Coupon'), aplicarHooks('Coupon', 'delete')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCouponParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const coupon = await Coupon.findByIdAndDelete(request.params.id);
      
      if (!coupon) {
        return customReply.erro('Cupom não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(coupon);
      }

      return customReply.sucesso(null, 'Cupom removido com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao remover cupom', 500);
    }
  });

  /**
   * PATCH /api/coupons/:id/toggle-status
   * Ativa/desativa um cupom
   */
  fastify.patch<{ Params: GetCouponParams }>('/:id/toggle-status', {
    preHandler: [authenticateJWT],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCouponParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (request.user!.role === 'influencer') {
        return customReply.erro('Sem permissão para alterar status de cupons', 403);
      }

      const coupon = await Coupon.findById(request.params.id);
      
      if (!coupon) {
        return customReply.erro('Cupom não encontrado', 404);
      }

      // Toggle status
      coupon.isActive = !coupon.isActive;
      coupon.updatedBy = (request.user as any)!._id;
      await coupon.save();

      return customReply.sucesso(
        { isActive: coupon.isActive }, 
        `Cupom ${coupon.isActive ? 'ativado' : 'desativado'} com sucesso`
      );

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao alterar status do cupom', 500);
    }
  });

  /**
   * GET /api/coupons/search/influencers
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
   * GET /api/coupons/search/niches
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
   * GET /api/coupons/search/categories
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
   * GET /api/coupons/search/products
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
