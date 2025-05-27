/**
 * Policy de segurança para o modelo AbandonedCheckout
 * Define permissões e campos acessíveis por role
 * Admin e super_admin têm os mesmos privilégios neste modelo
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: influencer pode ver apenas seus próprios checkouts, admin+ pode ver todos
    read: '(influencer && target && target.influencerId && target.influencerId.toString() === self._id.toString()) || admin+',
    
    // Criação: todos podem criar (público cria via checkout, influencer via dashboard, admin via admin)
    create: 'influencer+',
    
    // Atualização: influencer pode atualizar apenas seus próprios, admin+ pode atualizar todos
    update: '(influencer && target && target.influencerId && target.influencerId.toString() === self._id.toString()) || admin+',
    
    // Exclusão: apenas admin+ pode deletar
    delete: 'admin+'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Campos públicos (visíveis para influencers em seus próprios checkouts)
      public: [
        'id',
        'type',
        'items',
        'totals',
        'discount',
        'shippingAddress',
        'abandonedAt',
        'checkoutAnalytics',
        'convertedToOrder',
        'createdAt',
        'updatedAt'
      ],
      
      // Campos que o influencer pode ver em seus próprios checkouts
      own: [
        'influencerId',
        'customerId',
        'guestEmail',
        'guestPhone',
        'recoveryAttempts'
      ],
      
      // Campos que admin pode ver (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode ver (tudo)
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Campos que o influencer pode modificar em seus próprios checkouts
      own: [
        'items',
        'totals',
        'discount',
        'shippingAddress',
        'abandonedAt',
        'checkoutAnalytics'
      ],
      
      // Campos que admin pode modificar (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode modificar (tudo)
      super_admin: ['*']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Influencer não pode mudar o tipo do checkout
    'no-type-change': '!body.type || self.role !== "influencer" || !target || body.type === target.type',
    
    // Influencer não pode mudar influencerId
    'no-influencer-change': '!body.influencerId || self.role !== "influencer" || !target || body.influencerId === target.influencerId',
    
    // Apenas admin+ pode marcar como convertido
    'conversion-admin-only': '!body.convertedToOrder || !body.convertedToOrder.status || admin+',
    
    // Não pode desmarcar conversão após marcada
    'no-unconvert': '!body.convertedToOrder || body.convertedToOrder.status !== false || !target || !target.convertedToOrder || !target.convertedToOrder.status',
    
    // Validar tipo do checkout na criação
    'valid-checkout-type': '!body.type || ["b2c", "b2i"].includes(body.type)',
    
    // Validar stage de abandono
    'valid-abandon-stage': '!body.abandonedAt || !body.abandonedAt.stage || ["personal_data", "shipping_data", "shipping_method", "payment"].includes(body.abandonedAt.stage)',
    
    // Apenas admin+ pode adicionar tentativas de recuperação
    'recovery-admin-only': '!body.recoveryAttempts || admin+',
    
    // Proteger campos de analytics contra manipulação direta por influencers
    'analytics-protection': '!body.checkoutAnalytics || self.role !== "influencer" || (operation === "create" || !target || (body.checkoutAnalytics.viewCount >= target.checkoutAnalytics.viewCount && body.checkoutAnalytics.timeSpentSeconds >= target.checkoutAnalytics.timeSpentSeconds))'
  }
};
