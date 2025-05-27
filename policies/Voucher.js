/**
 * Policy de segurança para o modelo Voucher
 * Define permissões e campos acessíveis por role
 * Admin e super_admin têm os mesmos privilégios
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: apenas admin ou super_admin
    read: 'admin || super_admin',
    
    // Criação: apenas admin ou super_admin
    create: 'admin || super_admin',
    
    // Atualização: apenas admin ou super_admin
    update: 'admin || super_admin',
    
    // Exclusão: apenas admin ou super_admin
    delete: 'admin || super_admin'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Admin e super_admin podem ver tudo
      admin: ['*'],
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Admin e super_admin podem modificar tudo
      admin: ['*'],
      super_admin: ['*']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Não pode definir currentUses manualmente (apenas sistema incrementa)
    'no-manual-currentuses': '!body.currentUses',
    
    // Não pode definir updatedBy/createdBy manualmente
    'no-manual-updatedby': '!body.updatedBy',
    'no-manual-createdby': '!body.createdBy',
    
    // Data de início deve ser anterior à data de fim
    'valid-date-range': '!body.startDate || !body.endDate || new Date(body.startDate) < new Date(body.endDate)',
    
    // Desconto percentual deve estar entre 0 e 100
    'valid-percentage': '!body.discountValue || body.discountType !== "percentual" || (body.discountValue >= 0 && body.discountValue <= 100)',
    
    // Valor mínimo do pedido não pode ser negativo
    'valid-minimum-order': '!body.minimumOrderValue || body.minimumOrderValue >= 0',
    
    // Número máximo de usos deve ser positivo se definido
    'valid-max-uses': '!body.maxUses || body.maxUses > 0',
    
    // Quantidade mínima de itens deve ser pelo menos 1
    'valid-min-items': '!body.minItemQuantity || body.minItemQuantity >= 1'
  }
};
