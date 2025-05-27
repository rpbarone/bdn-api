/**
 * Hooks do modelo Product - Versão Otimizada
 * Apenas validações que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar um produto
  beforeCreate: {
    name: 'preparar-criacao-produto',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar se shopifyId já existe (policies não fazem queries)
      if (data.shopifyId) {
        const existingProduct = await ctx.Model.findOne({ 
          shopifyId: data.shopifyId 
        });
        
        if (existingProduct) {
          throw new Error('Shopify ID já está em uso');
        }
      }

      // Normalizar nome para busca (útil para filtros)
      if (data.name) {
        data.normalizedName = data.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Garantir que createdBy seja definido
      data.createdBy = user._id;
      data.updatedBy = user._id;

      // Definir status de estoque baseado em unidades disponíveis
      if (data.availableUnits !== undefined) {
        if (data.availableUnits === 0) {
          data.stockStatus = 'out_of_stock';
        } else if (data.availableUnits < 10) {
          data.stockStatus = 'low_stock';
        } else {
          data.stockStatus = 'in_stock';
        }
      }
    }
  },

  // Antes de atualizar um produto
  beforeUpdate: {
    name: 'preparar-atualizacao-produto',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Validar shopifyId único se estiver sendo alterado
      if (data.shopifyId && data.shopifyId !== target?.shopifyId) {
        const existingProduct = await ctx.Model.findOne({ 
          shopifyId: data.shopifyId,
          _id: { $ne: target._id }
        });
        
        if (existingProduct) {
          throw new Error('Shopify ID já está em uso');
        }
      }

      // Atualizar nome normalizado se nome mudar
      if (data.name) {
        data.normalizedName = data.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Atualizar status de estoque se unidades disponíveis mudarem
      if (data.availableUnits !== undefined) {
        if (data.availableUnits === 0) {
          data.stockStatus = 'out_of_stock';
        } else if (data.availableUnits < 10) {
          data.stockStatus = 'low_stock';
        } else {
          data.stockStatus = 'in_stock';
        }
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.updatedAt = new Date();
    }
  },

  // Antes de deletar um produto
  beforeDelete: {
    name: 'validar-exclusao-produto',
    run: async (ctx) => {
      const { target } = ctx;

      // Verificar se produto está vinculado a pedidos (seria necessário outro model)
      // Por enquanto, apenas log
      console.log(`⚠️ Deletando produto: ${target.name} (${target.shopifyId})`);
      
      // Aqui você pode adicionar validações como:
      // - Verificar se existem pedidos com este produto
      // - Verificar se existem carrinhos com este produto
      // - Etc.
    }
  },

  // Depois de criar produto (para logs/auditoria)
  afterCreate: {
    name: 'pos-criacao-produto',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Novo produto criado: ${result.name} (${result.shopifyId}) - Status: ${result.stockStatus}`);
      
      // Aqui você pode adicionar:
      // - Sincronização com Shopify
      // - Atualização de cache
      // - Notificações para admins sobre novo produto
    }
  },

  // Depois de atualizar produto
  afterUpdate: {
    name: 'pos-atualizacao-produto',
    run: async (ctx) => {
      const { result, target } = ctx;
      
      // Log mudanças importantes
      if (target.stockStatus !== result.stockStatus) {
        console.log(`📦 Status de estoque alterado: ${target.name} - ${target.stockStatus} → ${result.stockStatus}`);
        
        // Aqui você pode adicionar notificações quando produto ficar sem estoque
        if (result.stockStatus === 'out_of_stock') {
          console.log(`🚨 Produto sem estoque: ${result.name}`);
          // Enviar notificação para admins
        }
      }
    }
  }
};
