import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import User from '../models/User';
import postmark from '../integrations/postmark';
import { hashToObjectId, generateAlphanumericCode } from '../utils/crypto';
import { authenticateJWT } from '../middlewares/jwt';

interface LoginBody {
  email?: string;
  password?: string;
  instagram?: string;
  twoFactorCode?: string;
  rememberMe?: boolean;
}

interface ResetPasswordRequestBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

interface Enable2FABody {
  password: string;
}

interface Verify2FABody {
  token: string;
}

interface RefreshTokenBody {
  refreshToken: string;
}

// Tipos para JWT
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

// Configurações de cookies
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
};

const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dias
};

export default async function authRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/auth/login
   * Realiza login com email e senha
   */
  fastify.post<{ Body: LoginBody }>('/login', {
    schema: {
      body: {
        type: 'object',
        oneOf: [
          {
            required: ['email', 'password'],
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 6 },
              twoFactorCode: { type: 'string', pattern: '^[0-9]{6}$' },
              rememberMe: { type: 'boolean' }
            }
          },
          {
            required: ['instagram', 'password'],
            properties: {
              instagram: { type: 'string', minLength: 1 },
              password: { type: 'string', minLength: 6 },
              twoFactorCode: { type: 'string', pattern: '^[0-9]{6}$' },
              rememberMe: { type: 'boolean' }
            }
          }
        ]
      }
    }
  }, async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { email, instagram, password, twoFactorCode, rememberMe } = request.body;
    const customReply = reply as any;

    try {
      // Buscar usuário por email ou instagram
      let user;
      if (email) {
        user = await User.findOne({ email: email.toLowerCase() })
          .select('+password +twoFactorSecret +twoFactorEnabled +twoFactorRequired');
      } else if (instagram) {
        user = await User.findOne({ 'social.instagram': instagram.toLowerCase() })
          .select('+password +twoFactorSecret +twoFactorEnabled +twoFactorRequired');
      }

      if (!user) {
        return customReply.erro('Credenciais inválidas', 401);
      }

      // Verificar status do usuário
      if (user.status === 'inativo') {
        return customReply.erro('Conta desativada. Entre em contato com o suporte.', 403);
      }

      // Verificar senha
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return customReply.erro('Credenciais inválidas', 401);
      }

      // Para admin e super_admin, verificar se 2FA está configurado
      if ((user.role === 'admin' || user.role === 'super_admin')) {
        // Se 2FA não está habilitado, forçar configuração
        if (!user.twoFactorEnabled) {
          return customReply.erro('Administradores devem configurar autenticação de dois fatores antes do primeiro acesso', 403, {
            requires2FASetup: true,
            userId: user.id
          });
        }

        // Se 2FA está habilitado mas código não foi fornecido
        if (!twoFactorCode) {
          return customReply.erro('Código de autenticação obrigatório para administradores', 401, {
            requires2FA: true
          });
        }
      }

      // Verificar 2FA se habilitado
      if (user.twoFactorEnabled) {
        if (twoFactorCode) {
          const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret!,
            encoding: 'base32',
            token: twoFactorCode,
            window: 2 // Permite pequena diferença de tempo
          });

          if (!verified) {
            // Verificar códigos de backup
            const backupCodes = user.twoFactorBackupCodes || [];
            const backupIndex = backupCodes.findIndex(code => code === twoFactorCode);
            
            if (backupIndex === -1) {
              return customReply.erro('Código de autenticação inválido', 401);
            }

            // Remover código de backup usado
            user.twoFactorBackupCodes!.splice(backupIndex, 1);
            await user.save();
          }
        } else if (user.role !== 'admin' && user.role !== 'super_admin') {
          // Para usuários comuns, 2FA é opcional se estiver habilitado
          return customReply.erro('Código de autenticação necessário', 401, {
            requires2FA: true
          });
        }
      }

      // Atualizar último login
      user.lastLogin = new Date();
      await user.save();

      // Gerar tokens JWT com tempo de expiração baseado em rememberMe
      const tokenPayload: JWTPayload = {
        userId: user.id,
        email: user.email,
        role: user.role
      };

      // Se rememberMe for true, tokens duram mais tempo
      const accessTokenExpiry = rememberMe ? '7d' : '24h';
      const refreshTokenExpiry = rememberMe ? '90d' : '30d';
      const cookieMaxAge = rememberMe ? 90 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000; // 90 dias ou 7 dias

      const accessToken = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: accessTokenExpiry }
      );

      const refreshToken = jwt.sign(
        tokenPayload,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'default-secret',
        { expiresIn: refreshTokenExpiry }
      );

      // Definir cookies com tempo de expiração apropriado
      const customCookieOptions = {
        ...COOKIE_OPTIONS,
        maxAge: cookieMaxAge
      };
      
      const customRefreshCookieOptions = {
        ...REFRESH_COOKIE_OPTIONS,
        maxAge: cookieMaxAge
      };

      reply.setCookie('access_token', accessToken, customCookieOptions);
      reply.setCookie('refresh_token', refreshToken, customRefreshCookieOptions);

      // Retornar dados do usuário (sem senha)
      const userResponse = user.toObject();
      delete (userResponse as any).password;
      delete (userResponse as any).twoFactorSecret;
      delete (userResponse as any).twoFactorBackupCodes;

      return customReply.sucesso({
        user: userResponse,
        tokenExpiry: new Date(Date.now() + (rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)).toISOString(),
        rememberMe: rememberMe || false
      }, 'Login realizado com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao realizar login', 500);
    }
  });

  /**
   * POST /api/auth/logout
   * Realiza logout removendo cookies
   */
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;

    // Limpar cookies
    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/' });

    return customReply.sucesso(null, 'Logout realizado com sucesso');
  });

  /**
   * POST /api/auth/refresh
   * Renova o token de acesso usando refresh token
   */
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    try {
      const refreshToken = request.cookies.refresh_token;
      
      if (!refreshToken) {
        return customReply.erro('Refresh token não encontrado', 401);
      }

      // Verificar refresh token
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'default-secret'
      ) as JWTPayload;

      // Buscar usuário atualizado
      const user = await User.findById(decoded.userId);
      if (!user || user.status === 'inativo') {
        return customReply.erro('Usuário não encontrado ou inativo', 401);
      }

      // Gerar novo access token
      const tokenPayload: JWTPayload = {
        userId: user.id,
        email: user.email,
        role: user.role
      };

      const newAccessToken = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '24h' }
      );

      // Definir novo cookie
      reply.setCookie('access_token', newAccessToken, COOKIE_OPTIONS);

      return customReply.sucesso({
        tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }, 'Token renovado com sucesso');

    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return customReply.erro('Refresh token expirado', 401);
      }
      return customReply.erro('Token inválido', 401);
    }
  });

  /**
   * POST /api/auth/password-reset-request
   * Solicita redefinição de senha
   */
  fastify.post<{ Body: ResetPasswordRequestBody }>('/password-reset-request', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: ResetPasswordRequestBody }>, reply: FastifyReply) => {
    const { email } = request.body;
    const customReply = reply as any;

    try {
      const user = await User.findOne({ email: email.toLowerCase() })
        .select('+passwordResetToken +passwordResetExpires');

      if (!user) {
        // Não revelar se o email existe ou não
        return customReply.sucesso(
          null,
          'Se o email estiver cadastrado, você receberá instruções de redefinição'
        );
      }

      // Verificar se já existe token válido
      if (user.passwordResetToken && user.passwordResetExpires && user.passwordResetExpires > new Date()) {
        const tempoRestante = Math.ceil((user.passwordResetExpires.getTime() - Date.now()) / 60000);
        return customReply.erro(
          `Já existe uma solicitação em andamento. Aguarde ${tempoRestante} minutos.`,
          429
        );
      }

      // Gerar token de reset
      const resetToken = user.createPasswordResetToken();
      await user.save();

      // Enviar email
      await postmark.sendPasswordResetEmail(user.email, user.name, resetToken);

      return customReply.sucesso(
        null,
        'Se o email estiver cadastrado, você receberá instruções de redefinição'
      );

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao processar solicitação', 500);
    }
  });

  /**
   * POST /api/auth/password-reset
   * Redefine a senha usando token
   */
  fastify.post<{ Body: ResetPasswordBody }>('/password-reset', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: ResetPasswordBody }>, reply: FastifyReply) => {
    const { token, newPassword } = request.body;
    const customReply = reply as any;

    try {
      // Hash do token para comparar
      const hashedToken = hashToObjectId(
        require('crypto').createHash('sha256').update(token).digest('hex')
      );

      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }
      }).select('+passwordResetToken +passwordResetExpires');

      if (!user) {
        return customReply.erro('Token inválido ou expirado', 400);
      }

      // Atualizar senha
      user.password = newPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      // Enviar email de confirmação
      await postmark.sendPasswordChangedEmail(user.email, user.name);

      return customReply.sucesso(null, 'Senha redefinida com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao redefinir senha', 500);
    }
  });

  /**
   * POST /api/auth/2fa/setup-required
   * Configuração inicial de 2FA para administradores (sem autenticação JWT)
   */
  fastify.post<{ Body: { userId: string; password: string } }>('/2fa/setup-required', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'password'],
        properties: {
          userId: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { userId: string; password: string } }>, reply: FastifyReply) => {
    const { userId, password } = request.body;
    const customReply = reply as any;

    try {
      const user = await User.findOne({ id: userId })
        .select('+password +twoFactorEnabled +twoFactorRequired');

      if (!user) {
        return customReply.erro('Usuário não encontrado', 404);
      }

      // Verificar se é admin ou super_admin
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return customReply.erro('Esta rota é apenas para administradores', 403);
      }

      // Verificar se já tem 2FA configurado
      if (user.twoFactorEnabled) {
        return customReply.erro('Autenticação de dois fatores já está configurada', 400);
      }

      // Verificar senha
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return customReply.erro('Senha incorreta', 401);
      }

      // Gerar secret
      const secret = speakeasy.generateSecret({
        name: `${process.env.APP_NAME || 'BDN'} (${user.email})`,
        length: 32
      });

      // Gerar códigos de backup
      const backupCodes = Array.from({ length: 8 }, () => 
        generateAlphanumericCode(6)
      );

      // Salvar temporariamente
      user.twoFactorSecret = secret.base32;
      user.twoFactorBackupCodes = backupCodes;
      await user.save();

      // Gerar QR Code
      const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url!);

      // Enviar email com QR Code e códigos de backup
      await postmark.send2FASetupEmail(user.email, user.name, qrCodeDataUrl, backupCodes);

      return customReply.sucesso({
        secret: secret.base32,
        qrCode: qrCodeDataUrl,
        backupCodes
      }, 'Configure o Google Authenticator e confirme com um código');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao configurar 2FA', 500);
    }
  });

  /**
   * POST /api/auth/2fa/verify-setup
   * Confirma configuração inicial de 2FA para administradores
   */
  fastify.post<{ Body: { userId: string; token: string } }>('/2fa/verify-setup', {
    schema: {
      body: {
        type: 'object',
        required: ['userId', 'token'],
        properties: {
          userId: { type: 'string' },
          token: { type: 'string', pattern: '^[0-9]{6}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { userId: string; token: string } }>, reply: FastifyReply) => {
    const { userId, token } = request.body;
    const customReply = reply as any;

    try {
      const user = await User.findOne({ id: userId })
        .select('+twoFactorSecret +twoFactorEnabled');

      if (!user || !user.twoFactorSecret) {
        return customReply.erro('Configuração 2FA não encontrada', 400);
      }

      // Verificar token
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token,
        window: 2
      });

      if (!verified) {
        return customReply.erro('Código inválido', 400);
      }

      // Ativar 2FA
      user.twoFactorEnabled = true;
      user.twoFactorRequired = true;
      await user.save();

      return customReply.sucesso(null, 'Autenticação de dois fatores ativada com sucesso. Faça login novamente.');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao verificar 2FA', 500);
    }
  });

  /**
   * POST /api/auth/2fa/enable
   * Habilita autenticação de dois fatores
   */
  fastify.post<{ Body: Enable2FABody }>('/2fa/enable', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: Enable2FABody }>, reply: FastifyReply) => {
    const { password } = request.body;
    const customReply = reply as any;

    try {
      const user = await User.findById(request.user!.id)
        .select('+password +twoFactorSecret +twoFactorEnabled');

      if (!user) {
        return customReply.erro('Usuário não encontrado', 404);
      }

      // Verificar senha
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return customReply.erro('Senha incorreta', 401);
      }

      // Se já está habilitado
      if (user.twoFactorEnabled) {
        return customReply.erro('Autenticação de dois fatores já está habilitada', 400);
      }

      // Gerar secret
      const secret = speakeasy.generateSecret({
        name: `${process.env.APP_NAME || 'BDN'} (${user.email})`,
        length: 32
      });

      // Gerar códigos de backup
      const backupCodes = Array.from({ length: 8 }, () => 
        generateAlphanumericCode(6)
      );

      // Salvar temporariamente
      user.twoFactorSecret = secret.base32;
      user.twoFactorBackupCodes = backupCodes;
      await user.save();

      // Gerar QR Code
      const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url!);

      // Enviar email com QR Code e códigos de backup
      await postmark.send2FASetupEmail(user.email, user.name, qrCodeDataUrl, backupCodes);

      return customReply.sucesso({
        secret: secret.base32,
        qrCode: qrCodeDataUrl,
        backupCodes
      }, 'Configure o Google Authenticator e confirme com um código');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao habilitar 2FA', 500);
    }
  });

  /**
   * POST /api/auth/2fa/verify
   * Confirma e ativa 2FA
   */
  fastify.post<{ Body: Verify2FABody }>('/2fa/verify', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', pattern: '^[0-9]{6}$' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: Verify2FABody }>, reply: FastifyReply) => {
    const { token } = request.body;
    const customReply = reply as any;

    try {
      const user = await User.findById(request.user!.id)
        .select('+twoFactorSecret +twoFactorEnabled');

      if (!user || !user.twoFactorSecret) {
        return customReply.erro('Configuração 2FA não encontrada', 400);
      }

      // Verificar token
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token,
        window: 2
      });

      if (!verified) {
        return customReply.erro('Código inválido', 400);
      }

      // Ativar 2FA
      user.twoFactorEnabled = true;
      await user.save();

      return customReply.sucesso(null, 'Autenticação de dois fatores ativada com sucesso');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao verificar 2FA', 500);
    }
  });

  /**
   * POST /api/auth/2fa/disable
   * Desabilita 2FA
   */
  fastify.post<{ Body: Enable2FABody }>('/2fa/disable', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: Enable2FABody }>, reply: FastifyReply) => {
    const { password } = request.body;
    const customReply = reply as any;

    try {
      const user = await User.findById(request.user!.id)
        .select('+password +twoFactorEnabled');

      if (!user) {
        return customReply.erro('Usuário não encontrado', 404);
      }

      // Admin e super_admin não podem desabilitar 2FA
      if (user.role === 'admin' || user.role === 'super_admin') {
        return customReply.erro('Administradores não podem desabilitar 2FA', 403);
      }

      // Verificar senha
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return customReply.erro('Senha incorreta', 401);
      }

      // Desabilitar 2FA
      user.twoFactorEnabled = false;
      user.twoFactorSecret = undefined;
      user.twoFactorBackupCodes = undefined;
      await user.save();

      return customReply.sucesso(null, 'Autenticação de dois fatores desabilitada');

    } catch (error: any) {
      fastify.log.error(error);
      return customReply.erro('Erro ao desabilitar 2FA', 500);
    }
  });
}
