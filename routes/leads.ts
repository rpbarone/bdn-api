import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Lead, { ILead } from '../models/Lead';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';
import User from '../models/User';

interface GetLeadsQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  search?: string; // Busca geral por nome, username, email, telefone ou id
  name?: string;
  currentStage?: string;
  instagramUsername?: string;
  phone?: string;
  indicatedBy?: string;
  adminReviewStatus?: 'pending' | 'approved' | 'rejected';
  assignedLevel?: number;
  minFollowers?: number;
  maxFollowers?: number;
  minEngagement?: number;
  maxEngagement?: number;
  aiApproved?: boolean;
  niches?: string;
  city?: string;
  uf?: string;
  region?: string;
  createdFrom?: string;
  createdTo?: string;
  reviewedFrom?: string;
  reviewedTo?: string;
  reviewedBy?: string;
}

interface GetLeadParams {
  id: string;
}

interface UpdateLeadReviewBody {
  adminReview: {
    status?: 'pending' | 'approved' | 'rejected';
    assignedLevel?: 1 | 2 | 3 | 4;
    notes?: string;
  };
  currentStage?: string;
}

export default async function leadRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/leads/stats
   * Retorna estatísticas sobre leads
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['Leads'],
        summary: 'Obter estatísticas de leads',
        description: 'Endpoint para admin+ obter estatísticas sobre leads'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (!['admin', 'super_admin'].includes(request.user!.role)) {
        return customReply.erro('Acesso negado: apenas admin+ pode acessar estas estatísticas', 403);
      }

      // Obter início e fim do dia de hoje (horário de Brasília)
      const today = new Date();
      today.setHours(today.getHours() - 3); // UTC-3 para Brasília
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      // Executar queries agregadas
      const [totalLeads, pendingReview, approved, rejected, approvedToday, rejectedToday, byStage, byLevel] = await Promise.all([
        // Total de leads
        Lead.countDocuments(),
        
        // Leads aguardando aprovação (currentStage = 'Aguardando Aprovação')
        Lead.countDocuments({ currentStage: 'Aguardando Aprovação' }),
        
        // Leads aprovados (total)
        Lead.countDocuments({ currentStage: 'Aprovado' }),
        
        // Leads rejeitados (total)
        Lead.countDocuments({ currentStage: 'Reprovado' }),
        
        // Leads aprovados hoje
        Lead.countDocuments({ 
          currentStage: 'Aprovado',
          'adminReview.reviewedAt': { $gte: startOfDay, $lte: endOfDay }
        }),
        
        // Leads rejeitados hoje
        Lead.countDocuments({ 
          currentStage: 'Reprovado',
          'adminReview.reviewedAt': { $gte: startOfDay, $lte: endOfDay }
        }),
        
        // Quantidade por stage
        Lead.aggregate([
          { $group: { _id: '$currentStage', count: { $sum: 1 } } }
        ]),
        
        // Quantidade por nível (apenas aprovados)
        Lead.aggregate([
          { $match: { currentStage: 'Aprovado' } },
          { $group: { _id: '$adminReview.assignedLevel', count: { $sum: 1 } } }
        ])
      ]);

      // Formatar resultados
      const stageStats = byStage.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const levelStats = byLevel.reduce((acc: any, curr: any) => {
        acc[curr._id || 'sem_nivel'] = curr.count;
        return acc;
      }, {});

      const statistics = {
        total: totalLeads,
        aguardandoAprovacao: pendingReview,
        aprovados: {
          total: approved,
          hoje: approvedToday
        },
        reprovados: {
          total: rejected,
          hoje: rejectedToday
        },
        porStage: stageStats,
        porNivel: levelStats,
        taxaAprovacao: totalLeads > 0 ? ((approved / totalLeads) * 100).toFixed(2) + '%' : '0%',
        taxaRejeicao: totalLeads > 0 ? ((rejected / totalLeads) * 100).toFixed(2) + '%' : '0%'
      };

      return customReply.sucesso(statistics, 'Estatísticas de leads obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/leads
   * Lista todos os leads com paginação e filtros
   */
  fastify.get<{ Querystring: GetLeadsQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Lead')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          search: { type: 'string' },
          name: { type: 'string' },
          currentStage: { type: 'string', enum: ['Indicação', 'Captura', 'Análise Pendente', 'Análise OK', 'Benefícios', 'Potencial', 'Vaga', 'Cadastro Pendente', 'Aguardando Aprovação', 'Aprovado', 'Reprovado'] },
          instagramUsername: { type: 'string' },
          phone: { type: 'string' },
          indicatedBy: { type: 'string' },
          adminReviewStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          assignedLevel: { type: 'number', enum: [1, 2, 3, 4] },
          minFollowers: { type: 'number' },
          maxFollowers: { type: 'number' },
          minEngagement: { type: 'number' },
          maxEngagement: { type: 'number' },
          aiApproved: { type: 'boolean' },
          niches: { type: 'string' },
          city: { type: 'string' },
          uf: { type: 'string' },
          region: { type: 'string' },
          createdFrom: { type: 'string', format: 'date' },
          createdTo: { type: 'string', format: 'date' },
          reviewedFrom: { type: 'string', format: 'date' },
          reviewedTo: { type: 'string', format: 'date' },
          reviewedBy: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetLeadsQuery }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search,
        ...filters
      } = request.query;

      // Construir query
      const query: any = {};

      // Busca geral (nome, username, email, telefone ou id)
      if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        const orConditions: any[] = [
          { normalizedName: searchRegex },
          { instagramUsername: searchRegex },
          { phone: { $regex: search.replace(/\D/g, ''), $options: 'i' } },
          { id: searchRegex }
        ];
        
        // Verificar se é um email válido
        if (search.includes('@')) {
          // Buscar usuário com esse email primeiro
          const userWithEmail = await User.findOne({ email: search.toLowerCase() });
          if (userWithEmail) {
            orConditions.push({ indicatedBy: userWithEmail._id });
          }
        }
        
        query.$or = orConditions;
      }

      // Filtros de texto (busca parcial case-insensitive)
      if (filters.name) {
        query.normalizedName = { $regex: filters.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), $options: 'i' };
      }
      if (filters.instagramUsername) {
        query.instagramUsername = { $regex: filters.instagramUsername, $options: 'i' };
      }
      if (filters.phone) {
        query.phone = { $regex: filters.phone.replace(/\D/g, ''), $options: 'i' };
      }
      if (filters.city) {
        query['location.city'] = { $regex: filters.city, $options: 'i' };
      }
      if (filters.uf) {
        query['location.uf'] = filters.uf.toUpperCase();
      }
      if (filters.region) {
        query['location.region'] = { $regex: filters.region, $options: 'i' };
      }

      // Filtros exatos
      if (filters.currentStage) query.currentStage = filters.currentStage;
      if (filters.indicatedBy) query.indicatedBy = filters.indicatedBy;
      if (filters.adminReviewStatus) query['adminReview.status'] = filters.adminReviewStatus;
      if (filters.assignedLevel) query['adminReview.assignedLevel'] = filters.assignedLevel;
      if (filters.aiApproved !== undefined) query['aiAnalysis.approved'] = filters.aiApproved;
      if (filters.reviewedBy) query['adminReview.reviewedBy'] = filters.reviewedBy;

      // Filtros de range numérico
      if (filters.minFollowers !== undefined || filters.maxFollowers !== undefined) {
        query.followers = {};
        if (filters.minFollowers !== undefined) query.followers.$gte = filters.minFollowers;
        if (filters.maxFollowers !== undefined) query.followers.$lte = filters.maxFollowers;
      }
      if (filters.minEngagement !== undefined || filters.maxEngagement !== undefined) {
        query.engagement = {};
        if (filters.minEngagement !== undefined) query.engagement.$gte = filters.minEngagement;
        if (filters.maxEngagement !== undefined) query.engagement.$lte = filters.maxEngagement;
      }

      // Filtro de nicho (array)
      if (filters.niches) {
        query.niches = { $in: [filters.niches] };
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

      // Filtro de período de revisão
      if (filters.reviewedFrom || filters.reviewedTo) {
        query['adminReview.reviewedAt'] = {};
        if (filters.reviewedFrom) {
          query['adminReview.reviewedAt'].$gte = new Date(filters.reviewedFrom);
        }
        if (filters.reviewedTo) {
          const endDate = new Date(filters.reviewedTo);
          endDate.setHours(23, 59, 59, 999);
          query['adminReview.reviewedAt'].$lte = endDate;
        }
      }

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query
      const [leads, total] = await Promise.all([
        Lead.find(query)
          .populate('indicatedBy', 'name email id')
          .populate('adminReview.reviewedBy', 'name email')
          .populate('niches', 'name')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Lead.countDocuments(query)
      ]);

      // Adicionar ID do influencer se o lead foi convertido
      const leadsWithInfluencerId = await Promise.all(leads.map(async (lead: any) => {
        // Buscar se existe usuário com leadId = lead._id
        const influencer = await User.findOne({ leadId: lead._id.toString() }, { id: 1 }).lean();
        
        return {
          ...lead,
          influencerId: influencer?.id || null,
          preApprovedAI: lead.aiAnalysis?.approved || false,
          preApprovedAILevel: lead.aiAnalysis?.level || null,
          adminReviewStatus: lead.adminReview?.status || 'pending',
          assignedLevel: lead.adminReview?.assignedLevel || null,
          stateUF: lead.location?.uf || null
        };
      }));

      // Aplicar filtro de campos baseado nas permissões
      const filteredLeads = request.permissionFilter ? leadsWithInfluencerId.map(request.permissionFilter) : leadsWithInfluencerId;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredLeads,
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
      return customReply.erro('Erro ao listar leads', 500);
    }
  });

  /**
   * GET /api/leads/:id
   * Busca um lead específico por ID MongoDB ou ID amigável
   */
  fastify.get<{ Params: GetLeadParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Lead')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetLeadParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é um ID MongoDB válido ou ID amigável
      let lead;
      if (/^[0-9a-fA-F]{24}$/.test(request.params.id)) {
        // É um MongoDB ID
        lead = await Lead.findById(request.params.id)
          .populate('indicatedBy', 'name email id')
          .populate('adminReview.reviewedBy', 'name email')
          .populate('niches', 'name')
          .lean();
      } else if (/^LD\d{4,}$/.test(request.params.id)) {
        // É um ID amigável
        lead = await Lead.findOne({ id: request.params.id })
          .populate('indicatedBy', 'name email id')
          .populate('adminReview.reviewedBy', 'name email')
          .populate('niches', 'name')
          .lean();
      } else {
        return customReply.erro('ID inválido', 400);
      }
      
      if (!lead) {
        return customReply.erro('Lead não encontrado', 404);
      }

      // Buscar se existe usuário com leadId = lead._id
      const influencer = await User.findOne({ leadId: lead._id.toString() }, { id: 1 }).lean();
      const leadWithInfluencerId = {
        ...lead,
        influencerId: influencer?.id || null,
        preApprovedAI: lead.aiAnalysis?.approved || false,
        preApprovedAILevel: lead.aiAnalysis?.level || null,
        adminReviewStatus: lead.adminReview?.status || 'pending',
        assignedLevel: lead.adminReview?.assignedLevel || null,
        stateUF: lead.location?.uf || null
      };

      // Aplicar filtro de campos baseado nas permissões
      const filteredLead = request.permissionFilter ? request.permissionFilter(leadWithInfluencerId) : leadWithInfluencerId;

      return customReply.sucesso(filteredLead);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar lead', 500);
    }
  });

  /**
   * PUT /api/leads/:id/review
   * Atualiza apenas adminReview e currentStage do lead
   */
  fastify.put<{ Params: GetLeadParams; Body: UpdateLeadReviewBody }>('/:id/review', {
    preHandler: [authenticateJWT, verificarPermissoes('Lead'), aplicarHooks('Lead', 'update')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          adminReview: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
              assignedLevel: { type: 'number', enum: [1, 2, 3, 4] },
              notes: { type: 'string' }
            }
          },
          currentStage: { type: 'string', enum: ['Indicação', 'Captura', 'Análise Pendente', 'Análise OK', 'Benefícios', 'Potencial', 'Vaga', 'Cadastro Pendente', 'Aguardando Aprovação', 'Aprovado', 'Reprovado'] }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetLeadParams; Body: UpdateLeadReviewBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = hookCtx?.data || request.body;

      // Buscar lead por ID MongoDB ou ID amigável
      let leadFilter;
      if (/^[0-9a-fA-F]{24}$/.test(request.params.id)) {
        leadFilter = { _id: request.params.id };
      } else if (/^LD\d{4,}$/.test(request.params.id)) {
        leadFilter = { id: request.params.id };
      } else {
        return customReply.erro('ID inválido', 400);
      }

      // Se o stage mudou, atualizar histórico
      if (updateData.currentStage) {
        const currentLead = await Lead.findOne(leadFilter);
        if (currentLead && currentLead.currentStage !== updateData.currentStage) {
          // Atualizar tempo no stage anterior
          const lastStageIndex = currentLead.stageHistory.length - 1;
          if (lastStageIndex >= 0) {
            const lastStage = currentLead.stageHistory[lastStageIndex];
            const timeSpent = Math.floor((Date.now() - lastStage.enteredAt.getTime()) / 1000);
            
            await Lead.findOneAndUpdate(leadFilter, {
              $set: {
                [`stageHistory.${lastStageIndex}.timeSpentSeconds`]: lastStage.timeSpentSeconds + timeSpent
              }
            });
          }
          
          // Adicionar novo stage ao histórico
          await Lead.findOneAndUpdate(leadFilter, {
            $push: {
              stageHistory: {
                stage: updateData.currentStage,
                enteredAt: new Date(),
                timeSpentSeconds: 0,
                viewCount: 0
              }
            }
          });
        }
      }

      // Atualizar lead
      const lead = await Lead.findOneAndUpdate(
        leadFilter,
        updateData,
        { new: true, runValidators: true }
      )
        .populate('indicatedBy', 'name email id')
        .populate('adminReview.reviewedBy', 'name email')
        .populate('niches', 'name')
        .lean();

      if (!lead) {
        return customReply.erro('Lead não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(lead);
      }

      // Buscar se existe usuário com leadId = lead._id
      const influencer = await User.findOne({ leadId: lead._id.toString() }, { id: 1 }).lean();
      const leadWithInfluencerId = {
        ...lead,
        influencerId: influencer?.id || null,
        preApprovedAI: lead.aiAnalysis?.approved || false,
        preApprovedAILevel: lead.aiAnalysis?.level || null,
        adminReviewStatus: lead.adminReview?.status || 'pending',
        assignedLevel: lead.adminReview?.assignedLevel || null,
        stateUF: lead.location?.uf || null
      };

      // Aplicar filtro de campos baseado nas permissões
      const filteredLead = request.permissionFilter ? request.permissionFilter(leadWithInfluencerId) : leadWithInfluencerId;

      return customReply.sucesso(filteredLead, 'Lead atualizado com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      
      // Erros de validação do Mongoose
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err: any) => err.message);
        return customReply.erro(errors.join(', '), 400);
      }
      
      return customReply.erro('Erro ao atualizar lead', 500);
    }
  });

  /**
   * PUT /api/leads/:id/stage-view
   * Atualiza visualização do stage atual
   */
  fastify.put<{ Params: GetLeadParams }>('/:id/stage-view', {
    preHandler: [authenticateJWT],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetLeadParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (!['admin', 'super_admin'].includes(request.user!.role)) {
        return customReply.erro('Acesso negado: apenas admin+ pode atualizar visualizações', 403);
      }

      // Buscar lead por ID MongoDB ou ID amigável
      let lead;
      if (/^[0-9a-fA-F]{24}$/.test(request.params.id)) {
        lead = await Lead.findById(request.params.id);
      } else if (/^LD\d{4,}$/.test(request.params.id)) {
        lead = await Lead.findOne({ id: request.params.id });
      } else {
        return customReply.erro('ID inválido', 400);
      }
      
      if (!lead) {
        return customReply.erro('Lead não encontrado', 404);
      }

      // Atualizar visualização do stage atual
      const lastStageIndex = lead.stageHistory.length - 1;
      if (lastStageIndex >= 0) {
        const now = new Date();
        
        const leadFilter = /^[0-9a-fA-F]{24}$/.test(request.params.id) 
          ? { _id: request.params.id } 
          : { id: request.params.id };
        
        await Lead.findOneAndUpdate(leadFilter, {
          $set: {
            [`stageHistory.${lastStageIndex}.lastViewedDate`]: now
          },
          $inc: {
            [`stageHistory.${lastStageIndex}.viewCount`]: 1
          }
        });
      }

      return customReply.sucesso(null, 'Visualização registrada com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao registrar visualização', 500);
    }
  });
}
