import { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';

// Plugin para sanitização de dados (substitui express-mongo-sanitize e xss-clean)
const sanitizePlugin: FastifyPluginCallback = (fastify, options, done) => {
  
  // Hook para sanitizar dados de entrada
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.body && typeof request.body === 'object') {
      sanitizeObject(request.body);
    }
    
    if (request.query && typeof request.query === 'object') {
      sanitizeObject(request.query);
    }
    
    if (request.params && typeof request.params === 'object') {
      sanitizeObject(request.params);
    }
  });

  done();
};

/**
 * Sanitiza um objeto removendo caracteres perigosos
 */
function sanitizeObject(obj: any): void {
  if (!obj || typeof obj !== 'object') return;

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        // Remover operadores MongoDB perigosos
        if (key.startsWith('$') || key.includes('.')) {
          delete obj[key];
          continue;
        }
        
        // Sanitizar XSS básico
        obj[key] = sanitizeString(value);
        
      } else if (Array.isArray(value)) {
        // Sanitizar arrays
        value.forEach((item, index) => {
          if (typeof item === 'string') {
            value[index] = sanitizeString(item);
          } else if (typeof item === 'object') {
            sanitizeObject(item);
          }
        });
        
      } else if (typeof value === 'object' && value !== null) {
        // Recursivamente sanitizar objetos aninhados
        sanitizeObject(value);
      }
    }
  }
}

/**
 * Sanitiza uma string removendo scripts e caracteres perigosos
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;
  
  return str
    // Remover tags script
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remover eventos JavaScript
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remover javascript: urls
    .replace(/javascript:/gi, '')
    // Escapar caracteres HTML básicos
    .replace(/[<>]/g, (match) => {
      return match === '<' ? '&lt;' : '&gt;';
    });
}

export default fp(sanitizePlugin, {
  name: 'sanitize-plugin'
});
