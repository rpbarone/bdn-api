/**
 * Policy de segurança para o modelo Course
 * Define permissões e campos acessíveis por role
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: todos podem ver cursos ativos, admin+ pode ver todos
    read: 'true', // Todos usuários autenticados podem ver cursos
    
    // Criação: apenas admin+ pode criar cursos
    create: 'admin+',
    
    // Atualização: apenas admin+ pode atualizar cursos
    update: 'admin+',
    
    // Exclusão: apenas admin+ pode deletar cursos
    delete: 'admin+'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Campos públicos (visíveis para todos influencers)
      public: [
        'id',
        'title',
        'description',
        'coverPictureUrl',
        'isActive',
        'isInitial',
        'durationSeconds',
        'conclusions',
        'lessons',
        'quiz',
        'createdAt',
        'updatedAt',
        // Campos calculados
        'totalAulas',
        'duracaoTotal',
        'totalConclusoes'
      ],
      
      // Campos que admin pode ver (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode ver (tudo)
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Campos que admin pode modificar (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode modificar (tudo)
      super_admin: ['*']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Apenas cursos ativos são visíveis para influencers (exceto admin+)
    'active-courses-only': '!target || target.isActive || self.role !== "influencer"',
    
    // Não pode desativar curso inicial sem ter outro curso ativo
    'protect-initial-course': '!body.isActive || !target || !target.isInitial || body.isActive === true',
    
    // Validar estrutura de lições
    'valid-lessons': '!body.lessons || (Array.isArray(body.lessons) && body.lessons.length > 0)',
    
    // Validar estrutura do quiz se fornecido
    'valid-quiz': '!body.quiz || (!body.quiz.questions || Array.isArray(body.quiz.questions))',
    
    // Não pode criar curso sem lições
    'require-lessons-on-create': 'operation !== "create" || (body.lessons && Array.isArray(body.lessons) && body.lessons.length > 0)',
    
    // Campos de sistema não podem ser alterados manualmente
    'no-manual-system-fields': '!body.createdBy && !body.updatedBy && !body.conclusions',
    
    // Validar ordem das lições (deve ser sequencial)
    'sequential-lesson-order': '!body.lessons || body.lessons.every((lesson, index) => !lesson.order || lesson.order === index + 1)',
    
    // Quiz deve ter pelo menos uma pergunta se definido
    'quiz-has-questions': '!body.quiz || !body.quiz.questions || body.quiz.questions.length > 0',
    
    // Cada pergunta do quiz deve ter pelo menos 2 opções
    'quiz-question-options': '!body.quiz || !body.quiz.questions || body.quiz.questions.every(q => q.options && q.options.length >= 2)',
    
    // Cada pergunta do quiz deve ter exatamente uma resposta correta
    'quiz-single-correct': '!body.quiz || !body.quiz.questions || body.quiz.questions.every(q => q.options.filter(o => o.isCorrect).length === 1)'
  }
};
