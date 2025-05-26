/**
 * Policy de segurança para o modelo User
 * Define permissões e campos acessíveis por role
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: usuário pode ver seu próprio perfil, admin+ pode ver todos
    read: 'isSelf || admin+',
    
    // Criação: apenas admin+ pode criar usuários (registro público usa rota específica)
    create: 'admin+',
    
    // Atualização: usuário pode atualizar próprio perfil, admin pode atualizar todos exceto super_admin
    update: 'isSelf || (admin && (!target || target.role !== "super_admin")) || super_admin',
    
    // Exclusão: admin pode deletar todos exceto super_admin, super_admin pode deletar todos
    delete: '(admin && (!target || target.role !== "super_admin")) || super_admin'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Campos públicos (visíveis para todos que têm permissão de leitura)
      public: [
        'id',
        'name',
        'username',
        'profilePicture',
        'level',
        'ranking',
        'social',
        'niches',
        'createdAt'
      ],
      
      // Campos que o próprio usuário pode ver
      own: [
        'email',
        'role',
        'status',
        'bodyCoins',
        'rankingPoints',
        'birthDate',
        'gender',
        'cpf',
        'rg',
        'phone',
        'bankInfo',
        'address',
        'coupons',
        'hasReviewedApp',
        'onboarding',
        'referredBy',
        'leadId',
        'approvalDate',
        'lastLogin',
        'twoFactorEnabled',
        'updatedAt'
      ],
      
      // Campos que admin pode ver (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode ver (tudo)
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Campos que o próprio usuário pode modificar
      own: [
        'name',
        'profilePicture',
        'birthDate',
        'gender',
        'cpf',
        'rg',
        'phone',
        'social',
        'bankInfo',
        'address',
        'niches',
        'hasReviewedApp'
      ],
      
      // Campos que admin pode modificar (tudo exceto quando é super_admin)
      admin: ['*'],
      
      // Campos que super_admin pode modificar (tudo exceto campos do sistema)
      super_admin: ['*']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Admin não pode modificar super_admin
    'admin-cant-modify-super': '!(self.role === "admin" && target && target.role === "super_admin")',
    
    // Não pode promover ninguém para super_admin (exceto super_admin)
    'no-promote-to-super': '!body.role || body.role !== "super_admin" || self.role === "super_admin"',
    
    // Não pode se auto-promover para super_admin
    'no-self-promote-to-super': '!body.role || !(isSelf && body.role === "super_admin" && self.role !== "super_admin")',
    
    // Não pode alterar próprio status para inativo
    'no-self-deactivate': '!(isSelf && body.status === "inativo")',
    
    // Apenas super_admin pode criar super_admins, admin pode criar admins e influencers
    'role-creation-rules': '!body.role || body.role !== "super_admin" || self.role === "super_admin"',
    
    // CPF deve ser único se fornecido
    'unique-cpf': '!body.cpf || !target || body.cpf === target.cpf',
    
    // Username não pode ser alterado após criação (exceto por admin+ em targets que não sejam super_admin)
    'username-immutable': '!body.username || !target || body.username === target.username || (admin+ && (!target || target.role !== "super_admin"))',
    
    // Email só pode ser alterado pelo próprio usuário ou admin+ (ou na criação), mas admin não pode alterar de super_admin
    'email-protection': '!body.email || operation === "create" || isSelf || (admin+ && (!target || target.role !== "super_admin"))',
    
    // Campos financeiros protegidos (influencer não pode alterar, admin pode exceto em super_admin)
    'financial-protection': '!body.bodyCoins || self.role !== "influencer"',
    
    // Não pode definir updatedBy manualmente
    'no-manual-updatedby': '!body.updatedBy'
  }
};
