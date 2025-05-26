import * as fs from 'fs';
import * as path from 'path';
import mongoose, { Model } from 'mongoose';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  HookContext,
  HookDefinition,
  ModelHooks,
  HookType,
  Operation
} from '../types';

// Auto-load
const hooks: Record<string, ModelHooks> = {};
const hooksPath = path.join(__dirname, '../hooks');

if (fs.existsSync(hooksPath)) {
  fs.readdirSync(hooksPath).forEach(file => {
    if (file.endsWith('.js')) {
      const modelo = file.replace('.js', '');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      hooks[modelo] = require(path.join(hooksPath, file));
      console.log(`🎣 Hooks carregados: ${modelo}`);
    }
  });
}

/**
 * Middleware para aplicar hooks antes e depois das operações para Fastify
 */
export const aplicarHooks = (modelo: string, operacao: string) => {
  // Garantir que operação seja minúscula
  const op = operacao.toLowerCase() as Operation;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const ctx = await criarContexto(request, modelo, op);

      // Before hooks
      await executar(`before${capitalizar(op)}` as HookType, ctx);

      request.hookCtx = ctx;
      request.afterHook = async (result: any) => {
        ctx.result = result;
        await executar(`after${capitalizar(op)}` as HookType, ctx);
      };

    } catch (err: any) {
      // Hook de erro com contexto completo
      try {
        const errorCtx: HookContext = {
          ...request.hookCtx!,
          error: err,
          model: modelo,
          operation: op
        };
        await executar('onError', errorCtx);
      } catch (hookErr: any) {
        console.error(`🚨 Erro no hook de erro: ${hookErr.message}`);
      }

      return reply.erro(err.message, err.statusCode || 500);
    }
  };
};

/**
 * Executa um hook específico para um modelo
 */
export const hook = async (modelo: string, nome: HookType, dados: Partial<HookContext>): Promise<void> => {
  const ctx: HookContext = {
    ...dados,
    model: modelo,
    Model: mongoose.model(modelo)
  } as HookContext;
  await executar(nome, ctx);
};

/**
 * Cria contexto inteligente para hooks
 */
const criarContexto = async (req: FastifyRequest, modelo: string, operacao: Operation): Promise<HookContext> => {
  const { user, body, params } = req;

  let target = null;
  if ((params as any)?.id && ['update', 'delete'].includes(operacao)) {
    try {
      const Model: Model<any> = mongoose.model(modelo);
      target = await Model.findById((params as any).id);
    } catch (err: any) {
      console.warn(`⚠️ Não foi possível carregar target para ${modelo}:${(params as any).id}`);
    }
  }

  return {
    user,
    data: body as Partial<any>,
    target,
    model: modelo,
    Model: mongoose.model(modelo),
    operation: operacao
  };
};

/**
 * Executor híbrido de hooks
 */
const executar = async (tipo: HookType, ctx: HookContext): Promise<void> => {
  const todosHooks: HookDefinition[] = [];

  // Global hooks
  if (hooks.global?.[tipo]) {
    todosHooks.push(...normalizarHook(hooks.global[tipo], `global.${tipo}`));
  }

  // Model hooks
  if (hooks[ctx.model]?.[tipo]) {
    todosHooks.push(...normalizarHook(hooks[ctx.model][tipo]!, `${ctx.model}.${tipo}`));
  }

  // Executar sequencialmente
  for (const hook of todosHooks) {
    try {
      // Avaliar condição
      if (hook.condition && !avaliarCondicao(hook.condition, ctx)) {
        console.log(`⏭️ ${hook.name}: condição não atendida`);
        continue;
      }

      console.log(`🎯 Executando: ${hook.name}`);
      await hook.run(ctx);

    } catch (err: any) {
      const errorMsg = `Hook '${hook.name}' falhou: ${err.message}`;
      console.error(`❌ ${errorMsg}`);

      // Propagar erro com contexto
      const hookError: any = new Error(errorMsg);
      hookError.hookName = hook.name;
      hookError.originalError = err;
      throw hookError;
    }
  }
};

/**
 * Normaliza diferentes formatos de hook para um formato padrão
 */
const normalizarHook = (
  hook: HookDefinition | HookDefinition[] | ((ctx: HookContext) => Promise<void>),
  fonte: string
): HookDefinition[] => {
  // Função simples -> wrapper
  if (typeof hook === 'function') {
    return [{
      name: fonte,
      run: hook
    }];
  }

  // Array de hooks
  if (Array.isArray(hook)) {
    return hook.map((h, index) => ({
      name: h.name || `${fonte}[${index}]`,
      condition: h.condition,
      run: h.run || (h as any).execute // Compatibilidade com 'execute'
    }));
  }

  // Objeto único
  const hookObj = hook as any;
  if (hookObj && (hookObj.run || hookObj.execute)) {
    return [{
      name: hookObj.name || fonte,
      condition: hookObj.condition,
      run: hookObj.run || hookObj.execute
    }];
  }

  console.warn(`⚠️ Hook inválido em ${fonte}`);
  return [];
};

/**
 * Avalia condições de hooks de forma segura
 */
const avaliarCondicao = (condicao: string, ctx: HookContext): boolean => {
  try {
    const contexto = {
      data: ctx.data || {},
      target: ctx.target || {},
      user: ctx.user || {},
      result: ctx.result || {},
      error: ctx.error || null,
      model: ctx.model,
      operation: ctx.operation
    };

    // NOTA: Condições são sempre hardcoded em arquivos de hook
    // Nunca vêm de input do usuário, então new Function é seguro aqui
    // eslint-disable-next-line @typescript-eslint/ban-types
    const func = new Function(...Object.keys(contexto), `return ${condicao}`) as (...args: any[]) => boolean;
    return func(...Object.values(contexto));
  } catch (err: any) {
    console.warn(`⚠️ Condição inválida: ${condicao} - ${err.message}`);
    return false;
  }
};

/**
 * Capitaliza primeira letra
 */
const capitalizar = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1);
