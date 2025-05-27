/**
 * Hooks do modelo Voucher - Versão Otimizada
 * Apenas validações que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar um voucher
  beforeCreate: {
    name: 'preparar-criacao-voucher',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar se código já existe (policies não fazem queries)
      if (data.code) {
        const existingVoucher = await ctx.Model.findOne({ 
          code: data.code.toUpperCase() 
        });
        
        if (existingVoucher) {
          throw new Error('Código de voucher já está em uso');
        }
      }

      // Normalizar descrição para busca (útil para filtros)
      if (data.description) {
        data.normalizedDescription = data.description
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.createdBy = user._id;
    }
  },

  // Antes de atualizar um voucher
  beforeUpdate: {
    name: 'preparar-atualizacao-voucher',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Validar código único se estiver sendo alterado
      if (data.code && data.code !== target?.code) {
        const existingVoucher = await ctx.Model.findOne({ 
          code: data.code.toUpperCase(),
          _id: { $ne: target._id }
        });
        
        if (existingVoucher) {
          throw new Error('Código de voucher já está em uso');
        }
      }

      // Atualizar descrição normalizada se descrição mudar
      if (data.description) {
        data.normalizedDescription = data.description
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Validar se voucher não está sendo usado além do limite
      if (data.maxUses && target) {
        if (target.currentUses > data.maxUses) {
          throw new Error('Não é possível definir limite de usos menor que o número de usos atuais');
        }
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.updatedAt = new Date();
    }
  },

  // Antes de deletar um voucher
  beforeDelete: {
    name: 'validar-exclusao-voucher',
    run: async (ctx) => {
      const { target } = ctx;

      // Não pode deletar voucher que já foi usado
      if (target.currentUses > 0) {
        throw new Error('Não é possível deletar voucher que já foi utilizado');
      }

      // Verificar se voucher está ativo
      if (target.isActive) {
        throw new Error('Não é possível deletar voucher ativo. Desative primeiro');
      }
    }
  },

  // Depois de criar voucher (para logs/auditoria)
  afterCreate: {
    name: 'pos-criacao-voucher',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Novo voucher criado: ${result.code} - ${result.description} - Desconto: ${result.discountValue}${result.discountType === 'percentual' ? '%' : ' reais'}`);
      
      // Aqui você pode adicionar:
      // - Envio de notificações para admins
      // - Criação de registros de auditoria
      // - Integração com sistemas externos
    }
  }
};
