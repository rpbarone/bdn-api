import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function statusRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: {
      tags: ['Status'],
      summary: 'Verifica o status da API',
      response: {
        200: {
          type: 'object',
          properties: {
            sucesso: { type: 'boolean' },
            mensagem: { type: 'string' },
            dados: {
              type: 'object',
              properties: {
                api: { type: 'string' },
                versao: { type: 'string' },
                ambiente: { type: 'string' },
                timestamp: { type: 'string' }
              }
            },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    return customReply.sucesso({
      api: 'BDN API',
      versao: process.env.APP_VERSION || '1.0.0',
      ambiente: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    }, 'API funcionando normalmente');
  });
}
