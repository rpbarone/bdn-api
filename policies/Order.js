/**
 * Policy de segurança para o modelo Order
 * Define permissões e campos acessíveis por role
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: admin e super_admin podem ver todos os pedidos
    read: 'admin+',
    
    // Criação: apenas admin+ pode criar pedidos
    create: 'admin+',
    
    // Atualização: admin+ pode atualizar todos os pedidos
    update: 'admin+',
    
    // Exclusão: apenas super_admin pode deletar pedidos
    delete: 'super_admin'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Campos que admin pode ver (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode ver (tudo)
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Campos que admin pode modificar
      admin: [
        'type',
        'asaasId',
        'influencerId',
        'customerId',
        'payment',
        'itens',
        'totals',
        'discount',
        'shippingAddress',
        'status',
        'invoice',
        'tracking',
        'notes',
        'emailHistory',
        'previouslyAbandoned'
      ],
      
      // Campos que super_admin pode modificar (tudo)
      super_admin: ['*']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Não pode mudar ID de pedido após criação
    'no-change-id': '!body.id || operation === "create" || body.id === target.id',
    
    // Não pode voltar status para anterior (exceto para cancelado)
    'status-progression': '!body.status || !body.status.current || body.status.current === "canceled" || !target || !target.status || statusCanProgress(target.status.current, body.status.current)',
    
    // Não pode alterar pedido já cancelado (exceto super_admin)
    'no-change-canceled': '!target || target.status.current !== "canceled" || self.role === "super_admin"',
    
    // Não pode alterar pedido já entregue (exceto super_admin)
    'no-change-delivered': '!target || target.status.current !== "delivered" || self.role === "super_admin"',
    
    // Não pode alterar valor de itens após aprovação do pagamento
    'no-change-items-after-payment': '!body.itens || !target || target.payment.status !== "approved" || self.role === "super_admin"',
    
    // Não pode alterar dados de pagamento após aprovação
    'no-change-payment-after-approval': '!body.payment || !target || target.payment.status !== "approved" || self.role === "super_admin"',
    
    // Não pode remover histórico de status
    'preserve-status-history': '!body.status || !body.status.history || !target || body.status.history.length >= target.status.history.length',
    
    // Não pode modificar timestamps do histórico
    'preserve-history-timestamps': '!body.status || !body.status.history || !target || validateHistoryTimestamps(body.status.history, target.status.history)',
    
    // Não pode definir updatedBy manualmente
    'no-manual-updatedby': '!body.updatedBy'
  }
};
