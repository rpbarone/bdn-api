import * as fs from 'fs';
import * as path from 'path';
import mongoose, { Model } from 'mongoose';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  PolicyDefinition,
  PermissionContext,
  Operation,
  AppConfig
} from '../types';

// Auto-carregamento das policies
const carregarPolicies = (): Record<string, PolicyDefinition> => {
  const policies: Record<string, PolicyDefinition> = {};
  const policiesPath = path.join(__dirname, '../policies');

  if (!fs.existsSync(policiesPath)) {
    console.warn('⚠️ Pasta policies não encontrada');
    return policies;
  }

  fs.readdirSync(policiesPath).forEach(file => {
    if (file.endsWith('.js')) {
      const modelo = file.replace('.js', '');
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        policies[modelo] = require(path.join(policiesPath, file));
        console.log(`🛡️ Policy carregada: ${modelo}`);
      } catch (err: any) {
        console.error(`❌ Erro ao carregar policy ${file}: ${err.message}`);
      }
    }
  });

  return policies;
};

// Configuração global
const config: AppConfig = {
  roles: { influencer: 1, admin: 2, super_admin: 3 },
  defaultPolicy: 'deny',
  cacheEnabled: true,
  models: carregarPolicies()
};

const cache = new Map<string, any>();

/**
 * Normaliza objetos para garantir que tenham prototype correto
 * Resolve problemas com objetos retornados por .lean() do Mongoose
 */
const normalizarObjeto = (obj: any): any => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizarObjeto);
  
  // Se for Date, RegExp, etc, retornar como está
  if (obj.constructor && obj.constructor !== Object) return obj;
  
  // Se já tem hasOwnProperty, não precisa normalizar
  if (typeof obj.hasOwnProperty === 'function') return obj;
  
  // Criar novo objeto com prototype correto
  const normalizado: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      normalizado[key] = obj[key];
    }
  }
  return normalizado;
};

/**
 * Middleware de verificação de permissões para Fastify
 */
export const verificarPermissoes = (modelo: string) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const ctx = await criarContexto(request, modelo);

      // 1. Verificar se modelo está configurado
      if (config.defaultPolicy === 'deny' && !ctx.permissions) {
        const customReply = reply as any;
        return customReply.erro('Acesso negado: modelo não autorizado', 403);
      }

      // 2. Avaliar permissão da operação
      const temAcesso = await avaliarPermissao(ctx);
      if (!temAcesso) {
        const customReply = reply as any;
        return customReply.erro('Sem permissão para esta operação', 403);
      }

      // 3. Aplicar regras dinâmicas
      const regraViolada = await verificarRegras(ctx);
      if (regraViolada) {
        const customReply = reply as any;
        return customReply.erro(regraViolada, 403);
      }

      // 4. Filtrar campos de entrada (write)
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        filtrarCamposEscrita(ctx);
      }

      // 5. Preparar filtro de saída (read)
      if (request.method === 'GET') {
        request.permissionFilter = (data: any) => filtrarCamposLeitura(data, ctx);
      }

      // 6. Armazenar contexto para uso posterior
      request.permissionContext = ctx;

    } catch (err: any) {
      console.error('Erro na verificação de permissões:', err);
      const customReply = reply as any;
      return customReply.erro('Erro na verificação de permissões', 500);
    }
  };
};

/**
 * Cria contexto de permissão com cache inteligente
 */
const criarContexto = async (req: FastifyRequest, modelo: string): Promise<PermissionContext> => {
  const { user, method, params, body } = req;
  const operacao = mapearOperacao(method);
  const permissions = config.models[modelo];

  let target = null;

  // Cache inteligente para evitar consultas duplicadas
  if ((params as any)?.id && ['GET', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const cacheKey = `${modelo}:${(params as any).id}`;

    if (config.cacheEnabled && cache.has(cacheKey)) {
      target = cache.get(cacheKey);
    } else {
      try {
        const Model: Model<any> = mongoose.model(modelo);
        target = await Model.findById((params as any).id).lean();

        if (config.cacheEnabled && target) {
          cache.set(cacheKey, target);
          // Auto-limpeza do cache após 30s
          setTimeout(() => cache.delete(cacheKey), 30000);
        }
      } catch (err: any) {
        console.error(`Erro ao buscar ${modelo}:`, err.message);
      }
    }
  }

  return {
    user: user!,
    target,
    operacao,
    permissions,
    body,
    params,
    isSelf: !!(target && user && target._id?.toString() === user._id?.toString())
  };
};

/**
 * Avalia se a operação é permitida
 */
const avaliarPermissao = async (ctx: PermissionContext): Promise<boolean> => {
  if (!ctx.permissions) return true; // Fallback permissivo

  const expr = ctx.permissions.permissions?.[ctx.operacao];
  if (!expr) return false;

  return avaliarExpressao(expr, ctx);
};

/**
 * Avalia uma expressão de permissão de forma segura
 */
const avaliarExpressao = (expr: string, ctx: PermissionContext): boolean => {
  const { user, target } = ctx;

  // Substituições inteligentes
  const contexto = {
    // Roles com operador +
    influencer: user.role === 'influencer',
    admin: user.role === 'admin',
    super_admin: user.role === 'super_admin',
    'influencer+': config.roles[user.role as keyof typeof config.roles] >= config.roles.influencer,
    'admin+': config.roles[user.role as keyof typeof config.roles] >= config.roles.admin,
    'super_admin+': config.roles[user.role as keyof typeof config.roles] >= config.roles.super_admin,

    // Contextos especiais
    isSelf: ctx.isSelf,
    self: user,
    target: target || {},

    // Funções auxiliares
    canModifyUser: (u: any, t: any) => !t || config.roles[u.role as keyof typeof config.roles] > config.roles[t.role as keyof typeof config.roles]
  };

  // Avaliação segura da expressão
  try {
    // Debug removido
    
    // Criar contexto seguro para eval
    const safeEval = (expr: string): boolean => {
      const { influencer, admin, super_admin, isSelf, self, target, canModifyUser } = contexto;
      const influencerPlus = contexto['influencer+'];
      const adminPlus = contexto['admin+'];
      const superAdminPlus = contexto['super_admin+'];
      const config = {
        roles: { influencer: 1, admin: 2, super_admin: 3 }
      };
      
      // Substituir operadores + na expressão
      const safeExpr = expr
        .replace(/influencer\+/g, 'influencerPlus')
        .replace(/admin\+/g, 'adminPlus')
        .replace(/super_admin\+/g, 'superAdminPlus');
      
      // Adicionar body ao contexto se existir
      const body = ctx.body || {};
      const operation = ctx.operacao;
      
      // console.log('DEBUG - Expressão original:', expr);
      // console.log('DEBUG - Expressão safe:', safeExpr);
      
      // eslint-disable-next-line no-eval
      return eval(safeExpr);
    };
    
    return safeEval(expr);
  } catch (err: any) {
    console.error(`Erro ao avaliar expressão: ${expr}`, err.message);
    return false; // Expressão inválida = negado
  }
};

/**
 * Verifica regras dinâmicas definidas na policy
 */
const verificarRegras = async (ctx: PermissionContext): Promise<string | null> => {
  if (!ctx.permissions?.rules) return null;

  for (const [nome, expr] of Object.entries(ctx.permissions.rules)) {
    try {
      // Pular regras que não se aplicam ao contexto atual
      if (!ctx.body && expr.includes('body.')) continue;
      if (!ctx.target && expr.includes('target.')) continue;
      
      const violou = !avaliarExpressao(expr, ctx);
      if (violou) {
        return `Regra violada: ${nome}`;
      }
    } catch (err: any) {
      console.error(`Erro ao verificar regra ${nome}:`, err.message);
      return `Erro na regra: ${nome}`;
    }
  }

  return null;
};

/**
 * Filtra campos permitidos para escrita
 */
const filtrarCamposEscrita = (ctx: PermissionContext): void => {
  const fieldsConfig = ctx.permissions?.fields?.write;
  if (!fieldsConfig || !ctx.body) return;

  // Normalizar body antes de processar
  ctx.body = normalizarObjeto(ctx.body);

  const { user, body, isSelf } = ctx;
  const camposPermitidos = new Set<string>();

  // Construir whitelist baseada no role e contexto
  Object.entries(fieldsConfig).forEach(([nivel, campos]) => {
    if (nivel === 'own' && isSelf) {
      campos.forEach(c => camposPermitidos.add(c));
    } else if (nivel === user.role || (nivel === 'admin' && user.role === 'super_admin')) {
      campos.forEach(c => camposPermitidos.add(c));
    }
  });

  // Super admin com '*' pode tudo
  if (camposPermitidos.has('*')) return;

  // Filtrar body mantendo apenas campos permitidos
  Object.keys(body).forEach(campo => {
    if (!camposPermitidos.has(campo)) {
      delete body[campo];
    }
  });
};

/**
 * Filtra campos permitidos para leitura
 */
const filtrarCamposLeitura = (data: any, ctx: PermissionContext): any => {
  const fieldsConfig = ctx.permissions?.fields?.read;
  if (!fieldsConfig || !data) return data;

  // Normalizar dados antes de processar
  const dadosNormalizados = normalizarObjeto(data);

  const { user, isSelf } = ctx;
  const camposPermitidos = new Set<string>();

  // Construir conjunto de campos visíveis
  Object.entries(fieldsConfig).forEach(([nivel, campos]) => {
    if (nivel === 'public') {
      campos.forEach(c => camposPermitidos.add(c));
    } else if (nivel === 'own' && isSelf) {
      campos.forEach(c => camposPermitidos.add(c));
    } else if (nivel === user.role || (config.roles[user.role as keyof typeof config.roles] >= config.roles[nivel as keyof typeof config.roles])) {
      campos.forEach(c => camposPermitidos.add(c));
    }
  });

  // Processar array ou objeto único
  const filtrar = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;

    const filtered: any = {};
    Object.keys(obj).forEach(key => {
      if (camposPermitidos.has(key)) {
        filtered[key] = obj[key];
      }
    });
    return filtered;
  };

  return Array.isArray(dadosNormalizados) ? dadosNormalizados.map(filtrar) : filtrar(dadosNormalizados);
};

/**
 * Mapeia método HTTP para operação
 */
const mapearOperacao = (method: string): Operation => {
  const mapa: Record<string, Operation> = {
    GET: 'read',
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete'
  };
  return mapa[method] as Operation;
};
