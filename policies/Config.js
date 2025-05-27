/**
 * Policy de segurança para o modelo Config
 * Define permissões e campos acessíveis por role
 * Admin e super_admin têm os mesmos privilégios neste modelo
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: apenas admin+
    read: 'admin+',
    
    // Criação: apenas admin+
    create: 'admin+',
    
    // Atualização: apenas admin+
    update: 'admin+',
    
    // Exclusão: apenas admin+
    delete: 'admin+'
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
    // Não pode definir updatedBy manualmente
    'no-manual-updatedby': '!body.updatedBy',
    
    // Não pode deletar configurações críticas do sistema
    'protect-critical-configs': 'operation !== "delete" || !["legal", "financial"].includes(target?.domain)',
    
    // Garantir que configs seja um objeto válido
    'valid-configs-object': '!body.configs || typeof body.configs === "object"'
  }
};
