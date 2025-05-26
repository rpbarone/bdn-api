import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { IUser } from '../types';

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Middleware para verificar JWT e adicionar usuário ao request
 */
export async function authenticateJWT(request: FastifyRequest, reply: FastifyReply) {
  const customReply = reply as any;
  
  try {
    // Buscar token no cookie
    const token = request.cookies.access_token;
    
    if (!token) {
      return customReply.erro('Token não encontrado', 401);
    }

    // Verificar e decodificar token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    ) as JWTPayload;

    // Buscar usuário no banco pelo ID amigável
    const user = await User.findOne({ id: decoded.userId });
    
    if (!user) {
      return customReply.erro('Usuário não encontrado', 401);
    }

    if (user.status === 'inativo') {
      return customReply.erro('Conta desativada', 403);
    }

    // Adicionar usuário ao request
    request.user = user;

    // Atualizar lastLogin (sem await para não bloquear)
    User.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } },
      { timestamps: false }
    ).catch(err => {
      console.error('Erro ao atualizar lastLogin:', err);
    });

  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return customReply.erro('Token expirado', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      return customReply.erro('Token inválido', 401);
    }
    
    return customReply.erro('Erro na autenticação', 500);
  }
}

/**
 * Middleware para verificar roles específicas
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const customReply = reply as any;
    
    // Primeiro autentica
    await authenticateJWT(request, reply);
    
    // Se a autenticação falhou, o erro já foi enviado
    if (reply.sent) return;
    
    // Verifica se o usuário tem uma das roles permitidas
    if (!request.user || !roles.includes(request.user.role)) {
      return customReply.erro('Acesso negado: permissão insuficiente', 403);
    }
  };
}

/**
 * Middleware para verificar se é admin ou superior
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('admin', 'super_admin')(request, reply);
}

/**
 * Middleware para verificar se é super admin
 */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole('super_admin')(request, reply);
}

/**
 * Middleware opcional de autenticação (não retorna erro se não autenticado)
 */
export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = request.cookies.access_token;
    
    if (!token) {
      return; // Continua sem usuário
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    ) as JWTPayload;

    const user = await User.findOne({ id: decoded.userId });
    
    if (user && user.status === 'ativo') {
      request.user = user;
    }
  } catch {
    // Ignora erros - autenticação opcional
  }
}
