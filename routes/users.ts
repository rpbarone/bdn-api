import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import User, { IUser } from '../models/User';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetUsersQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  level?: number;
  minBodyCoins?: number;
  maxBodyCoins?: number;
  minRankingPoints?: number;
  maxRankingPoints?: number;
  gender?: string;
  cpf?: string;
  phone?: string;
  hasReviewedApp?: boolean;
  twoFactorEnabled?: boolean;
  referredBy?: string;
  niche?: string;
  city?: string;
  state?: string;
  createdFrom?: string;
  createdTo?: string;
}

interface GetUserParams {
  id: string;
}

interface CreateUserBody {
  name: string;
  email: string;
  password: string;
  role?: string;
  profilePicture?: string;
  status?: string;
  deactivationReason?: string;
  level?: number;
  bodyCoins?: number;
  rankingPoints?: number;
  birthDate?: string;
  gender?: string;
  cpf?: string;
  rg?: string;
  phone?: string;
  social?: {
    instagram?: string;
    tiktok?: string;
    xtwitter?: string;
    youtube?: string;
    facebook?: string;
  };
  bankInfo?: {
    code?: string;
    name?: string;
    agency?: string;
    accountNumber?: string;
    pixType?: 'cpf' | 'email' | 'phone' | 'random';
    pixKey?: string;
  };
  address?: {
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  coupons?: {
    organicCode?: string;
    trafficPaidCode?: string;
  };
  hasReviewedApp?: boolean;
  onboarding?: {
    isCourseCompleted?: boolean;
    whatsappGroupMember?: boolean;
    isProfileCompleted?: boolean;
  };
  referredBy?: string;
  leadId?: string;
  approvalDate?: string;
  niches?: string[];
}

interface UpdateUserBody extends Partial<CreateUserBody> {}

export default async function userRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/users/stats/admins
   * Retorna estatísticas sobre admins (apenas para super_admin)
   */
  fastify.get('/stats/admins', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['Users'],
        summary: 'Obter estatísticas de administradores',
        description: 'Endpoint exclusivo para super_admin obter estatísticas sobre administradores'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é super_admin
      if (request.user!.role !== 'super_admin') {
        return customReply.erro('Acesso negado: apenas super_admin pode acessar estas estatísticas', 403);
      }

      // Executar queries agregadas
      const [totalAdmins, activeAdmins, inactiveAdmins, adminsByRole] = await Promise.all([
        // Total de admins (admin + super_admin)
        User.countDocuments({ role: { $in: ['admin', 'super_admin'] } }),
        
        // Admins ativos
        User.countDocuments({ role: { $in: ['admin', 'super_admin'] }, status: 'ativo' }),
        
        // Admins inativos
        User.countDocuments({ role: { $in: ['admin', 'super_admin'] }, status: 'inativo' }),
        
        // Quantidade por role
        User.aggregate([
          { $match: { role: { $in: ['admin', 'super_admin'] } } },
          { $group: { _id: '$role', count: { $sum: 1 } } }
        ])
      ]);

      // Formatar resultado dos roles
      const roleStats = adminsByRole.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const statistics = {
        total: totalAdmins,
        ativos: activeAdmins,
        inativos: inactiveAdmins,
        porRole: {
          admin: roleStats.admin || 0,
          super_admin: roleStats.super_admin || 0
        },
        percentualAtivos: totalAdmins > 0 ? ((activeAdmins / totalAdmins) * 100).toFixed(2) + '%' : '0%',
        percentualInativos: totalAdmins > 0 ? ((inactiveAdmins / totalAdmins) * 100).toFixed(2) + '%' : '0%'
      };

      return customReply.sucesso(statistics, 'Estatísticas de administradores obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/users
   * Lista todos os usuários com paginação e filtros
   */
  fastify.get<{ Querystring: GetUsersQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('User')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['influencer', 'admin', 'super_admin'] },
          status: { type: 'string', enum: ['ativo', 'inativo'] },
          level: { type: 'number', enum: [1, 2, 3, 4] },
          minBodyCoins: { type: 'number' },
          maxBodyCoins: { type: 'number' },
          minRankingPoints: { type: 'number' },
          maxRankingPoints: { type: 'number' },
          gender: { type: 'string' },
          cpf: { type: 'string' },
          phone: { type: 'string' },
          hasReviewedApp: { type: 'boolean' },
          twoFactorEnabled: { type: 'boolean' },
          referredBy: { type: 'string' },
          niche: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          createdFrom: { type: 'string', format: 'date' },
          createdTo: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetUsersQuery }>, reply: FastifyReply) => {
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
      if (filters.name) {
        query.normalizedName = { $regex: filters.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), $options: 'i' };
      }
      if (filters.email) {
        query.email = { $regex: filters.email, $options: 'i' };
      }
      if (filters.gender) {
        query.gender = { $regex: filters.gender, $options: 'i' };
      }
      if (filters.cpf) {
        query.cpf = filters.cpf.replace(/\D/g, '');
      }
      if (filters.phone) {
        query.phone = { $regex: filters.phone.replace(/\D/g, ''), $options: 'i' };
      }
      if (filters.city) {
        query['address.city'] = { $regex: filters.city, $options: 'i' };
      }
      if (filters.state) {
        query['address.state'] = { $regex: filters.state, $options: 'i' };
      }

      // Filtros exatos
      if (filters.role) query.role = filters.role;
      if (filters.status) query.status = filters.status;
      if (filters.level) query.level = filters.level;
      if (filters.hasReviewedApp !== undefined) query.hasReviewedApp = filters.hasReviewedApp;
      if (filters.twoFactorEnabled !== undefined) query.twoFactorEnabled = filters.twoFactorEnabled;
      if (filters.referredBy) query.referredBy = filters.referredBy;

      // Filtros de range numérico
      if (filters.minBodyCoins !== undefined || filters.maxBodyCoins !== undefined) {
        query.bodyCoins = {};
        if (filters.minBodyCoins !== undefined) query.bodyCoins.$gte = filters.minBodyCoins;
        if (filters.maxBodyCoins !== undefined) query.bodyCoins.$lte = filters.maxBodyCoins;
      }
      if (filters.minRankingPoints !== undefined || filters.maxRankingPoints !== undefined) {
        query.rankingPoints = {};
        if (filters.minRankingPoints !== undefined) query.rankingPoints.$gte = filters.minRankingPoints;
        if (filters.maxRankingPoints !== undefined) query.rankingPoints.$lte = filters.maxRankingPoints;
      }

      // Filtro de nicho (array)
      if (filters.niche) {
        query.niches = { $in: [filters.niche] };
      }

      // Filtro de período de criação
      if (filters.createdFrom || filters.createdTo) {
        query.createdAt = {};
        if (filters.createdFrom) {
          query.createdAt.$gte = new Date(filters.createdFrom);
        }
        if (filters.createdTo) {
          const endDate = new Date(filters.createdTo);
          endDate.setHours(23, 59, 59, 999); // Inclui todo o dia final
          query.createdAt.$lte = endDate;
        }
      }

      // Se usuário é admin (não super_admin), força ver apenas influencers
      if (request.user!.role === 'admin') {
        query.role = 'influencer';
      }

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query
      const [users, total] = await Promise.all([
        User.find(query)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(query)
      ]);

      // Aplicar filtro de campos baseado nas permissões
      const filteredUsers = request.permissionFilter ? users.map(request.permissionFilter) : users;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredUsers,
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
      return customReply.erro('Erro ao listar usuários', 500);
    }
  });

  /**
   * GET /api/users/:id
   * Busca um usuário específico
   */
  fastify.get<{ Params: GetUserParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('User')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetUserParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const user = await User.findById(request.params.id).lean();
      
      if (!user) {
        return customReply.erro('Usuário não encontrado', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredUser = request.permissionFilter ? request.permissionFilter(user) : user;

      return customReply.sucesso(filteredUser);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar usuário', 500);
    }
  });

  /**
   * POST /api/users
   * Cria um novo usuário
   */
  fastify.post<{ Body: CreateUserBody }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('User'), aplicarHooks('User', 'create')],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['influencer', 'admin', 'super_admin'] },
          profilePicture: { type: 'string' },
          status: { type: 'string', enum: ['ativo', 'inativo'] },
          deactivationReason: { type: 'string' },
          level: { type: 'number', enum: [1, 2, 3, 4] },
          bodyCoins: { type: 'number', minimum: 0 },
          rankingPoints: { type: 'number', minimum: 0 },
          birthDate: { type: 'string', format: 'date' },
          gender: { type: 'string' },
          cpf: { type: 'string', pattern: '^\\d{11}$' },
          rg: { type: 'string' },
          phone: { type: 'string' },
          social: {
            type: 'object',
            properties: {
              instagram: { type: 'string' },
              tiktok: { type: 'string' },
              xtwitter: { type: 'string' },
              youtube: { type: 'string' },
              facebook: { type: 'string' }
            }
          },
          bankInfo: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              name: { type: 'string' },
              agency: { type: 'string' },
              accountNumber: { type: 'string' },
              pixType: { type: 'string', enum: ['cpf', 'email', 'phone', 'random'] },
              pixKey: { type: 'string' }
            }
          },
          address: {
            type: 'object',
            properties: {
              zipCode: { type: 'string' },
              street: { type: 'string' },
              number: { type: 'string' },
              complement: { type: 'string' },
              neighborhood: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' }
            }
          },
          coupons: {
            type: 'object',
            properties: {
              organicCode: { type: 'string' },
              trafficPaidCode: { type: 'string' }
            }
          },
          hasReviewedApp: { type: 'boolean' },
          onboarding: {
            type: 'object',
            properties: {
              isCourseCompleted: { type: 'boolean' },
              whatsappGroupMember: { type: 'boolean' },
              isProfileCompleted: { type: 'boolean' }
            }
          },
          referredBy: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          leadId: { type: 'string' },
          approvalDate: { type: 'string', format: 'date' },
          niches: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateUserBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const userData = {
        ...(hookCtx?.data || request.body),
        updatedBy: request.user!._id
      };

      // Criar usuário
      const user = new User(userData);
      await user.save();

      // Buscar usuário criado para retornar com virtuals
      const createdUser = await User.findById(user._id).lean();

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(createdUser);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredUser = request.permissionFilter ? request.permissionFilter(createdUser) : createdUser;

      return customReply.sucesso(filteredUser, 'Usuário criado com sucesso');

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
      
      return customReply.erro('Erro ao criar usuário', 500);
    }
  });

  /**
   * PUT /api/users/:id
   * Atualiza um usuário
   */
  fastify.put<{ Params: GetUserParams; Body: UpdateUserBody }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('User'), aplicarHooks('User', 'update')],
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
          name: { type: 'string', minLength: 2, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['influencer', 'admin', 'super_admin'] },
          profilePicture: { type: 'string' },
          status: { type: 'string', enum: ['ativo', 'inativo'] },
          deactivationReason: { type: 'string' },
          level: { type: 'number', enum: [1, 2, 3, 4] },
          bodyCoins: { type: 'number', minimum: 0 },
          rankingPoints: { type: 'number', minimum: 0 },
          birthDate: { type: 'string', format: 'date' },
          gender: { type: 'string' },
          cpf: { type: 'string', pattern: '^\\d{11}$' },
          rg: { type: 'string' },
          phone: { type: 'string' },
          social: {
            type: 'object',
            properties: {
              instagram: { type: 'string' },
              tiktok: { type: 'string' },
              xtwitter: { type: 'string' },
              youtube: { type: 'string' },
              facebook: { type: 'string' }
            }
          },
          bankInfo: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              name: { type: 'string' },
              agency: { type: 'string' },
              accountNumber: { type: 'string' },
              pixType: { type: 'string', enum: ['cpf', 'email', 'phone', 'random'] },
              pixKey: { type: 'string' }
            }
          },
          address: {
            type: 'object',
            properties: {
              zipCode: { type: 'string' },
              street: { type: 'string' },
              number: { type: 'string' },
              complement: { type: 'string' },
              neighborhood: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' }
            }
          },
          coupons: {
            type: 'object',
            properties: {
              organicCode: { type: 'string' },
              trafficPaidCode: { type: 'string' }
            }
          },
          hasReviewedApp: { type: 'boolean' },
          onboarding: {
            type: 'object',
            properties: {
              isCourseCompleted: { type: 'boolean' },
              whatsappGroupMember: { type: 'boolean' },
              isProfileCompleted: { type: 'boolean' }
            }
          },
          referredBy: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          leadId: { type: 'string' },
          approvalDate: { type: 'string', format: 'date' },
          niches: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetUserParams; Body: UpdateUserBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = {
        ...(hookCtx?.data || request.body),
        updatedBy: request.user!._id
      };

      // Atualizar usuário
      const user = await User.findByIdAndUpdate(
        request.params.id,
        updateData,
        { new: true, runValidators: true }
      ).lean();

      if (!user) {
        return customReply.erro('Usuário não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(user);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredUser = request.permissionFilter ? request.permissionFilter(user) : user;

      return customReply.sucesso(filteredUser, 'Usuário atualizado com sucesso');

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
      
      return customReply.erro('Erro ao atualizar usuário', 500);
    }
  });

  /**
   * DELETE /api/users/:id
   * Remove um usuário
   */
  fastify.delete<{ Params: GetUserParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('User'), aplicarHooks('User', 'delete')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetUserParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const user = await User.findByIdAndDelete(request.params.id);
      
      if (!user) {
        return customReply.erro('Usuário não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(user);
      }

      return customReply.sucesso(null, 'Usuário removido com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao remover usuário', 500);
    }
  });
}
