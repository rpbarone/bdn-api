import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// ========================================
// CONFIGURAÇÕES OTIMIZADAS PARA ECONOMIA
// ========================================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_SMALL_APP = process.env.SMALL_APP_MODE === 'true';
const PORT = parseInt(process.env.PORT || '3000', 10);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/app';

// ========================================
// TIPOS
// ========================================
interface Logger {
  info: (msg: string) => void;
  error: (msg: string, error?: any) => void;
  warn: (msg: string) => void;
}

interface MongooseError extends Error {
  code?: number;
  keyValue?: Record<string, any>;
  errors?: Record<string, any>;
  statusCode?: number;
}

// ========================================
// LOGGING ECONÔMICO (OTIMIZADO PARA PAAS)
// ========================================
const createLogger = (): Logger => {
  // Em apps pequenos, console estruturado para PaaS (Railway/Fly.io)
  if (IS_SMALL_APP) {
    return {
      info: (msg: string) => {
        console.log(JSON.stringify({
          level: 'info',
          timestamp: new Date().toISOString(),
          message: msg,
          service: process.env.APP_NAME || 'api'
        }));
      },
      error: (msg: string, error?: any) => {
        console.error(JSON.stringify({
          level: 'error',
          timestamp: new Date().toISOString(),
          message: msg,
          error: error,
          service: process.env.APP_NAME || 'api'
        }));
      },
      warn: (msg: string) => {
        console.warn(JSON.stringify({
          level: 'warn',
          timestamp: new Date().toISOString(),
          message: msg,
          service: process.env.APP_NAME || 'api'
        }));
      }
    };
  }

  // Apps maiores podem ter logs em arquivo
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const winston = require('winston');
    if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

    const logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }: any) =>
          `${timestamp} [${level.toUpperCase()}]: ${message}`
        )
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: './logs/app.log',
          maxsize: 1048576, // 1MB apenas
          maxFiles: 2
        })
      ]
    });

    // Adicionar método error com suporte a dois parâmetros
    const originalError = logger.error.bind(logger);
    logger.error = (message: string, error?: any) => {
      if (error) {
        originalError(`${message} ${error}`);
      } else {
        originalError(message);
      }
    };

    return logger as Logger;
  } catch (err) {
    // Fallback para console se winston falhar
    return {
      info: (msg: string) => console.log(`INFO: ${msg}`),
      error: (msg: string, error?: any) => console.error(`ERROR: ${msg}`, error || ''),
      warn: (msg: string) => console.warn(`WARN: ${msg}`)
    };
  }
};

const logger = createLogger();

// ========================================
// CLUSTERING CONDICIONAL (PARA APPS MAIORES)
// ========================================
const shouldUseCluster = (): boolean => {
  return (
    IS_PRODUCTION &&
    !IS_SMALL_APP &&
    process.env.ENABLE_CLUSTERING === 'true'
  );
};

if (shouldUseCluster()) {
  let cluster: any;
  let os: any;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cluster = require('cluster');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    os = require('os');

    if (cluster.isMaster) {
      const numCPUs = Math.min(os.cpus().length, 4);
      logger.info(`Master ${process.pid} iniciando ${numCPUs} workers`);

      for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
      }

      cluster.on('exit', (worker: any, _code: number, _signal: string) => {
        logger.error(`Worker ${worker.process.pid} morreu. Reiniciando...`);
        cluster.fork();
      });

      // Graceful shutdown do cluster
      process.on('SIGTERM', () => {
        logger.info('Desligando cluster...');
        for (const id in cluster.workers) {
          cluster.workers[id].kill();
        }
      });
    } else {
      startServer();
    }
  } catch (err) {
    logger.error('Erro ao configurar cluster, iniciando servidor único', err);
    startServer();
  }
} else {
  // Executar servidor diretamente
  startServer();
}

async function startServer(): Promise<FastifyInstance> {
  const fastify: FastifyInstance = Fastify({
    logger: !IS_SMALL_APP || process.env.ENABLE_LOGS === 'true' ? {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: !IS_PRODUCTION
        }
      }
    } : false,
    bodyLimit: IS_SMALL_APP ? 1048576 : 10485760, // 1MB : 10MB
    trustProxy: IS_PRODUCTION
  });

  // ========================================
  // CONEXÃO MONGODB OTIMIZADA
  // ========================================
  const mongoOptions = {
    maxPoolSize: IS_SMALL_APP ? 3 : 10,
    serverSelectionTimeoutMS: 3000,
    socketTimeoutMS: 30000,
    maxIdleTimeMS: IS_SMALL_APP ? 10000 : 30000,
    bufferCommands: false
  };

  mongoose.connect(MONGODB_URI, mongoOptions);

  mongoose.connection.on('connected', () => {
    logger.info(`✅ MongoDB conectado: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
  });

  mongoose.connection.on('error', (err: Error) => {
    logger.error(`❌ Erro no MongoDB: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️ MongoDB desconectado');
  });

  // ========================================
  // REGISTRAR PLUGINS
  // ========================================

  // Helmet para segurança
  await fastify.register(require('@fastify/helmet'), {
    contentSecurityPolicy: IS_PRODUCTION ? {
      directives: {
        defaultSrc: ['\'none\'']
      }
    } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    referrerPolicy: { policy: 'no-referrer' }
  });

  // Rate limiting inteligente baseado no tamanho do app
  await fastify.register(require('@fastify/rate-limit'), {
    max: IS_SMALL_APP ? 200 : 100,
    timeWindow: '15 minutes',
    skipOnError: true,
    keyGenerator: (req: FastifyRequest) => {
      return req.ip;
    },
    skip: (req: FastifyRequest) => {
      return req.url === '/health' || req.url === '/';
    },
    errorResponseBuilder: () => {
      return {
        erro: 'Muitas requisições. Tente novamente em 15 minutos.',
        sucesso: false,
        timestamp: new Date().toISOString()
      };
    }
  });

  // CORS configurável e seguro
  const corsOptions = {
    origin: (() => {
      if (process.env.ALLOWED_ORIGINS) {
        return process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
      }
      if (!IS_PRODUCTION) {
        return ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'];
      }
      logger.warn('⚠️ ALLOWED_ORIGINS não definido em produção - CORS bloqueado');
      return false;
    })(),
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  };
  await fastify.register(require('@fastify/cors'), corsOptions);

  // Compressão (importante para Railway/Fly.io)
  await fastify.register(require('@fastify/compress'), {
    global: true,
    threshold: 1024
  });

  // Plugin de sanitização (substitui express-mongo-sanitize e xss-clean)
  await fastify.register(require('./plugins/sanitize'));

  // Plugin de cookies (necessário para autenticação JWT)
  await fastify.register(require('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET || 'default-secret'
  });

  // ========================================
  // SWAGGER CONDICIONAL (SÓ EM DEV/STAGING)
  // ========================================
  if (!IS_PRODUCTION || process.env.ENABLE_DOCS === 'true') {
    await fastify.register(require('@fastify/swagger'), {
      swagger: {
        info: {
          title: process.env.APP_NAME || 'API BDN',
          description: 'Documentação da API BDN',
          version: '1.0.0'
        },
        host: process.env.BASE_URL?.replace(/^https?:\/\//, '') || `localhost:${PORT}`,
        schemes: IS_PRODUCTION ? ['https'] : ['http'],
        consumes: ['application/json'],
        produces: ['application/json']
      }
    });

    await fastify.register(require('@fastify/swagger-ui'), {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'full',
        deepLinking: false
      },
      staticCSP: true,
      transformStaticCSP: (header: string) => header
    });

    logger.info('📚 Documentação disponível em /docs');
  }

  // ========================================
  // HOOK DE RESPOSTA PADRONIZADA BR
  // ========================================
  fastify.decorateReply('sucesso', function(this: FastifyReply, dados: any, mensagem: string = 'Sucesso', codigo: number = 200) {
    return this.status(codigo).send({
      sucesso: true,
      mensagem,
      dados,
      timestamp: new Date().toISOString()
    });
  });

  fastify.decorateReply('erro', function(this: FastifyReply, mensagem: string = 'Erro interno do servidor', codigo: number = 500, detalhes: any = null) {
    return this.status(codigo).send({
      sucesso: false,
      mensagem,
      detalhes,
      timestamp: new Date().toISOString()
    });
  });

  // ========================================
  // HEALTH CHECK ECONÔMICO
  // ========================================
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    const status = {
      status: 'online',
      uptime: Math.floor(process.uptime()),
      ambiente: process.env.NODE_ENV || 'desenvolvimento',
      versao: process.env.APP_VERSION || '1.0.0',
      database: mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado',
      memoria: IS_SMALL_APP ? 'otimizada' : process.memoryUsage()
    };

    return customReply.sucesso(status, 'Sistema funcionando normalmente');
  });

  // Métricas básicas só se não for app pequeno
  if (!IS_SMALL_APP) {
    fastify.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
      const customReply = reply as any;
      const metricas = {
        memoria_usada: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        uptime_segundos: process.uptime(),
        versao_node: process.version,
        plataforma: process.platform
      };

      return customReply.sucesso(metricas, 'Métricas do sistema');
    });
  }

  // ========================================
  // AUTO-CARREGAMENTO DE ROTAS
  // ========================================
  const routesPath = path.join(__dirname, 'routes');

  if (fs.existsSync(routesPath)) {
    fs.readdirSync(routesPath).forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        const routeName = file.replace(/\.(js|ts)$/, '');
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const routeModule = require(path.join(routesPath, file));
          
          // Registrar a rota como plugin
          fastify.register(async function (fastify) {
            const routes = routeModule.default || routeModule;
            if (typeof routes === 'function') {
              await routes(fastify);
            } else {
              logger.warn(`⚠️ Rota ${file} não exporta uma função válida`);
            }
          }, { prefix: `/api/${routeName}` });
          
          logger.info(`📁 Rota carregada: /api/${routeName}`);
        } catch (err: any) {
          logger.error(`❌ Erro ao carregar rota ${file}: ${err.message}`);
        }
      }
    });
  } else {
    logger.warn('⚠️ Pasta routes não encontrada');
  }

  // ========================================
  // TRATAMENTO DE ERROS EM PORTUGUÊS
  // ========================================
  fastify.setErrorHandler(async (error: MongooseError, request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    logger.error(`Erro não tratado: ${error.message}`);

    // Erros específicos do Mongoose em português
    if (error.name === 'ValidationError') {
      const erros = Object.values(error.errors || {}).map((e: any) => ({
        campo: e.path,
        mensagem: traduzirErroMongo(e.message),
        valor: e.value
      }));
      return customReply.erro('Erro de validação dos dados', 400, erros);
    }

    if (error.name === 'CastError') {
      return customReply.erro('ID inválido fornecido', 400);
    }

    if (error.code === 11000) {
      const campo = Object.keys(error.keyValue || {})[0];
      return customReply.erro(`${campo} já existe`, 400);
    }

    // Erros JWT
    if (error.name === 'JsonWebTokenError') {
      return customReply.erro('Token inválido', 401);
    }

    if (error.name === 'TokenExpiredError') {
      return customReply.erro('Token expirado', 401);
    }

    // Erro genérico
    return customReply.erro(
      IS_PRODUCTION ? 'Erro interno do servidor' : error.message,
      error.statusCode || 500
    );
  });

  // Tradutor de erros do Mongoose
  const traduzirErroMongo = (mensagem: string): string => {
    if (!mensagem || typeof mensagem !== 'string') {
      return 'Erro de validação do banco de dados';
    }

    const traducoes: Record<string, string> = {
      'is required': 'é obrigatório',
      'is not valid': 'não é válido',
      'must be unique': 'deve ser único',
      'Path': 'Campo',
      'Validator failed': 'Validação falhou',
      'Cast to ObjectId failed': 'ID inválido',
      'Cast to Number failed': 'Deve ser um número',
      'Cast to Date failed': 'Deve ser uma data válida'
    };

    let traduzida = mensagem;
    for (const [en, pt] of Object.entries(traducoes)) {
      traduzida = traduzida.replace(new RegExp(en, 'gi'), pt);
    }

    if (traduzida === mensagem && !IS_PRODUCTION) {
      logger.warn(`Erro Mongoose não traduzido: "${mensagem}"`);
    }

    return traduzida;
  };

  // 404 em português
  fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    return customReply.erro(`Rota ${request.url} não encontrada`, 404);
  });

  // ========================================
  // INICIALIZAÇÃO OTIMIZADA
  // ========================================
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    
    logger.info(`
🚀 ===================================
📱 ${process.env.APP_NAME || 'API BDN'} Online!
🌍 Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}
🚪 Porta: ${PORT}
💰 Modo economia: ${IS_SMALL_APP ? 'ATIVO' : 'INATIVO'}
${(!IS_PRODUCTION || process.env.ENABLE_DOCS === 'true') ? `📚 Docs: http://localhost:${PORT}/docs` : ''}
❤️  Health: http://localhost:${PORT}/health
===================================`);
  } catch (err) {
    logger.error('Erro ao iniciar servidor:', err);
    process.exit(1);
  }

  // Graceful shutdown otimizado para Railway/Fly.io
  const desligarGraciosamente = async (sinal: string): Promise<void> => {
    logger.info(`Recebido ${sinal}. Iniciando desligamento...`);

    try {
      await fastify.close();
      logger.info('Servidor Fastify fechado');

      await mongoose.connection.close();
      logger.info('Conexão MongoDB fechada');
      process.exit(0);
    } catch (err: any) {
      logger.error('Erro durante desligamento:', err.message);
      process.exit(1);
    }
  };

  // Handlers de sinais para deploy
  process.on('SIGTERM', () => desligarGraciosamente('SIGTERM'));
  process.on('SIGINT', () => desligarGraciosamente('SIGINT'));

  // Tratamento robusto de erros não capturados
  process.on('uncaughtException', (err: Error) => {
    logger.error('Exceção não capturada:', err.message);
    desligarGraciosamente('uncaughtException');
  });

  process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
    logger.error('Promise rejeitada:', reason);
    desligarGraciosamente('unhandledRejection');
  });

  return fastify;
}

export default startServer;

