/**
 * Hooks do modelo Lead - Versão Otimizada
 * Apenas validações que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar um lead
  beforeCreate: {
    name: 'preparar-criacao-lead',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar se instagramUsername já existe (policies não fazem queries)
      if (data.instagramUsername) {
        const existingLead = await ctx.Model.findOne({ 
          instagramUsername: data.instagramUsername.toLowerCase() 
        });
        
        if (existingLead) {
          throw new Error('Instagram username já está em uso');
        }
      }

      // Normalizar nome para busca (útil para filtros)
      if (data.name) {
        data.normalizedName = data.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Garantir que adminReview seja inicializado corretamente
      if (!data.adminReview) {
        data.adminReview = { status: 'pending' };
      }
    }
  },

  // Antes de atualizar um lead
  beforeUpdate: {
    name: 'preparar-atualizacao-lead',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Validar instagram único se estiver sendo alterado
      if (data.instagramUsername && data.instagramUsername !== target?.instagramUsername) {
        const existingLead = await ctx.Model.findOne({ 
          instagramUsername: data.instagramUsername.toLowerCase(),
          _id: { $ne: target._id }
        });
        
        if (existingLead) {
          throw new Error('Instagram username já está em uso');
        }
      }

      // Atualizar nome normalizado se nome mudar
      if (data.name) {
        data.normalizedName = data.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Se status de review mudou, registrar quem alterou e quando
      if (data.adminReview && data.adminReview.status && data.adminReview.status !== target?.adminReview?.status) {
        // Preservar estado anterior
        data.adminReview.previousStatus = target?.adminReview?.status;
        data.adminReview.previousReviewedAt = target?.adminReview?.reviewedAt;
        data.adminReview.previousReviewedBy = target?.adminReview?.reviewedBy;
        data.adminReview.previousNotes = target?.adminReview?.notes;
        
        // Atualizar novo estado
        data.adminReview.reviewedBy = user._id;
        data.adminReview.reviewedAt = new Date();
        data.adminReview.statusChangedAt = new Date();
      }

      // Atualizar timestamp
      data.updatedAt = new Date();
    }
  },

  // Depois de criar lead (para logs/auditoria)
  afterCreate: {
    name: 'pos-criacao-lead',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Novo lead criado: ${result.name} (${result.instagramUsername || 'sem instagram'}) - Stage: ${result.currentStage}`);
      
      // Aqui você pode adicionar:
      // - Envio de notificações para admins
      // - Criação de atividade inicial no histórico
      // - Integração com sistemas externos
    }
  },

  // Depois de atualizar lead (para rastreamento)
  afterUpdate: {
    name: 'pos-atualizacao-lead',
    run: async (ctx) => {
      const { result, user } = ctx;
      
      // Log de mudanças importantes
      if (result.adminReview?.statusChangedAt) {
        console.log(`🔄 Status do lead ${result.name} alterado para ${result.adminReview.status} por ${user.name}`);
        
        // Aqui você pode adicionar:
        // - Notificações sobre mudança de status
        // - Atualização de métricas
        // - Webhooks para sistemas externos
      }
    }
  }
};
