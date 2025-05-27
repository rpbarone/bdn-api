import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Customer, { ICustomer } from '../models/Customer';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetCustomersQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  minTotalSpent?: number;
  maxTotalSpent?: number;
  minAverageTicket?: number;
  maxAverageTicket?: number;
  hasOrders?: boolean;
  tags?: string;
  createdFrom?: string;
  createdTo?: string;
}

interface GetCustomerParams {
  id: string;
}

interface AddNoteBody {
  content: string;
}

interface UpdateTagsBody {
  tags: string[];
}

interface CustomerListItem {
  _id: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  contato: string; // Email + telefone formatado
  createdAt: Date;
  registradoEm: string; // Data formatada
  lastActivity: string;
  pedidosGastoTotal: string; // "3 pedidos / R$ 620,80"
  tags: string[];
  notes: any[];
}

export default async function customerRoutes(fastify: FastifyInstance) {
  /**
   * IMPORTANTE: Customers são read-only com exceção de notes e tags
   * - Não é possível criar customers (vêm de sistema externo)
   * - Não é possível deletar customers
   * - Apenas notes e tags podem ser atualizados
   */

  /**
   * GET /api/customers/stats
   * Retorna estatísticas sobre customers
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT, verificarPermissoes('Customer')],
    config: {
      swagger: {
        tags: ['Customers'],
        summary: 'Obter estatísticas de customers',
        description: 'Endpoint para obter estatísticas gerais sobre customers'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Data de 30 dias atrás
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Executar queries agregadas
      const [
        totalCustomers,
        newCustomersLastMonth,
        ltvStats,
        tagStats,
        withOrders
      ] = await Promise.all([
        // Total de customers
        Customer.countDocuments(),
        
        // Novos customers no último mês
        Customer.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
        
        // LTV médio (Life Time Value = média do totalSpent)
        Customer.aggregate([
          { $match: { 'financials.totalSpent': { $gt: 0 } } },
          {
            $group: {
              _id: null,
              avgLTV: { $avg: '$financials.totalSpent' },
              totalRevenue: { $sum: '$financials.totalSpent' }
            }
          }
        ]),
        
        // Tag mais comum
        Customer.aggregate([
          { $unwind: '$tags' },
          { $group: { _id: '$tags', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]),
        
        // Customers com pedidos
        Customer.countDocuments({ 'orders.0': { $exists: true } })
      ]);

      // Formatar tags
      const tagDistribution = tagStats.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const statistics = {
        totalClientes: totalCustomers,
        novosUltimoMes: newCustomersLastMonth,
        ltvMedio: ltvStats[0]?.avgLTV || 0,
        receitaTotal: ltvStats[0]?.totalRevenue || 0,
        tagMaisComum: tagStats[0]?._id || 'Nenhuma',
        distribuicaoTags: tagDistribution,
        clientesComPedidos: withOrders,
        clientesSemPedidos: totalCustomers - withOrders,
        percentualComPedidos: totalCustomers > 0 ? ((withOrders / totalCustomers) * 100).toFixed(2) + '%' : '0%'
      };

      return customReply.sucesso(statistics, 'Estatísticas de customers obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/customers
   * Lista todos os customers com paginação e filtros
   */
  fastify.get<{ Querystring: GetCustomersQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Customer')],
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
          phone: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          minTotalSpent: { type: 'number' },
          maxTotalSpent: { type: 'number' },
          minAverageTicket: { type: 'number' },
          maxAverageTicket: { type: 'number' },
          hasOrders: { type: 'boolean' },
          tags: { type: 'string' },
          createdFrom: { type: 'string', format: 'date' },
          createdTo: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetCustomersQuery }>, reply: FastifyReply) => {
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
      if (filters.phone) {
        query.phone = { $regex: filters.phone.replace(/\D/g, ''), $options: 'i' };
      }
      if (filters.city) {
        query['address.city'] = { $regex: filters.city, $options: 'i' };
      }
      if (filters.state) {
        query['address.state'] = { $regex: filters.state, $options: 'i' };
      }

      // Filtros de range numérico
      if (filters.minTotalSpent !== undefined || filters.maxTotalSpent !== undefined) {
        query['financials.totalSpent'] = {};
        if (filters.minTotalSpent !== undefined) query['financials.totalSpent'].$gte = filters.minTotalSpent;
        if (filters.maxTotalSpent !== undefined) query['financials.totalSpent'].$lte = filters.maxTotalSpent;
      }
      if (filters.minAverageTicket !== undefined || filters.maxAverageTicket !== undefined) {
        query['financials.averageTicket'] = {};
        if (filters.minAverageTicket !== undefined) query['financials.averageTicket'].$gte = filters.minAverageTicket;
        if (filters.maxAverageTicket !== undefined) query['financials.averageTicket'].$lte = filters.maxAverageTicket;
      }

      // Filtro de pedidos
      if (filters.hasOrders !== undefined) {
        if (filters.hasOrders) {
          query['orders.0'] = { $exists: true };
        } else {
          query.orders = { $size: 0 };
        }
      }

      // Filtro de tags
      if (filters.tags) {
        query.tags = { $in: [filters.tags] };
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

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query
      const [customers, total] = await Promise.all([
        Customer.find(query)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .populate('notes.createdBy', 'name')
          .lean(),
        Customer.countDocuments(query)
      ]);

      // Formatar dados para corresponder à tabela
      const formattedCustomers: CustomerListItem[] = customers.map(customer => {
        // Calcular "última atividade" (baseado no último pedido ou criação)
        const now = new Date();
        const createdDate = new Date(customer.createdAt);
        const monthsAgo = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        
        let lastActivity = '';
        if (monthsAgo === 0) {
          lastActivity = 'Este mês';
        } else if (monthsAgo === 1) {
          lastActivity = '1 mês atrás';
        } else {
          lastActivity = `${monthsAgo} meses atrás`;
        }

        // Formatar contato
        const contato = customer.email + (customer.phone ? `\n${customer.phone}` : '');

        // Formatar data de registro
        const registradoEm = new Date(customer.createdAt).toLocaleDateString('pt-BR');

        // Formatar pedidos/gasto total
        const ordersCount = customer.orders?.length || 0;
        const totalSpent = customer.financials?.totalSpent || 0;
        const pedidosText = `${ordersCount} ${ordersCount === 1 ? 'pedido' : 'pedidos'}`;
        const totalText = totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const pedidosGastoTotal = `${pedidosText}\n${totalText}`;

        return {
          _id: customer._id.toString(),
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone || '',
          contato: contato,
          createdAt: customer.createdAt,
          registradoEm: registradoEm,
          lastActivity: lastActivity,
          pedidosGastoTotal: pedidosGastoTotal,
          tags: customer.tags || [],
          notes: customer.notes || []
        };
      });

      // Aplicar filtro de campos baseado nas permissões
      const filteredCustomers = request.permissionFilter ? formattedCustomers.map(request.permissionFilter) : formattedCustomers;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredCustomers,
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
      return customReply.erro('Erro ao listar customers', 500);
    }
  });

  /**
   * GET /api/customers/:id
   * Busca um customer específico
   */
  fastify.get<{ Params: GetCustomerParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Customer')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCustomerParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const customer = await Customer.findById(request.params.id)
        .populate('notes.createdBy', 'name')
        .populate('orders')
        .lean();
      
      if (!customer) {
        return customReply.erro('Customer não encontrado', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCustomer = request.permissionFilter ? request.permissionFilter(customer) : customer;

      return customReply.sucesso(filteredCustomer);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar customer', 500);
    }
  });

  /**
   * POST /api/customers/:id/notes
   * Adiciona uma nota a um customer
   */
  fastify.post<{ Params: GetCustomerParams; Body: AddNoteBody }>('/:id/notes', {
    preHandler: [authenticateJWT, verificarPermissoes('Customer'), aplicarHooks('Customer', 'addNote')],
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
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 1000 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCustomerParams; Body: AddNoteBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const customer = await Customer.findById(request.params.id);
      
      if (!customer) {
        return customReply.erro('Customer não encontrado', 404);
      }

      // Adicionar nota
      const newNote = {
        content: request.body.content,
        createdBy: (request.user as any)!._id,
        createdAt: new Date()
      };

      customer.notes = customer.notes || [];
      customer.notes.push(newNote as any);
      await customer.save();

      // Buscar customer atualizado com populate
      const updatedCustomer = await Customer.findById(customer._id)
        .populate('notes.createdBy', 'name')
        .lean();

      // Aplicar filtro de campos baseado nas permissões
      const filteredCustomer = request.permissionFilter ? request.permissionFilter(updatedCustomer) : updatedCustomer;

      return customReply.sucesso(filteredCustomer, 'Nota adicionada com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao adicionar nota', 500);
    }
  });

  /**
   * PUT /api/customers/:id/tags
   * Atualiza as tags de um customer
   */
  fastify.put<{ Params: GetCustomerParams; Body: UpdateTagsBody }>('/:id/tags', {
    preHandler: [authenticateJWT, verificarPermissoes('Customer'), aplicarHooks('Customer', 'update')],
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
        required: ['tags'],
        properties: {
          tags: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Frequente', 'Novo', 'VIP', 'Ativo', 'Inativo', 'Lead']
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetCustomerParams; Body: UpdateTagsBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = hookCtx?.data || request.body;

      // Atualizar customer
      const customer = await Customer.findByIdAndUpdate(
        request.params.id,
        { tags: updateData.tags },
        { new: true, runValidators: true }
      ).lean();

      if (!customer) {
        return customReply.erro('Customer não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(customer);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredCustomer = request.permissionFilter ? request.permissionFilter(customer) : customer;

      return customReply.sucesso(filteredCustomer, 'Tags atualizadas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      
      // Erros de validação do Mongoose
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err: any) => err.message);
        return customReply.erro(errors.join(', '), 400);
      }
      
      return customReply.erro('Erro ao atualizar tags', 500);
    }
  });
}
