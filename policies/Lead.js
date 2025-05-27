/**
 * Policy de segurança para o modelo Lead
 * Define permissões e campos acessíveis por role
 * Admin e super_admin têm os mesmos privilégios
 */

module.exports = {
  // Permissões por operação
  permissions: {
    // Leitura: influencer não pode, admin e super_admin podem ver todos
    read: 'admin+',
    
    // Criação: ninguém pode criar leads (leads são criados pelo sistema)
    create: 'never',
    
    // Atualização: apenas admin+ pode atualizar leads
    update: 'admin+',
    
    // Exclusão: ninguém pode deletar leads
    delete: 'never'
  },

  // Campos acessíveis por role
  fields: {
    // Campos visíveis na leitura
    read: {
      // Campos que admin pode ver (tudo)
      admin: ['*'],
      
      // Campos que super_admin pode ver (tudo)
      super_admin: ['*']
    },
    
    // Campos modificáveis na escrita
    write: {
      // Campos que admin pode modificar (apenas adminReview e currentStage)
      admin: ['adminReview', 'currentStage'],
      
      // Campos que super_admin pode modificar (apenas adminReview e currentStage)
      super_admin: ['adminReview', 'currentStage']
    }
  },

  // Regras de negócio adicionais
  rules: {
    // Updates só permitidos em adminReview e currentStage
    'only-review-updates': 'operation !== "update" || (Object.keys(body).every(key => ["adminReview", "currentStage"].includes(key)))',
    
    // Não pode criar lead com status approved sem atribuir nível
    'approved-needs-level': '!body.adminReview || body.adminReview.status !== "approved" || body.adminReview.assignedLevel',
    
    // Se aprovar, deve fornecer notas
    'approved-needs-notes': '!body.adminReview || body.adminReview.status !== "approved" || body.adminReview.notes',
    
    // Não pode alterar histórico de stages diretamente
    'no-stage-history-manipulation': '!body.stageHistory',
    
    // Não pode alterar timestamps de adminReview diretamente
    'no-manual-review-timestamps': '!body.adminReview || (!body.adminReview.reviewedAt && !body.adminReview.reviewedBy && !body.adminReview.statusChangedAt)',
    
    // Instagram username deve ser único se fornecido
    'unique-instagram': '!body.instagramUsername || !target || body.instagramUsername === target.instagramUsername',
    
    // Não pode alterar ID
    'no-id-change': '!body.id || !target || body.id === target.id',
    
    // Score de AI deve estar entre 0 e 100
    'valid-ai-scores': '!body.aiAnalysis || (!body.aiAnalysis.visualPerformanceScore || (body.aiAnalysis.visualPerformanceScore >= 0 && body.aiAnalysis.visualPerformanceScore <= 100))',
    
    // Engajamento e seguidores devem ser positivos
    'positive-metrics': '(!body.followers || body.followers >= 0) && (!body.engagement || body.engagement >= 0)',
    
    // Se rejeitar, deve fornecer motivo
    'rejected-needs-notes': '!body.adminReview || body.adminReview.status !== "rejected" || body.adminReview.notes'
  }
};
