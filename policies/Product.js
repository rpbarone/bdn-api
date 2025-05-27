/**
 * Policy de segurança para o modelo Product
 * Define permissões e campos acessíveis por role
 * Admin e super_admin têm os mesmos privilégios neste modelo
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: influencer pode ver produtos não arquivados, admin+ pode ver todos
    read: '(influencer && (!target || !target.isArchived)) || admin+',
    
    // Criação: apenas admin+ pode criar produtos
    create: 'admin+',
    
    // Atualização: apenas admin+ pode atualizar produtos
    update: 'admin+',
    
    // Exclusão: apenas admin+ pode deletar produtos
    delete: 'admin+'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Campos públicos (visíveis para influencers)
      public: [
        'id',
        'shopifyId',
        'name',
        'description',
        'categoryId',
        'productImageUrl',
        'prices',
        'availableUnits',
        'stockStatus',
        'isActive',
        'isInfluencerExclusive',
        'variations',
        'shipping',
        'dimensions',
        'createdAt',
        'updatedAt'
      ],
      
      // Campos que admin pode ver (tudo, incluindo custos)
      admin: ['*'],
      
      // Campos que super_admin pode ver (tudo)
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Influencers não podem modificar produtos
      influencer: [],
      
      // Campos que admin pode modificar (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode modificar (tudo)
      super_admin: ['*']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Não pode definir preços negativos
    'no-negative-prices': '!body.prices || ((!body.prices.b2c || body.prices.b2c >= 0) && (!body.prices.b2cOffer || body.prices.b2cOffer >= 0) && (!body.prices.b2i || body.prices.b2i >= 0) && (!body.prices.bodycoins || body.prices.bodycoins >= 0))',
    
    // Não pode definir custos negativos
    'no-negative-costs': '!body.costs || ((!body.costs.base || body.costs.base >= 0) && (!body.costs.box || body.costs.box >= 0) && (!body.costs.label || body.costs.label >= 0))',
    
    // Não pode definir unidades disponíveis negativas
    'no-negative-units': '!body.availableUnits || body.availableUnits >= 0',
    
    // Não pode definir dimensões negativas
    'no-negative-dimensions': '!body.dimensions || ((!body.dimensions.weight || body.dimensions.weight >= 0) && (!body.dimensions.height || body.dimensions.height >= 0) && (!body.dimensions.width || body.dimensions.width >= 0) && (!body.dimensions.length || body.dimensions.length >= 0))',
    
    // Não pode definir tempo de processamento negativo
    'no-negative-processing-time': '!body.shipping || !body.shipping.processingTime || body.shipping.processingTime >= 0',
    
    // Validar preço de oferta (deve ser menor que preço normal)
    'valid-offer-price': '!body.prices || !body.prices.b2cOffer || !body.prices.b2c || body.prices.b2cOffer <= body.prices.b2c',
    
    // Shopify ID é obrigatório e não pode ser removido na atualização
    'shopify-id-required': 'operation !== "update" || !body.shopifyId || body.shopifyId !== ""',
    
    // Não pode arquivar produto com estoque disponível
    'no-archive-with-stock': '!body.isArchived || body.isArchived !== true || !target || target.availableUnits === 0',
    
    // Validar variações (se fornecidas)
    'valid-variations': '!body.variations || body.variations.every(v => v.name && v.sku && v.availableUnits >= 0)',
    
    // Não pode definir createdBy ou updatedBy manualmente
    'no-manual-audit-fields': '!body.createdBy && !body.updatedBy'
  }
};
