/**
 * Hooks do modelo User - Versão Otimizada
 * Apenas validações que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar um usuário
  beforeCreate: {
    name: 'preparar-criacao-usuario',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar se email já existe (policies não fazem queries)
      if (data.email) {
        const existingUser = await ctx.Model.findOne({ 
          email: data.email.toLowerCase() 
        });
        
        if (existingUser) {
          throw new Error('Email já está em uso');
        }
      }

      // Normalizar nome para busca (útil para filtros)
      if (data.name) {
        data.normalizedName = data.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
    }
  },

  // Antes de atualizar um usuário
  beforeUpdate: {
    name: 'preparar-atualizacao-usuario',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Validar email único se estiver sendo alterado
      if (data.email && data.email !== target?.email) {
        const existingUser = await ctx.Model.findOne({ 
          email: data.email.toLowerCase(),
          _id: { $ne: target._id }
        });
        
        if (existingUser) {
          throw new Error('Email já está em uso');
        }
      }

      // Atualizar nome normalizado se nome mudar
      if (data.name) {
        data.normalizedName = data.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.updatedAt = new Date();
    }
  },

  // Antes de deletar um usuário
  beforeDelete: {
    name: 'validar-exclusao-usuario',
    run: async (ctx) => {
      const { user, target } = ctx;

      // Não pode deletar a si mesmo (não está nas policies)
      if (user._id.toString() === target._id.toString()) {
        throw new Error('Você não pode deletar sua própria conta');
      }

      // Verificar se é o último super_admin (requer query)
      if (target.role === 'super_admin') {
        const superAdminCount = await ctx.Model.countDocuments({ 
          role: 'super_admin',
          _id: { $ne: target._id }
        });
        
        if (superAdminCount === 0) {
          throw new Error('Não é possível deletar o último super_admin do sistema');
        }
      }
    }
  },

  // Depois de criar usuário (para logs/auditoria)
  afterCreate: {
    name: 'pos-criacao-usuario',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Novo usuário criado: ${result.name} (${result.email}) - Role: ${result.role}`);
      
      // Aqui você pode adicionar:
      // - Envio de email de boas-vindas
      // - Criação de registros relacionados
      // - Notificações para admins
    }
  }

  // REMOVIDO: onAuthentication - já está no middleware JWT
};
