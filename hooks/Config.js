/**
 * Hooks do modelo Config
 * Validações que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar uma configuração
  beforeCreate: {
    name: 'preparar-criacao-config',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar se já existe uma configuração para este domínio
      if (data.domain) {
        const existingConfig = await ctx.Model.findOne({ 
          domain: data.domain
        });
        
        if (existingConfig) {
          throw new Error(`Já existe uma configuração para o domínio ${data.domain}`);
        }
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
    }
  },

  // Antes de atualizar uma configuração
  beforeUpdate: {
    name: 'preparar-atualizacao-config',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Validar se está tentando mudar o domínio para um que já existe
      if (data.domain && data.domain !== target?.domain) {
        const existingConfig = await ctx.Model.findOne({ 
          domain: data.domain,
          _id: { $ne: target._id }
        });
        
        if (existingConfig) {
          throw new Error(`Já existe uma configuração para o domínio ${data.domain}`);
        }
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.updatedAt = new Date();
    }
  },

  // Antes de deletar uma configuração
  beforeDelete: {
    name: 'validar-exclusao-config',
    run: async (ctx) => {
      const { target } = ctx;

      // Validar se é uma configuração crítica do sistema
      const criticalDomains = ['legal', 'financial'];
      if (criticalDomains.includes(target.domain)) {
        throw new Error(`Configuração do domínio ${target.domain} é crítica e não pode ser deletada`);
      }
    }
  },

  // Depois de criar configuração (para logs/auditoria)
  afterCreate: {
    name: 'pos-criacao-config',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Nova configuração criada: Domínio ${result.domain}`);
      
      // Aqui você pode adicionar:
      // - Notificações para admins
      // - Invalidação de cache se aplicável
      // - Propagação de configurações para outros serviços
    }
  },

  // Depois de atualizar configuração
  afterUpdate: {
    name: 'pos-atualizacao-config',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Configuração atualizada: Domínio ${result.domain}`);
      
      // Aqui você pode adicionar:
      // - Invalidação de cache
      // - Recarregamento de configurações em runtime
      // - Notificações sobre mudanças
    }
  }
};
