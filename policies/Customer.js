/**
 * Policy de segurança para o modelo Customer
 * Define permissões e campos acessíveis por role
 * Admin e super_admin têm os mesmos privilégios neste modelo
 * IMPORTANTE: Ninguém pode criar ou deletar customers
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: influencer não pode ver customers, apenas admin+
    read: 'admin+',
    
    // Criação: NINGUÉM pode criar customers (vem de sistema externo)
    create: 'false',
    
    // Atualização: apenas admin+ pode atualizar (limitado a notes e tags)
    update: 'admin+',
    
    // Exclusão: NINGUÉM pode deletar customers
    delete: 'false'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Influencer não tem acesso a customers
      influencer: [],
      
      // Admin pode ver tudo
      admin: ['*'],
      
      // Super admin pode ver tudo (igual ao admin neste modelo)
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Influencer não pode modificar customers
      influencer: [],
      
      // Admin pode modificar apenas notes e tags (updatedBy e updatedAt são automáticos)
      admin: ['notes', 'tags', 'updatedBy', 'updatedAt'],
      
      // Super admin pode modificar apenas notes e tags (igual ao admin neste modelo)
      super_admin: ['notes', 'tags', 'updatedBy', 'updatedAt']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Não pode alterar nenhum campo além de notes e tags
    'only-notes-tags': '!body || Object.keys(body).every(k => ["notes", "tags", "updatedBy", "updatedAt"].includes(k))',
    
    // Notas só podem ser adicionadas, não removidas/editadas
    'append-only-notes': '!body.notes || (Array.isArray(body.notes) && body.notes.length > (target?.notes?.length || 0))',
    
    // Tags devem ser válidas
    'valid-tags': '!body.tags || (Array.isArray(body.tags) && body.tags.every(t => ["Frequente", "Novo", "VIP", "Ativo", "Inativo", "Lead"].includes(t)))'
  }
};
