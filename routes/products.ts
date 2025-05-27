import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import Product, { IProduct } from '../models/Product';
import { authenticateJWT } from '../middlewares/jwt';
import { verificarPermissoes } from '../middlewares/authMiddleware';
import { aplicarHooks } from '../middlewares/hooksMiddleware';

interface GetProductsQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  // Filtros
  name?: string;
  shopifyId?: string;
  categoryId?: string;
  categoryName?: string; // Busca por nome da categoria
  isInfluencerExclusive?: boolean;
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  status?: 'active' | 'inactive' | 'archived' | 'all'; // Filtro combinado
  isArchived?: boolean;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
  minUnits?: number;
  maxUnits?: number;
  hasVariations?: boolean;
  createdFrom?: string;
  createdTo?: string;
}

interface GetProductParams {
  id: string;
}

interface CreateProductBody {
  shopifyId: string;
  name: string;
  isInfluencerExclusive?: boolean;
  description?: string;
  categoryId?: string;
  productImageUrl?: string;
  costs?: {
    base?: number;
    box?: number;
    label?: number;
  };
  prices?: {
    b2c?: number;
    b2cOffer?: number;
    b2i?: number;
    bodycoins?: number;
  };
  availableUnits?: number;
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  isArchived?: boolean;
  isActive?: boolean;
  variations?: Array<{
    name: string;
    sku: string;
    availableUnits: number;
  }>;
  shipping?: {
    processingTime?: number;
  };
  dimensions?: {
    weight?: number;
    height?: number;
    width?: number;
    length?: number;
  };
}

interface UpdateProductBody extends Partial<CreateProductBody> {}

export default async function productRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/products/stats
   * Retorna estatísticas sobre produtos (apenas para admin+)
   */
  fastify.get('/stats', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['Products'],
        summary: 'Obter estatísticas de produtos',
        description: 'Endpoint exclusivo para admin+ obter estatísticas sobre produtos'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (!['admin', 'super_admin'].includes(request.user!.role)) {
        return customReply.erro('Acesso negado: apenas admin+ pode acessar estas estatísticas', 403);
      }

      // Importar Config para buscar taxa de imposto
      const Config = mongoose.model('Config');
      const financialConfig = await Config.findOne({ domain: 'financial' }).lean() as any;
      const taxRate = financialConfig?.configs?.defaultTaxRate || 0.18; // 18% default

      // Executar queries agregadas
      const [
        totalProducts,
        activeProducts,
        archivedProducts,
        exclusiveProducts,
        productsByStock,
        totalValue,
        bodycoinStats,
        b2iMarginStats,
        b2cMarginStats
      ] = await Promise.all([
        // Total de produtos
        Product.countDocuments(),
        
        // Produtos ativos
        Product.countDocuments({ isActive: true, isArchived: false }),
        
        // Produtos arquivados
        Product.countDocuments({ isArchived: true }),
        
        // Produtos exclusivos para influencers
        Product.countDocuments({ isInfluencerExclusive: true }),
        
        // Quantidade por status de estoque
        Product.aggregate([
          { $group: { _id: '$stockStatus', count: { $sum: 1 } } }
        ]),

        // Valor total em estoque (custo base)
        Product.aggregate([
          { 
            $match: { 
              isArchived: false,
              'costs.base': { $exists: true },
              availableUnits: { $gt: 0 }
            } 
          },
          {
            $group: {
              _id: null,
              totalValue: { 
                $sum: { 
                  $multiply: ['$costs.base', '$availableUnits'] 
                } 
              }
            }
          }
        ]),

        // Custo médio do bodycoin
        Product.aggregate([
          {
            $match: {
              'prices.b2i': { $exists: true, $gt: 0 },
              'prices.bodycoins': { $exists: true, $gt: 0 }
            }
          },
          {
            $project: {
              bodycoinValue: { $divide: ['$prices.b2i', '$prices.bodycoins'] }
            }
          },
          {
            $group: {
              _id: null,
              avgBodycoinValue: { $avg: '$bodycoinValue' },
              count: { $sum: 1 }
            }
          }
        ]),

        // Margem de lucro média B2I
        Product.aggregate([
          {
            $match: {
              'prices.b2i': { $exists: true, $gt: 0 },
              'prices.b2c': { $exists: true, $gt: 0 },
              $expr: {
                $and: [
                  { $ifNull: ['$costs.base', false] },
                  { $ifNull: ['$costs.box', false] },
                  { $ifNull: ['$costs.label', false] }
                ]
              }
            }
          },
          {
            $project: {
              totalCost: { $sum: ['$costs.base', '$costs.box', '$costs.label'] },
              b2iPrice: '$prices.b2i',
              b2cPrice: '$prices.b2c',
              discount: { $subtract: ['$prices.b2c', '$prices.b2i'] }
            }
          },
          {
            $project: {
              margin: {
                $multiply: [
                  { $divide: [
                    { $subtract: ['$b2iPrice', '$totalCost'] },
                    '$b2iPrice'
                  ]},
                  100
                ]
              },
              discountPercent: {
                $multiply: [
                  { $divide: ['$discount', '$b2cPrice'] },
                  100
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              avgMargin: { $avg: '$margin' },
              avgDiscount: { $avg: '$discountPercent' },
              count: { $sum: 1 }
            }
          }
        ]),

        // Margem de lucro média B2C
        Product.aggregate([
          {
            $match: {
              'prices.b2c': { $exists: true, $gt: 0 },
              $expr: {
                $and: [
                  { $ifNull: ['$costs.base', false] },
                  { $ifNull: ['$costs.box', false] },
                  { $ifNull: ['$costs.label', false] }
                ]
              }
            }
          },
          {
            $project: {
              totalCost: { $sum: ['$costs.base', '$costs.box', '$costs.label'] },
              b2cPrice: '$prices.b2c',
              priceAfterCommission: {
                $multiply: ['$prices.b2c', 0.76] // Após 24% de comissão
              }
            }
          },
          {
            $project: {
              costWithTax: {
                $multiply: ['$totalCost', { $add: [1, taxRate] }]
              },
              priceAfterCommission: 1,
              b2cPrice: 1
            }
          },
          {
            $project: {
              margin: {
                $multiply: [
                  { $divide: [
                    { $subtract: ['$priceAfterCommission', '$costWithTax'] },
                    '$b2cPrice'
                  ]},
                  100
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              avgMargin: { $avg: '$margin' },
              count: { $sum: 1 }
            }
          }
        ])
      ]);

      // Formatar resultado dos status de estoque
      const stockStats = productsByStock.reduce((acc: any, curr: any) => {
        acc[curr._id || 'unknown'] = curr.count;
        return acc;
      }, {});

      const statistics = {
        total: totalProducts,
        ativos: activeProducts,
        arquivados: archivedProducts,
        exclusivosInfluencer: exclusiveProducts,
        porStatusEstoque: {
          em_estoque: stockStats.in_stock || 0,
          estoque_baixo: stockStats.low_stock || 0,
          fora_de_estoque: stockStats.out_of_stock || 0
        },
        valorTotalEstoque: totalValue[0]?.totalValue || 0,
        custoMedioBodycoin: bodycoinStats[0] ? {
          valor: bodycoinStats[0].avgBodycoinValue.toFixed(2),
          produtosAnalisados: bodycoinStats[0].count
        } : null,
        margemLucroMediaB2I: b2iMarginStats[0] ? {
          margem: b2iMarginStats[0].avgMargin.toFixed(2) + '%',
          descontoMedio: b2iMarginStats[0].avgDiscount.toFixed(2) + '%',
          produtosAnalisados: b2iMarginStats[0].count
        } : null,
        margemLucroMediaB2C: b2cMarginStats[0] ? {
          margem: b2cMarginStats[0].avgMargin.toFixed(2) + '%',
          impostoAplicado: (taxRate * 100).toFixed(0) + '%',
          comissaoAplicada: '24%',
          produtosAnalisados: b2cMarginStats[0].count
        } : null,
        percentualAtivos: totalProducts > 0 ? ((activeProducts / totalProducts) * 100).toFixed(2) + '%' : '0%',
        percentualExclusivos: totalProducts > 0 ? ((exclusiveProducts / totalProducts) * 100).toFixed(2) + '%' : '0%'
      };

      return customReply.sucesso(statistics, 'Estatísticas de produtos obtidas com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao obter estatísticas', 500);
    }
  });

  /**
   * GET /api/products
   * Lista todos os produtos com paginação e filtros
   */
  fastify.get<{ Querystring: GetProductsQuery }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Product')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          name: { type: 'string' },
          shopifyId: { type: 'string' },
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          isInfluencerExclusive: { type: 'boolean' },
          stockStatus: { type: 'string', enum: ['in_stock', 'low_stock', 'out_of_stock'] },
          status: { type: 'string', enum: ['active', 'inactive', 'archived', 'all'] },
          isArchived: { type: 'boolean' },
          isActive: { type: 'boolean' },
          minPrice: { type: 'number' },
          maxPrice: { type: 'number' },
          minUnits: { type: 'number' },
          maxUnits: { type: 'number' },
          hasVariations: { type: 'boolean' },
          createdFrom: { type: 'string', format: 'date' },
          createdTo: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: GetProductsQuery }>, reply: FastifyReply) => {
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

      // Se usuário é influencer, não mostrar produtos arquivados
      if (request.user!.role === 'influencer') {
        query.isArchived = false;
      }

      // Filtros de texto (busca parcial case-insensitive)
      if (filters.name) {
        query.normalizedName = { $regex: filters.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), $options: 'i' };
      }
      if (filters.shopifyId) {
        query.shopifyId = { $regex: filters.shopifyId, $options: 'i' };
      }

      // Filtro de status combinado
      if (filters.status) {
        switch (filters.status) {
          case 'active':
            query.isActive = true;
            query.isArchived = false;
            break;
          case 'inactive':
            query.isActive = false;
            query.isArchived = false;
            break;
          case 'archived':
            query.isArchived = true;
            break;
          case 'all':
            // Não adiciona filtros (admin+ pode ver todos)
            if (request.user!.role === 'influencer') {
              query.isArchived = false; // Influencer ainda não vê arquivados
            }
            break;
        }
      } else {
        // Manter compatibilidade com filtros antigos
        if (filters.isArchived !== undefined) query.isArchived = filters.isArchived;
        if (filters.isActive !== undefined) query.isActive = filters.isActive;
      }

      // Filtros exatos
      if (filters.categoryId) query.categoryId = filters.categoryId;
      if (filters.isInfluencerExclusive !== undefined) query.isInfluencerExclusive = filters.isInfluencerExclusive;
      if (filters.stockStatus) query.stockStatus = filters.stockStatus;

      // Filtros de range de preço (B2C)
      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        query['prices.b2c'] = {};
        if (filters.minPrice !== undefined) query['prices.b2c'].$gte = filters.minPrice;
        if (filters.maxPrice !== undefined) query['prices.b2c'].$lte = filters.maxPrice;
      }

      // Filtros de range de unidades
      if (filters.minUnits !== undefined || filters.maxUnits !== undefined) {
        query.availableUnits = {};
        if (filters.minUnits !== undefined) query.availableUnits.$gte = filters.minUnits;
        if (filters.maxUnits !== undefined) query.availableUnits.$lte = filters.maxUnits;
      }

      // Filtro de variações
      if (filters.hasVariations !== undefined) {
        if (filters.hasVariations) {
          query.variations = { $exists: true, $ne: [] };
        } else {
          query.$or = [
            { variations: { $exists: false } },
            { variations: { $size: 0 } }
          ];
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

      // Filtro por nome de categoria (requer busca prévia)
      if (filters.categoryName) {
        const ProductCategory = mongoose.model('ProductCategory');
        const categories = await ProductCategory.find({
          name: { $regex: filters.categoryName, $options: 'i' }
        }).select('_id').lean();
        
        if (categories.length > 0) {
          query.categoryId = { $in: categories.map(c => c._id) };
        } else {
          // Se não encontrar categorias, retornar resultado vazio
          return customReply.sucesso({
            data: [],
            pagination: {
              total: 0,
              page,
              limit,
              totalPages: 0,
              hasNext: false,
              hasPrev: false
            }
          });
        }
      }

      // Calcular skip para paginação
      const skip = (page - 1) * limit;

      // Executar query
      const [products, total] = await Promise.all([
        Product.find(query)
          .populate('categoryId', 'name')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(query)
      ]);

      // Aplicar filtro de campos baseado nas permissões
      const filteredProducts = request.permissionFilter ? products.map(request.permissionFilter) : products;

      // Calcular metadados de paginação
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return customReply.sucesso({
        data: filteredProducts,
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
      return customReply.erro('Erro ao listar produtos', 500);
    }
  });

  /**
   * GET /api/products/:id
   * Busca um produto específico
   */
  fastify.get<{ Params: GetProductParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Product')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetProductParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const product = await Product.findById(request.params.id)
        .populate('categoryId', 'name')
        .lean();
      
      if (!product) {
        return customReply.erro('Produto não encontrado', 404);
      }

      // Se usuário é influencer e produto está arquivado, negar acesso
      if (request.user!.role === 'influencer' && product.isArchived) {
        return customReply.erro('Produto não encontrado', 404);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredProduct = request.permissionFilter ? request.permissionFilter(product) : product;

      return customReply.sucesso(filteredProduct);

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao buscar produto', 500);
    }
  });

  /**
   * POST /api/products
   * Cria um novo produto
   */
  fastify.post<{ Body: CreateProductBody }>('/', {
    preHandler: [authenticateJWT, verificarPermissoes('Product'), aplicarHooks('Product', 'create')],
    schema: {
      body: {
        type: 'object',
        required: ['shopifyId', 'name'],
        properties: {
          shopifyId: { type: 'string' },
          name: { type: 'string' },
          isInfluencerExclusive: { type: 'boolean' },
          description: { type: 'string' },
          categoryId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          productImageUrl: { type: 'string' },
          costs: {
            type: 'object',
            properties: {
              base: { type: 'number', minimum: 0 },
              box: { type: 'number', minimum: 0 },
              label: { type: 'number', minimum: 0 }
            }
          },
          prices: {
            type: 'object',
            properties: {
              b2c: { type: 'number', minimum: 0 },
              b2cOffer: { type: 'number', minimum: 0 },
              b2i: { type: 'number', minimum: 0 },
              bodycoins: { type: 'number', minimum: 0 }
            }
          },
          availableUnits: { type: 'number', minimum: 0 },
          stockStatus: { type: 'string', enum: ['in_stock', 'low_stock', 'out_of_stock'] },
          isArchived: { type: 'boolean' },
          isActive: { type: 'boolean' },
          variations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'sku', 'availableUnits'],
              properties: {
                name: { type: 'string' },
                sku: { type: 'string' },
                availableUnits: { type: 'number', minimum: 0 }
              }
            }
          },
          shipping: {
            type: 'object',
            properties: {
              processingTime: { type: 'number', minimum: 0 }
            }
          },
          dimensions: {
            type: 'object',
            properties: {
              weight: { type: 'number', minimum: 0 },
              height: { type: 'number', minimum: 0 },
              width: { type: 'number', minimum: 0 },
              length: { type: 'number', minimum: 0 }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateProductBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const productData = {
        ...(hookCtx?.data || request.body),
        createdBy: request.user!._id,
        updatedBy: request.user!._id
      };

      // Criar produto
      const product = new Product(productData);
      await product.save();

      // Buscar produto criado para retornar com virtuals e populate
      const createdProduct = await Product.findById(product._id)
        .populate('categoryId', 'name')
        .lean();

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(createdProduct);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredProduct = request.permissionFilter ? request.permissionFilter(createdProduct) : createdProduct;

      return customReply.sucesso(filteredProduct, 'Produto criado com sucesso');

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
      
      return customReply.erro('Erro ao criar produto', 500);
    }
  });

  /**
   * PUT /api/products/:id
   * Atualiza um produto
   */
  fastify.put<{ Params: GetProductParams; Body: UpdateProductBody }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Product'), aplicarHooks('Product', 'update')],
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
          shopifyId: { type: 'string' },
          name: { type: 'string' },
          isInfluencerExclusive: { type: 'boolean' },
          description: { type: 'string' },
          categoryId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
          productImageUrl: { type: 'string' },
          costs: {
            type: 'object',
            properties: {
              base: { type: 'number', minimum: 0 },
              box: { type: 'number', minimum: 0 },
              label: { type: 'number', minimum: 0 }
            }
          },
          prices: {
            type: 'object',
            properties: {
              b2c: { type: 'number', minimum: 0 },
              b2cOffer: { type: 'number', minimum: 0 },
              b2i: { type: 'number', minimum: 0 },
              bodycoins: { type: 'number', minimum: 0 }
            }
          },
          availableUnits: { type: 'number', minimum: 0 },
          stockStatus: { type: 'string', enum: ['in_stock', 'low_stock', 'out_of_stock'] },
          isArchived: { type: 'boolean' },
          isActive: { type: 'boolean' },
          variations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'sku', 'availableUnits'],
              properties: {
                name: { type: 'string' },
                sku: { type: 'string' },
                availableUnits: { type: 'number', minimum: 0 }
              }
            }
          },
          shipping: {
            type: 'object',
            properties: {
              processingTime: { type: 'number', minimum: 0 }
            }
          },
          dimensions: {
            type: 'object',
            properties: {
              weight: { type: 'number', minimum: 0 },
              height: { type: 'number', minimum: 0 },
              width: { type: 'number', minimum: 0 },
              length: { type: 'number', minimum: 0 }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetProductParams; Body: UpdateProductBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Usar dados do contexto do hook se disponível, caso contrário usar body
      const hookCtx = (request as any).hookCtx;
      const updateData = {
        ...(hookCtx?.data || request.body),
        updatedBy: request.user!._id
      };

      // Atualizar produto
      const product = await Product.findByIdAndUpdate(
        request.params.id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('categoryId', 'name')
      .lean();

      if (!product) {
        return customReply.erro('Produto não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(product);
      }

      // Aplicar filtro de campos baseado nas permissões
      const filteredProduct = request.permissionFilter ? request.permissionFilter(product) : product;

      return customReply.sucesso(filteredProduct, 'Produto atualizado com sucesso');

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
      
      return customReply.erro('Erro ao atualizar produto', 500);
    }
  });

  /**
   * DELETE /api/products/:id
   * Remove um produto
   */
  fastify.delete<{ Params: GetProductParams }>('/:id', {
    preHandler: [authenticateJWT, verificarPermissoes('Product'), aplicarHooks('Product', 'delete')],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: GetProductParams }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const product = await Product.findByIdAndDelete(request.params.id);
      
      if (!product) {
        return customReply.erro('Produto não encontrado', 404);
      }

      // Executar after hooks
      if ((request as any).afterHook) {
        await (request as any).afterHook(product);
      }

      return customReply.sucesso(null, 'Produto removido com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao remover produto', 500);
    }
  });

  /**
   * GET /api/products/low-stock
   * Lista produtos com estoque baixo (apenas para admin+)
   */
  fastify.get('/low-stock', {
    preHandler: [authenticateJWT],
    config: {
      swagger: {
        tags: ['Products'],
        summary: 'Listar produtos com estoque baixo',
        description: 'Endpoint para admin+ visualizar produtos que precisam de reposição'
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      // Verificar se é admin+
      if (!['admin', 'super_admin'].includes(request.user!.role)) {
        return customReply.erro('Acesso negado: apenas admin+ pode acessar esta rota', 403);
      }

      // Buscar produtos com estoque baixo ou zerado
      const lowStockProducts = await Product.find({
        isArchived: false,
        $or: [
          { stockStatus: 'low_stock' },
          { stockStatus: 'out_of_stock' }
        ]
      })
      .select('shopifyId name stockStatus availableUnits prices.b2c productImageUrl')
      .sort({ availableUnits: 1 })
      .lean();

      return customReply.sucesso({
        total: lowStockProducts.length,
        products: lowStockProducts
      }, 'Produtos com estoque baixo listados com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao listar produtos com estoque baixo', 500);
    }
  });
}
