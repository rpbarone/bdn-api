/**
 * Hooks do modelo Customer - Versão Otimizada
 * Apenas validações que as policies não conseguem fazer
 * IMPORTANTE: Customers só podem ser atualizados (notes e tags), nunca criados ou deletados
 */

module.exports = {
  // Antes de atualizar um customer
  beforeUpdate: {
    name: 'preparar-atualizacao-customer',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Se estiver adicionando tags, validar valores
      if (data.tags) {
        const validTags = ['Frequente', 'Novo', 'VIP', 'Ativo', 'Inativo', 'Lead'];
        const invalidTags = data.tags.filter(tag => !validTags.includes(tag));
        
        if (invalidTags.length > 0) {
          throw new Error(`Tags inválidas: ${invalidTags.join(', ')}`);
        }
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.updatedAt = new Date();
    }
  },

  // Hook para adicionar nota ao customer
  beforeAddNote: {
    name: 'validar-adicao-nota',
    run: async (ctx) => {
      const { data } = ctx;

      // Validar que a nota tem conteúdo
      if (!data.content || data.content.trim().length === 0) {
        throw new Error('Conteúdo da nota é obrigatório');
      }

      // Limitar tamanho da nota
      if (data.content.length > 1000) {
        throw new Error('Nota não pode ter mais de 1000 caracteres');
      }
    }
  },

  // Depois de atualizar customer (para logs/auditoria)
  afterUpdate: {
    name: 'pos-atualizacao-customer',
    run: async (ctx) => {
      const { result, data } = ctx;
      
      // Log de auditoria
      if (data.notes) {
        console.log(`📝 Nova nota adicionada ao customer: ${result.name} (${result.id})`);
      }
      if (data.tags) {
        console.log(`🏷️ Tags atualizadas do customer: ${result.name} (${result.id}) - Tags: ${result.tags.join(', ')}`);
      }
    }
  }
};
