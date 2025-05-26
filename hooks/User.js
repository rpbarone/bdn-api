/**
 * Hooks do modelo User
 * Define ações antes e depois das operações CRUD
 */

module.exports = {
  // Antes de criar um usuário
  beforeCreate: {
    name: 'validar-criacao-usuario',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Admin não pode criar super_admin
      if (user.role === 'admin' && data.role === 'super_admin') {
        throw new Error('Admin não pode criar super_admin');
      }

      // Validar se email já existe (case insensitive)
      const existingUser = await ctx.Model.findOne({ 
        email: data.email?.toLowerCase() 
      });
      
      if (existingUser) {
        throw new Error('Email já está em uso');
      }

      // Normalizar nome para busca
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
    name: 'validar-atualizacao-usuario',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Admin não pode promover para super_admin
      if (user.role === 'admin' && data.role === 'super_admin') {
        throw new Error('Admin não pode promover usuário para super_admin');
      }

      // Admin não pode alterar super_admin
      if (user.role === 'admin' && target && target.role === 'super_admin') {
        throw new Error('Admin não pode modificar super_admin');
      }

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

      // Admin não pode deletar super_admin
      if (user.role === 'admin' && target && target.role === 'super_admin') {
        throw new Error('Admin não pode deletar super_admin');
      }

      // Não pode deletar a si mesmo
      if (user._id.toString() === target._id.toString()) {
        throw new Error('Você não pode deletar sua própria conta');
      }

      // Verificar se é o último super_admin
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

  // Depois de criar usuário
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
  },

  // Hook global para registrar último acesso
  onAuthentication: {
    name: 'registrar-ultimo-acesso',
    run: async (ctx) => {
      const { user } = ctx;
      
      // Atualizar lastLogin sem disparar hooks ou validações
      await ctx.Model.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } },
        { timestamps: false }
      );
    }
  }
};
