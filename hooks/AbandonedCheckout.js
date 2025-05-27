/**
 * Hooks do modelo AbandonedCheckout
 * Validações e lógica de negócio que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar um checkout abandonado
  beforeCreate: {
    name: 'preparar-criacao-abandoned-checkout',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar que tenha pelo menos influencerId ou customerId ou guestEmail
      if (!data.influencerId && !data.customerId && !data.guestEmail) {
        throw new Error('É necessário informar influencerId, customerId ou guestEmail');
      }

      // Validar que itens tenham pelo menos 1 produto
      if (!data.items || data.items.length === 0) {
        throw new Error('Carrinho vazio não pode ser salvo como checkout abandonado');
      }

      // Calcular totais automaticamente se não fornecidos
      if (!data.totals || !data.totals.products) {
        let totalCash = 0;
        let totalBodycoins = 0;

        data.items.forEach(item => {
          if (item.priceType === 'cash') {
            totalCash += item.price * item.quantity;
          } else if (item.priceType === 'bodycoins') {
            totalBodycoins += item.price * item.quantity;
          }
        });

        data.totals = data.totals || {};
        data.totals.products = {
          cash: totalCash,
          bodycoins: totalBodycoins
        };
      }

      // Garantir valores padrão para analytics
      if (!data.checkoutAnalytics) {
        data.checkoutAnalytics = {
          timeSpentSeconds: 0,
          viewCount: 1,
          lastViewedDate: new Date()
        };
      }

      // Garantir que abandonedAt tenha timestamp
      if (data.abandonedAt && !data.abandonedAt.timestamp) {
        data.abandonedAt.timestamp = new Date();
      }

      // Para B2I, validar que influencerId existe
      if (data.type === 'b2i' && !data.influencerId) {
        throw new Error('Checkout B2I requer influencerId');
      }

      // Para B2C, validar que tenha customer ou guest
      if (data.type === 'b2c' && !data.customerId && !data.guestEmail) {
        throw new Error('Checkout B2C requer customerId ou guestEmail');
      }
    }
  },

  // Antes de atualizar um checkout abandonado
  beforeUpdate: {
    name: 'preparar-atualizacao-abandoned-checkout',
    run: async (ctx) => {
      const { data, target } = ctx;

      // Se está marcando como convertido, validar orderId
      if (data.convertedToOrder && data.convertedToOrder.status === true) {
        if (!data.convertedToOrder.orderId) {
          throw new Error('OrderId é obrigatório ao marcar checkout como convertido');
        }
        
        // Adicionar data de conversão se não fornecida
        if (!data.convertedToOrder.conversionDate) {
          data.convertedToOrder.conversionDate = new Date();
        }
      }

      // Recalcular totais se itens foram modificados
      if (data.items && data.items.length > 0) {
        let totalCash = 0;
        let totalBodycoins = 0;

        data.items.forEach(item => {
          if (item.priceType === 'cash') {
            totalCash += item.price * item.quantity;
          } else if (item.priceType === 'bodycoins') {
            totalBodycoins += item.price * item.quantity;
          }
        });

        data.totals = data.totals || target.totals || {};
        data.totals.products = {
          cash: totalCash,
          bodycoins: totalBodycoins
        };
      }

      // Atualizar lastViewedDate quando viewCount é incrementado
      if (data.checkoutAnalytics && data.checkoutAnalytics.viewCount > (target?.checkoutAnalytics?.viewCount || 0)) {
        data.checkoutAnalytics.lastViewedDate = new Date();
      }

      data.updatedAt = new Date();
    }
  },

  // Antes de deletar um checkout abandonado
  beforeDelete: {
    name: 'validar-exclusao-abandoned-checkout',
    run: async (ctx) => {
      const { target } = ctx;

      // Não permitir deletar se foi convertido em pedido
      if (target?.convertedToOrder?.status === true) {
        throw new Error('Não é possível deletar um checkout que foi convertido em pedido');
      }
    }
  },

  // Depois de criar checkout abandonado (para logs/notificações)
  afterCreate: {
    name: 'pos-criacao-abandoned-checkout',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`🛒 Novo checkout abandonado: ${result.id} - Tipo: ${result.type} - Stage: ${result.abandonedAt.stage}`);
      
      // Aqui você pode adicionar:
      // - Agendamento de emails de recuperação
      // - Notificações para equipe de vendas
      // - Analytics de abandono
    }
  },

  // Depois de atualizar checkout (para tracking)
  afterUpdate: {
    name: 'pos-atualizacao-abandoned-checkout',
    run: async (ctx) => {
      const { result, target } = ctx;
      
      // Se foi convertido, log especial
      if (result.convertedToOrder?.status && !target?.convertedToOrder?.status) {
        console.log(`✅ Checkout ${result.id} convertido em pedido ${result.convertedToOrder.orderId}`);
        
        // Aqui você pode adicionar:
        // - Métricas de conversão
        // - Parar campanhas de recuperação
        // - Analytics de sucesso
      }
    }
  }
};
