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
    
    // Atualização: usuário pode atualizar próprio perfil, admin pode atualizar influencers, super_admin pode tudo
    update: 'isSelf || (admin && canModifyUser(self, target)) || super_admin',
    
    // Exclusão: apenas super_admin pode deletar usuários
    delete: 'super_admin'
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
      
      // Campos que admin pode ver
      admin: [
        'email',
        'role',
        'status',
        'deactivationReason',
        'bodyCoins',
        'rankingPoints',
        'birthDate',
        'gender',
        'phone',
        'bankInfo',
        'coupons',
        'hasReviewedApp',
        'onboarding',
        'referredBy',
        'leadId',
        'approvalDate',
        'lastLogin',
        'twoFactorEnabled',
        'updatedAt',
        'updatedBy'
      ],
      
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
      
      // Campos que admin pode modificar
      admin: [
        'name',
        'username',
        'email',
        'profilePicture',
        'status',
        'deactivationReason',
        'level',
        'bodyCoins',
        'rankingPoints',
        'ranking',
        'birthDate',
        'gender',
        'cpf',
        'rg',
        'phone',
        'social',
        'bankInfo',
        'address',
        'coupons',
        'hasReviewedApp',
        'onboarding',
        'referredBy',
        'leadId',
        'approvalDate',
        'niches'
      ],
      
      // Campos que super_admin pode modificar (tudo exceto campos do sistema)
      super_admin: ['*']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Não pode promover usuário para role superior ao seu
    'no-promote-above': 'target.role && config.roles[target.role] <= config.roles[self.role]',
    
    // Não pode alterar próprio role
    'no-self-role-change': '!(isSelf && body.role && body.role !== self.role)',
    
    // Não pode alterar próprio status para inativo
    'no-self-deactivate': '!(isSelf && body.status === "inativo")',
    
    // Apenas super_admin pode criar/modificar outros admins
    'admin-only-by-super': '!((body.role === "admin" || body.role === "super_admin") && self.role !== "super_admin")',
    
    // CPF deve ser único se fornecido
    'unique-cpf': '!body.cpf || !target || body.cpf === target.cpf',
    
    // Username não pode ser alterado após criação (exceto por super_admin)
    'username-immutable': '!body.username || !target || body.username === target.username || self.role === "super_admin"',
    
    // Email só pode ser alterado pelo próprio usuário ou super_admin
    'email-protection': '!body.email || isSelf || self.role === "super_admin"',
    
    // Campos financeiros protegidos
    'financial-protection': '!(body.bodyCoins && self.role === "influencer")',
    
    // Não pode definir updatedBy manualmente
    'no-manual-updatedby': '!body.updatedBy'
  }
};
