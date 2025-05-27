/**
 * Policy de segurança para o modelo Coupon
 * Define permissões e campos acessíveis por role
 * NOTA: Admin e super_admin têm os mesmos privilégios neste modelo
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: influencer pode ver apenas seus próprios cupons, admin+ pode ver todos
    read: '(influencer && target && target.associatedInfluencer && target.associatedInfluencer.toString() === self._id.toString()) || admin+',
    
    // Criação: apenas admin+ pode criar cupons
    create: 'admin+',
    
    // Atualização: admin+ pode atualizar qualquer cupom
    update: 'admin+',
    
    // Exclusão: admin+ pode deletar qualquer cupom
    delete: 'admin+'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Campos públicos (visíveis para influencers em seus próprios cupons)
      public: [
        'id',
        'code',
        'description',
        'origin',
        'associatedInfluencer',
        'currentUses',
        'maxUses',
        'startDate',
        'endDate',
        'discountType',
        'discountValue',
        'isActive',
        'freeShipping',
        'oneTimePerUser',
        'createdAt'
      ],
      
      // Campos que influencer pode ver em seus próprios cupons
      influencer: [
        'id',
        'code',
        'description',
        'origin',
        'associatedInfluencer',
        'currentUses',
        'maxUses',
        'startDate',
        'endDate',
        'discountType',
        'discountValue',
        'isActive',
        'freeShipping',
        'oneTimePerUser',
        'createdAt'
      ],
      
      // Campos que admin pode ver (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode ver (tudo)
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Influencer não pode modificar cupons
      influencer: [],
      
      // Admin pode modificar tudo
      admin: ['*'],
      
      // Super_admin pode modificar tudo
      super_admin: ['*']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Não pode criar cupom com data de término no passado
    'valid-end-date': '!body.endDate || new Date(body.endDate) > new Date()',
    
    // Não pode criar cupom com data de início após data de término
    'valid-date-range': '!body.startDate || !body.endDate || new Date(body.startDate) < new Date(body.endDate)',
    
    // Desconto percentual deve estar entre 0 e 100
    'valid-percentage-discount': '!body.discountValue || body.discountType !== "percentual" || (body.discountValue > 0 && body.discountValue <= 100)',
    
    // Desconto fixo deve ser positivo
    'valid-fixed-discount': '!body.discountValue || body.discountType !== "fixed" || body.discountValue > 0',
    
    // Valor mínimo do pedido deve ser positivo se fornecido
    'valid-minimum-order': '!body.minimumOrderValue || body.minimumOrderValue >= 0',
    
    // Quantidade mínima de itens deve ser pelo menos 1
    'valid-min-quantity': '!body.minItemQuantity || body.minItemQuantity >= 1',
    
    // Número máximo de usos deve ser maior que usos atuais
    'valid-max-uses': '!body.maxUses || !target || body.maxUses >= target.currentUses',
    
    // Não pode definir createdBy manualmente
    'no-manual-createdby': '!body.createdBy',
    
    // Não pode definir updatedBy manualmente
    'no-manual-updatedby': '!body.updatedBy',
    
    // Se cupom tem influenciador associado, deve ser organic ou trafficPaid
    'influencer-requires-origin': '!body.associatedInfluencer || !body.origin || body.origin !== "all"',
    
    // Se origem é 'all', não pode ter influenciador
    'all-no-influencer': '!body.origin || body.origin !== "all" || !body.associatedInfluencer'
  }
};
