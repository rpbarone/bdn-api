import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import User from '../models/User';
import { requireAdmin } from '../middlewares/jwt';

interface ProcessWhatsAppMembersBody {
  content: string;
}

interface WhatsAppMemberUpdate {
  phone: string;
  action: 'joined' | 'left';
}

export default async function whatsappRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/whatsapp/process-members
   * Processa texto copiado do WhatsApp para atualizar membros do grupo
   */
  fastify.post<{ Body: ProcessWhatsAppMembersBody }>('/process-members', {
    preHandler: [requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: ProcessWhatsAppMembersBody }>, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const { content } = request.body;
      
      // Padrões para detectar entradas e saídas
      // Exemplos típicos:
      // +55 11 99999-9999 entrou
      // +55 11 99999-9999 saiu
      // +55 11 99999-9999 foi adicionado(a)
      // +55 11 99999-9999 foi removido(a)
      
      const memberUpdates: WhatsAppMemberUpdate[] = [];
      
      // Regex para capturar números de telefone com ou sem DDI
      // Captura formatos como: +55 11 99999-9999, 11999999999, (11) 99999-9999, etc.
      const phoneRegex = /(?:\+?(\d{1,3})\s?)?(?:\(?\d{2,3}\)?\s?)?\d{4,5}[-\s]?\d{4}/g;
      
      // Dividir o conteúdo em linhas
      const lines = content.split('\n');
      
      for (const line of lines) {
        // Ignorar linhas que não são sobre membros (mensagens normais)
        const lowerLine = line.toLowerCase();
        
        // Detectar se é uma linha sobre entrada/saída
        const isJoin = lowerLine.includes('entrou') || 
                      lowerLine.includes('foi adicionado') || 
                      lowerLine.includes('foi adicionada') ||
                      lowerLine.includes('added') ||
                      lowerLine.includes('joined');
                      
        const isLeave = lowerLine.includes('saiu') || 
                       lowerLine.includes('foi removido') || 
                       lowerLine.includes('foi removida') ||
                       lowerLine.includes('removed') ||
                       lowerLine.includes('left');
        
        if (!isJoin && !isLeave) continue;
        
        // Extrair números de telefone da linha
        const phoneMatches = line.match(phoneRegex);
        
        if (phoneMatches && phoneMatches.length > 0) {
          for (const phoneMatch of phoneMatches) {
            // Limpar o número, removendo tudo que não é dígito
            let cleanPhone = phoneMatch.replace(/\D/g, '');
            
            // Remover DDI se presente (assumindo que DDI tem 2 dígitos)
            // Se o número tem mais de 11 dígitos, provavelmente tem DDI
            if (cleanPhone.length > 11) {
              // Remover os primeiros dígitos que representam o DDI
              // DDI brasileiro é 55, mas pode ser outro
              const possibleDDILength = cleanPhone.length - 11;
              cleanPhone = cleanPhone.substring(possibleDDILength);
            }
            
            // Validar se o número tem formato válido (10 ou 11 dígitos)
            if (cleanPhone.length === 10 || cleanPhone.length === 11) {
              memberUpdates.push({
                phone: cleanPhone,
                action: isJoin ? 'joined' : 'left'
              });
            }
          }
        }
      }
      
      // Remover duplicatas (caso o mesmo número apareça várias vezes)
      const uniqueUpdates = memberUpdates.reduce((acc: WhatsAppMemberUpdate[], curr) => {
        const existing = acc.find(u => u.phone === curr.phone);
        if (!existing) {
          acc.push(curr);
        } else {
          // Se já existe, manter a ação mais recente (última no texto)
          existing.action = curr.action;
        }
        return acc;
      }, []);
      
      // Processar atualizações no banco
      const results = {
        processed: 0,
        updated: 0,
        notFound: 0,
        errors: 0,
        details: [] as any[]
      };
      
      for (const update of uniqueUpdates) {
        results.processed++;
        
        try {
          // Buscar usuário pelo telefone
          const user = await User.findOne({ phone: update.phone });
          
          if (user) {
            // Atualizar status do WhatsApp
            const newStatus = update.action === 'joined';
            
            // Só atualizar se o status mudou
            if (user.onboarding?.whatsappGroupMember !== newStatus) {
              await User.findByIdAndUpdate(user._id, {
                'onboarding.whatsappGroupMember': newStatus,
                updatedBy: request.user!._id
              });
              
              results.updated++;
              results.details.push({
                phone: update.phone,
                name: user.name,
                action: update.action,
                status: 'updated'
              });
            } else {
              results.details.push({
                phone: update.phone,
                name: user.name,
                action: update.action,
                status: 'no_change'
              });
            }
          } else {
            results.notFound++;
            results.details.push({
              phone: update.phone,
              action: update.action,
              status: 'not_found'
            });
          }
        } catch (error: any) {
          results.errors++;
          results.details.push({
            phone: update.phone,
            action: update.action,
            status: 'error',
            error: error.message
          });
        }
      }
      
      return customReply.sucesso(results, 'Processamento concluído');
      
    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao processar membros do WhatsApp', 500);
    }
  });
}
