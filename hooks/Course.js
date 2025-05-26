/**
 * Hooks do modelo Course - Versão Otimizada
 * Apenas validações que as policies não conseguem fazer
 */

module.exports = {
  // Antes de criar um curso
  beforeCreate: {
    name: 'preparar-criacao-curso',
    run: async (ctx) => {
      const { data, user } = ctx;

      // Validar se título já existe (policies não fazem queries)
      if (data.title) {
        const existingCourse = await ctx.Model.findOne({ 
          title: data.title 
        });
        
        if (existingCourse) {
          throw new Error('Já existe um curso com este título');
        }
      }

      // Normalizar título para busca (útil para filtros)
      if (data.title) {
        data.titleNormalized = data.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Garantir que createdBy e updatedBy sejam definidos
      data.createdBy = user._id;
      data.updatedBy = user._id;

      // Calcular duração total do curso baseado nas lições
      if (data.lessons && data.lessons.length > 0) {
        data.durationSeconds = data.lessons.reduce((total, lesson) => {
          return total + (lesson.durationSeconds || 0);
        }, 0);
      }

      // Garantir que apenas um curso seja inicial
      if (data.isInitial) {
        const currentInitial = await ctx.Model.findOne({ isInitial: true });
        if (currentInitial) {
          throw new Error('Já existe um curso marcado como inicial. Remova a marcação do outro curso primeiro.');
        }
      }
    }
  },

  // Antes de atualizar um curso
  beforeUpdate: {
    name: 'preparar-atualizacao-curso',
    run: async (ctx) => {
      const { data, user, target } = ctx;

      // Validar título único se estiver sendo alterado
      if (data.title && data.title !== target?.title) {
        const existingCourse = await ctx.Model.findOne({ 
          title: data.title,
          _id: { $ne: target._id }
        });
        
        if (existingCourse) {
          throw new Error('Já existe um curso com este título');
        }
      }

      // Atualizar título normalizado se título mudar
      if (data.title) {
        data.titleNormalized = data.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      // Recalcular duração se lições mudarem
      if (data.lessons && data.lessons.length > 0) {
        data.durationSeconds = data.lessons.reduce((total, lesson) => {
          return total + (lesson.durationSeconds || 0);
        }, 0);
      }

      // Validar mudança de curso inicial
      if (data.isInitial && !target?.isInitial) {
        const currentInitial = await ctx.Model.findOne({ 
          isInitial: true,
          _id: { $ne: target._id }
        });
        if (currentInitial) {
          throw new Error('Já existe um curso marcado como inicial. Remova a marcação do outro curso primeiro.');
        }
      }

      // Garantir que updatedBy seja definido
      data.updatedBy = user._id;
      data.updatedAt = new Date();
    }
  },

  // Antes de deletar um curso
  beforeDelete: {
    name: 'validar-exclusao-curso',
    run: async (ctx) => {
      const { target } = ctx;

      // Não pode deletar curso inicial se for o único curso
      if (target.isInitial) {
        const totalCourses = await ctx.Model.countDocuments({ 
          _id: { $ne: target._id }
        });
        
        if (totalCourses === 0) {
          throw new Error('Não é possível deletar o único curso do sistema');
        }
      }

      // Verificar se há usuários que completaram este curso (futura implementação)
      // Por enquanto, apenas log de aviso
      if (target.conclusions > 0) {
        console.log(`⚠️ Atenção: Deletando curso com ${target.conclusions} conclusões`);
      }
    }
  },

  // Depois de criar curso (para logs/auditoria)
  afterCreate: {
    name: 'pos-criacao-curso',
    run: async (ctx) => {
      const { result } = ctx;
      
      // Log de auditoria
      console.log(`✅ Novo curso criado: ${result.title} - Ativo: ${result.isActive ? 'Sim' : 'Não'} - Inicial: ${result.isInitial ? 'Sim' : 'Não'}`);
      
      // Aqui você pode adicionar:
      // - Notificações para admins
      // - Invalidação de cache
      // - Atualização de índices de busca
    }
  },

  // Depois de atualizar curso
  afterUpdate: {
    name: 'pos-atualizacao-curso',
    run: async (ctx) => {
      const { result, target } = ctx;
      
      // Log de mudanças importantes
      if (target.isActive !== result.isActive) {
        console.log(`🔄 Curso ${result.title} ${result.isActive ? 'ativado' : 'desativado'}`);
      }
      
      if (target.isInitial !== result.isInitial) {
        console.log(`🎯 Curso ${result.title} ${result.isInitial ? 'marcado como inicial' : 'desmarcado como inicial'}`);
      }
    }
  }
};
