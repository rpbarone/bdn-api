/**
 * Hooks do modelo Order - Versão Otimizada
 * Apenas validações que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar um pedido
  beforeCreate: {
    name: 'preparar-criacao-pedido',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar se ID já existe (policies não fazem queries)
      if (data.id) {
        const existingOrder = await ctx.Model.findOne({ 
          id: data.id 
        });
        
        if (existingOrder) {
          throw new Error('ID de pedido já está em uso');
        }
      }

      // Se não tiver ID, gerar automaticamente
      if (!data.id) {
        const lastOrder = await ctx.Model.findOne().sort({ id: -1 }).select('id');
        let nextNumber = 1000;
        
        if (lastOrder && lastOrder.id) {
          const match = lastOrder.id.match(/^ORD(\d+)$/);
          if (match) {
            nextNumber = parseInt(match[1]) + 1;
          }
        }
        
        data.id = `ORD${nextNumber}`;
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
    }
  },

  // Antes de atualizar um pedido
  beforeUpdate: {
    name: 'preparar-atualizacao-pedido',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Se estiver mudando o status, adicionar ao histórico
      if (data.status && data.status.current && data.status.current !== target?.status?.current) {
        // Garantir que a estrutura existe
        if (!data.status.history) {
          data.status.history = target?.status?.history || [];
        }

        // Adicionar novo status ao histórico
        data.status.history.push({
          status: data.status.current,
          timestamp: new Date(),
          changedBy: user._id
        });
      }

      // Se estiver adicionando dados de invoice, criar histórico
      if (data.invoice && target?.invoice) {
        const changes = [];
        
        // Verificar mudanças em cada campo de invoice
        ['number', 'issueDate', 'series', 'accessKey', 'pdfUrl'].forEach(field => {
          if (data.invoice[field] && data.invoice[field] !== target.invoice[field]) {
            changes.push({
              field: `invoice.${field}`,
              oldValue: target.invoice[field],
              newValue: data.invoice[field],
              changedAt: new Date(),
              changedBy: user._id
            });
          }
        });

        if (changes.length > 0) {
          if (!data.invoice.history) {
            data.invoice.history = target.invoice.history || [];
          }
          data.invoice.history.push(...changes);
        }
      }

      // Se estiver adicionando dados de tracking, criar histórico
      if (data.tracking && target?.tracking) {
        const changes = [];
        
        // Verificar mudanças em cada campo de tracking
        ['code', 'carrier', 'shippingMethod'].forEach(field => {
          if (data.tracking[field] && data.tracking[field] !== target.tracking[field]) {
            changes.push({
              field: `tracking.${field}`,
              oldValue: target.tracking[field],
              newValue: data.tracking[field],
              changedAt: new Date(),
              changedBy: user._id
            });
          }
        });

        if (changes.length > 0) {
          if (!data.tracking.history) {
            data.tracking.history = target.tracking.history || [];
          }
          data.tracking.history.push(...changes);
        }
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.updatedAt = new Date();
    }
  },

  // Depois de criar pedido (para logs/auditoria)
  afterCreate: {
    name: 'pos-criacao-pedido',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Novo pedido criado: ${result.id} - Tipo: ${result.type} - Status: ${result.status.current}`);
      
      // Aqui você pode adicionar:
      // - Envio de email de confirmação
      // - Notificações para admins
      // - Integração com sistemas externos
    }
  }
};
