import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Order, { IOrder } from '../models/Order';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetOrdersQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  id?: string;
  type?: 'b2c' | 'b2i';
  asaasId?: string;
  influencerId?: string;
  customerId?: string;
  paymentStatus?: string;
  billingType?: string;
  currentStatus?: string;
  minTotal?: number;
  maxTotal?: number;
  minBodycoins?: number;
  maxBodycoins?: number;
  hasDiscount?: boolean;
  city?: string;
  state?: string;
  createdFrom?: string;
  createdTo?: string;
  invoiceNumber?: string;
  trackingCode?: string;
  wasAbandoned?: boolean;
}

interface GetOrderParams {
  id: string;
}

interface UpdateOrderBody {
  type?: 'b2c' | 'b2i';
  asaasId?: string;
  influencerId?: string;
  customerId?: string;
  payment?: {
    billingType?: 'boleto' | 'credit_card' | 'pix' | 'undefined';
    status?: 'approved' | 'pending' | 'failed' | 'refunded';
    cardLastDigits?: string;
    cardBrand?: string;
    paymentProcessor?: string;
    installments?: number;
    installmentValue?: number;
    paidAt?: Date;
  };
  itens?: Array<{
    productId: string;
    name: string;
    productImageUrl?: string;
    variationId?: string;
    quantity: number;
    priceType: 'bodycoins' | 'cash';
    pricePaid: number;
    equivalentCashPrice?: number;
    costs?: {
      base?: number;
      box?: number;
      labels?: number;
    };
  }>;
  totals?: {
    products?: {
      cash?: number;
      bodycoins?: number;
    };
    shipping?: {
      total?: number;
      paidByCustomer?: number;
      absorbedByCompany?: number;
    };
    discount?: {
      total?: number;
      voucher?: number;
      coupon?: number;
      bodycoins?: number;
    };
    bodycoinsUsage?: {
      amountUsed?: number;
      equivalentCashValue?: number;
    };
    productionCost?: number;
    commission?: number;
    netProfit?: number;
  };
  discount?: {
    type?: 'coupon' | 'voucher';
    typeId?: string;
    code?: string;
    value?: number;
    discountType?: 'percentual' | 'fixed';
    couponType?: 'all' | 'organic' | 'trafficPaid';
    influencerCommissionRate?: number;
  };
  shippingAddress?: {
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  status?: {
    current?: 'order_placed' | 'payment_approved' | 'products_being_picked' | 'invoiced' | 'products_in_transit' | 'delivered' | 'canceled';
  };
  invoice?: {
    number?: string;
    issueDate?: Date;
    series?: string;
    accessKey?: string;
    pdfUrl?: string;
  };
  tracking?: {
    code?: string;
    carrier?: string;
    shippingMethod?: string;
  };
  notes?: Array<{
    content: string;
  }>;
  emailHistory?: Array<{
    subject: string;
    htmlContent: string;
    sentAt?: Date;
    relatedStatus?: string;
    sendTo: string;
  }>;
  previouslyAbandoned?: {
    wasAbandoned?: boolean;
    abandonedCheckoutId?: string;
    abandonedAt?: {
      stage?: 'personal_data' | 'shipping_data' | 'shipping_method' | 'payment';
      timestamp?: Date;
    };
  };
}

export default async function orderRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/orders/stats
   * Retorna estatísticas sobre pedidos (apenas para admin+)
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['Orders'],
        summary: 'Obter estatísticas de pedidos',
        description: 'Endpoint para admin+ obter estatísticas sobre pedidos'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (!['admin', 'super_admin'].includes(request.user!.role)) {
        return customReply.erro('Acesso negado: apenas admin+ pode acessar estas estatísticas', 403);
      }

      // Executar queries agregadas
      const [totalOrders, ordersByType, ordersByStatus, ordersByPaymentStatus, totalRevenue] = await Promise.all([
        // Total de pedidos
        Order.countDocuments(),
        
        // Pedidos por tipo
        Order.aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ]),
        
        // Pedidos por status atual
        Order.aggregate([
          { $group: { _id: '$status.current', count: { $sum: 1 } } }
        ]),
        
        // Pedidos por status de pagamento
        Order.aggregate([
          { $group: { _id: '$payment.status', count: { $sum: 1 } } }
        ]),
        
        // Receita total
        Order.aggregate([
          { $group: { 
            _id: null, 
            totalCash: { $sum: '$totals.products.cash' },
            totalBodycoins: { $sum: '$totals.products.bodycoins' },
            totalShipping: { $sum: '$totals.shipping.paidByCustomer' },
            totalDiscount: { $sum: '$totals.discount.total' }
          }}
        ])
      ]);

      // Formatar resultados
      const typeStats = ordersByType.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const statusStats = ordersByStatus.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const paymentStats = ordersByPaymentStatus.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {});

      const revenue = totalRevenue[0] || { totalCash: 0, totalBodycoins: 0, totalShipping: 0, totalDiscount: 0 };

      const statistics = {
        total: totalOrders,
        porTipo: {
          b2c: typeStats.b2c || 0,
          b2i: typeStats.b2i || 0
        },
        porStatus: {
          order_placed: statusStats.order_placed || 0,
          payment_approved: statusStats.payment_approved || 0,
          products_being_picked: statusStats.products_being_picked || 0,
          invoiced: statusStats.invoiced || 0,
          products_in_transit: statusStats.products_in_transit || 0,
          delivered: statusStats.delivered || 0,
          canceled: statusStats.canceled || 0
        },
        porStatusPagamento: {
          approved: paymentStats.approved || 0,
          pending: paymentStats.pending || 0,
          failed: paymentStats.failed || 0,
          refunded: paymentStats.refunded || 0
        },
        receita: {
          totalProdutosCash: revenue.totalCash,
          totalProdutosBodycoins: revenue.totalBodycoins,
          totalFrete: revenue.totalShipping,
          totalDescontos: revenue.totalDiscount,
          receitaLiquida: revenue.totalCash + revenue.totalShipping - revenue.totalDiscount
        }
      };

      return customReply.sucesso(statistics, 'Estatísticas de pedidos obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/orders
   * Lista todos os pedidos com paginação e filtros
   */
  fastify.get<{ Querystring: GetOrdersQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Order')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          id: { type: 'string' },
          type: { type: 'string', enum: ['b2c', 'b2i'] },
          asaasId: { type: 'string' },
          influencerId: { type: 'string' },
          customerId: { type: 'string' },
          paymentStatus: { type: 'string', enum: ['approved', 'pending', 'failed', 'refunded'] },
          billingType: { type: 'string', enum: ['boleto', 'credit_card', 'pix', 'undefined'] },
          currentStatus: { type: 'string', enum: ['order_placed', 'payment_approved', 'products_being_picked', 'invoiced', 'products_in_transit', 'delivered', 'canceled'] },
          minTotal: { type: 'number' },
          maxTotal: { type: 'number' },
          minBodycoins: { type: 'number' },
          maxBodycoins: { type: 'number' },
          hasDiscount: { type: 'boolean' },
          city: { type: 'string' },
          state: { type: 'string' },
          createdFrom: { type: 'string', format: 'date' },
          createdTo: { type: 'string', format: 'date' },
          invoiceNumber: { type: 'string' },
          trackingCode: { type: 'string' },
          wasAbandoned: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetOrdersQuery }>, reply: FastifyReply) => {
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
      if (filters.id) {
        query.id = { $regex: filters.id, $options: 'i' };
      }
      if (filters.asaasId) {
        query.asaasId = { $regex: filters.asaasId, $options: 'i' };
      }
      if (filters.city) {
        query['shippingAddress.city'] = { $regex: filters.city, $options: 'i' };
      }
      if (filters.state) {
        query['shippingAddress.state'] = { $regex: filters.state, $options: 'i' };
      }
      if (filters.invoiceNumber) {
        query['invoice.number'] = { $regex: filters.invoiceNumber, $options: 'i' };
      }
      if (filters.trackingCode) {
        query['tracking.code'] = { $regex: filters.trackingCode, $options: 'i' };
      }

      // Filtros exatos
      if (filters.type) query.type = filters.type;
      if (filters.influencerId) query.influencerId = filters.influencerId;
      if (filters.customerId) query.customerId = filters.customerId;
      if (filters.paymentStatus) query['payment.status'] = filters.paymentStatus;
      if (filters.billingType) query['payment.billingType'] = filters.billingType;
      if (filters.currentStatus) query['status.current'] = filters.currentStatus;
      if (filters.wasAbandoned !== undefined) query['previouslyAbandoned.wasAbandoned'] = filters.wasAbandoned;

      // Filtros de range numérico
      if (filters.minTotal !== undefined || filters.maxTotal !== undefined) {
        query['totals.products.cash'] = {};
        if (filters.minTotal !== undefined) query['totals.products.cash'].$gte = filters.minTotal;
        if (filters.maxTotal !== undefined) query['totals.products.cash'].$lte = filters.maxTotal;
      }
      if (filters.minBodycoins !== undefined || filters.maxBodycoins !== undefined) {
        query['totals.products.bodycoins'] = {};
        if (filters.minBodycoins !== undefined) query['totals.products.bodycoins'].$gte = filters.minBodycoins;
        if (filters.maxBodycoins !== undefined) query['totals.products.bodycoins'].$lte = filters.maxBodycoins;
      }

      // Filtro de desconto
      if (filters.hasDiscount !== undefined) {
        if (filters.hasDiscount) {
          query['totals.discount.total'] = { $gt: 0 };
        } else {
          query['totals.discount.total'] = { $eq: 0 };
        }
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

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query
      const [orders, total] = await Promise.all([
        Order.find(query)
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .populate('influencerId', 'id name')
          .populate('customerId', 'name email')
          .lean(),
        Order.countDocuments(query)
      ]);

      // Aplicar filtro de campos baseado nas permissões
      const filteredOrders = request.permissionFilter ? orders.map(request.permissionFilter) : orders;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredOrders,
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
      return customReply.erro('Erro ao listar pedidos', 500);
    }
  });

  /**
   * GET /api/orders/:id
   * Busca um pedido específico
   */
  fastify.get<{ Params: GetOrderParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Order')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetOrderParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const order = await Order.findById(request.params.id)
        .populate('influencerId', 'id name')
        .populate('customerId', 'name email')
        .populate('itens.productId', 'name sku')
        .lean();
      
      if (!order) {
        return customReply.erro('Pedido não encontrado', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredOrder = request.permissionFilter ? request.permissionFilter(order) : order;

      return customReply.sucesso(filteredOrder);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar pedido', 500);
    }
  });

  /**
   * PUT /api/orders/:id
   * Atualiza um pedido
   */
  fastify.put<{ Params: GetOrderParams; Body: UpdateOrderBody }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Order'), aplicarHooks('Order', 'update')],
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
          type: { type: 'string', enum: ['b2c', 'b2i'] },
          asaasId: { type: 'string' },
          influencerId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          customerId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          payment: {
            type: 'object',
            properties: {
              billingType: { type: 'string', enum: ['boleto', 'credit_card', 'pix', 'undefined'] },
              status: { type: 'string', enum: ['approved', 'pending', 'failed', 'refunded'] },
              cardLastDigits: { type: 'string' },
              cardBrand: { type: 'string' },
              paymentProcessor: { type: 'string' },
              installments: { type: 'number', minimum: 1 },
              installmentValue: { type: 'number', minimum: 0 },
              paidAt: { type: 'string', format: 'date-time' }
            }
          },
          itens: {
            type: 'array',
            items: {
              type: 'object',
              required: ['productId', 'name', 'quantity', 'priceType', 'pricePaid'],
              properties: {
                productId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
                name: { type: 'string' },
                productImageUrl: { type: 'string' },
                variationId: { type: 'string' },
                quantity: { type: 'number', minimum: 1 },
                priceType: { type: 'string', enum: ['bodycoins', 'cash'] },
                pricePaid: { type: 'number', minimum: 0 },
                equivalentCashPrice: { type: 'number', minimum: 0 },
                costs: {
                  type: 'object',
                  properties: {
                    base: { type: 'number', minimum: 0 },
                    box: { type: 'number', minimum: 0 },
                    labels: { type: 'number', minimum: 0 }
                  }
                }
              }
            }
          },
          totals: {
            type: 'object',
            properties: {
              products: {
                type: 'object',
                properties: {
                  cash: { type: 'number', minimum: 0 },
                  bodycoins: { type: 'number', minimum: 0 }
                }
              },
              shipping: {
                type: 'object',
                properties: {
                  total: { type: 'number', minimum: 0 },
                  paidByCustomer: { type: 'number', minimum: 0 },
                  absorbedByCompany: { type: 'number', minimum: 0 }
                }
              },
              discount: {
                type: 'object',
                properties: {
                  total: { type: 'number', minimum: 0 },
                  voucher: { type: 'number', minimum: 0 },
                  coupon: { type: 'number', minimum: 0 },
                  bodycoins: { type: 'number', minimum: 0 }
                }
              },
              bodycoinsUsage: {
                type: 'object',
                properties: {
                  amountUsed: { type: 'number', minimum: 0 },
                  equivalentCashValue: { type: 'number', minimum: 0 }
                }
              },
              productionCost: { type: 'number', minimum: 0 },
              commission: { type: 'number', minimum: 0 },
              netProfit: { type: 'number' }
            }
          },
          discount: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['coupon', 'voucher'] },
              typeId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              code: { type: 'string' },
              value: { type: 'number', minimum: 0 },
              discountType: { type: 'string', enum: ['percentual', 'fixed'] },
              couponType: { type: 'string', enum: ['all', 'organic', 'trafficPaid'] },
              influencerCommissionRate: { type: 'number', minimum: 0, maximum: 100 }
            }
          },
          shippingAddress: {
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
          status: {
            type: 'object',
            properties: {
              current: { type: 'string', enum: ['order_placed', 'payment_approved', 'products_being_picked', 'invoiced', 'products_in_transit', 'delivered', 'canceled'] }
            }
          },
          invoice: {
            type: 'object',
            properties: {
              number: { type: 'string' },
              issueDate: { type: 'string', format: 'date-time' },
              series: { type: 'string' },
              accessKey: { type: 'string' },
              pdfUrl: { type: 'string' }
            }
          },
          tracking: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              carrier: { type: 'string' },
              shippingMethod: { type: 'string' }
            }
          },
          notes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string' }
              }
            }
          },
          emailHistory: {
            type: 'array',
            items: {
              type: 'object',
              required: ['subject', 'htmlContent', 'sendTo'],
              properties: {
                subject: { type: 'string' },
                htmlContent: { type: 'string' },
                sentAt: { type: 'string', format: 'date-time' },
                relatedStatus: { type: 'string' },
                sendTo: { type: 'string' }
              }
            }
          },
          previouslyAbandoned: {
            type: 'object',
            properties: {
              wasAbandoned: { type: 'boolean' },
              abandonedCheckoutId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              abandonedAt: {
                type: 'object',
                properties: {
                  stage: { type: 'string', enum: ['personal_data', 'shipping_data', 'shipping_method', 'payment'] },
                  timestamp: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetOrderParams; Body: UpdateOrderBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = {
        ...(hookCtx?.data || request.body),
        updatedBy: request.user!._id
      };

      // Se estiver adicionando notas, adicionar informações do usuário
      if (updateData.notes && Array.isArray(updateData.notes)) {
        updateData.notes = updateData.notes.map((note: any) => ({
          ...note,
          createdAt: new Date(),
          createdBy: {
            id: request.user!._id,
            name: request.user!.name
          }
        }));
      }

      // Atualizar pedido
      const order = await Order.findByIdAndUpdate(
        request.params.id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('influencerId', 'id name')
      .populate('customerId', 'name email')
      .lean();

      if (!order) {
        return customReply.erro('Pedido não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(order);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredOrder = request.permissionFilter ? request.permissionFilter(order) : order;

      return customReply.sucesso(filteredOrder, 'Pedido atualizado com sucesso');

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
      
      return customReply.erro('Erro ao atualizar pedido', 500);
    }
  });
}
