/**
 * Hooks do modelo Coupon - Versão Otimizada
 * Apenas validações que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar um cupom
  beforeCreate: {
    name: 'preparar-criacao-cupom',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar se código já existe (policies não fazem queries)
      if (data.code) {
        const existingCoupon = await ctx.Model.findOne({ 
          code: data.code.toUpperCase() 
        });
        
        if (existingCoupon) {
          throw new Error('Código do cupom já está em uso');
        }
      }

      // Normalizar descrição para busca (útil para filtros)
      if (data.description) {
        data.normalizedDescription = data.description
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Garantir que código seja uppercase
      if (data.code) {
        data.code = data.code.toUpperCase();
      }

      // Garantir que createdBy seja definido
      data.createdBy = user._id;
      data.updatedBy = user._id;

      // Validar associação de influenciador
      if (data.origin !== 'all' && !data.associatedInfluencer) {
        throw new Error('Influenciador associado é obrigatório para cupons organic e trafficPaid');
      }

      // Se origem é 'all', remover influenciador associado
      if (data.origin === 'all') {
        delete data.associatedInfluencer;
      }
    }
  },

  // Antes de atualizar um cupom
  beforeUpdate: {
    name: 'preparar-atualizacao-cupom',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Validar código único se estiver sendo alterado
      if (data.code && data.code !== target?.code) {
        const existingCoupon = await ctx.Model.findOne({ 
          code: data.code.toUpperCase(),
          _id: { $ne: target._id }
        });
        
        if (existingCoupon) {
          throw new Error('Código do cupom já está em uso');
        }
      }

      // Atualizar descrição normalizada se descrição mudar
      if (data.description) {
        data.normalizedDescription = data.description
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Garantir que código seja uppercase
      if (data.code) {
        data.code = data.code.toUpperCase();
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.updatedAt = new Date();

      // Validar mudança de origem
      if (data.origin !== undefined && data.origin !== target?.origin) {
        if (data.origin === 'all') {
          // Se mudando para 'all', remover influenciador
          data.associatedInfluencer = null;
        } else if (!data.associatedInfluencer && !target?.associatedInfluencer) {
          // Se mudando de 'all' para outro, exigir influenciador
          throw new Error('Influenciador associado é obrigatório para cupons organic e trafficPaid');
        }
      }

      // Não permitir reduzir currentUses
      if (data.currentUses !== undefined && data.currentUses < target?.currentUses) {
        throw new Error('Não é possível reduzir o número de usos atuais');
      }
    }
  },

  // Antes de deletar um cupom
  beforeDelete: {
    name: 'validar-exclusao-cupom',
    run: async (ctx) => {
      const { target } = ctx;

      // Verificar se cupom já foi usado
      if (target.currentUses > 0) {
        throw new Error('Não é possível deletar cupom que já foi utilizado. Considere desativá-lo.');
      }
    }
  },

  // Depois de criar cupom (para logs/auditoria)
  afterCreate: {
    name: 'pos-criacao-cupom',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Novo cupom criado: ${result.code} - Tipo: ${result.origin} - Desconto: ${result.discountType} ${result.discountValue}${result.discountType === 'percentual' ? '%' : ''}`);
      
      // Aqui você pode adicionar:
      // - Notificações para o influenciador associado
      // - Integração com sistemas externos
      // - Registro de histórico
    }
  },

  // Depois de atualizar cupom
  afterUpdate: {
    name: 'pos-atualizacao-cupom',
    run: async (ctx) => {
      const { result, target } = ctx;
      
      // Log se status mudou
      if (target?.isActive !== result.isActive) {
        console.log(`📝 Cupom ${result.code} ${result.isActive ? 'ativado' : 'desativado'}`);
      }
    }
  }
};
