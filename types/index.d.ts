// Tipos principais para o sistema BDN
import { Document, Model } from 'mongoose';
import { FastifyRequest, FastifyReply } from 'fastify';

// ========================================
// TIPOS DE USUÁRIO E AUTENTICAÇÃO
// ========================================
export type UserRole = 'influencer' | 'admin' | 'super_admin';

export interface IUser extends Document {
  id: string;
  name: string;
  normalizedName?: string;
  username: string;
  role: UserRole;
  email: string;
  password: string;
  profilePicture?: string;
  status: 'ativo' | 'inativo';
  deactivationReason?: string;
  level?: 1 | 2 | 3 | 4;
  bodyCoins: number;
  rankingPoints: number;
  ranking?: number;
  birthDate?: Date;
  gender?: string;
  cpf?: string;
  rg?: string;
  phone?: string;
  social?: {
    instagram?: string;
    tiktok?: string;
    xtwitter?: string;
    youtube?: string;
    facebook?: string;
  };
  bankInfo?: {
    code?: string;
    name?: string;
    agency?: string;
    accountNumber?: string;
    pixType?: 'cpf' | 'email' | 'phone' | 'random';
    pixKey?: string;
  };
  address?: {
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  coupons?: {
    organicCode?: string;
    trafficPaidCode?: string;
  };
  hasReviewedApp: boolean;
  onboarding?: {
    isCourseCompleted: boolean;
    whatsappGroupMember: boolean;
    isProfileCompleted: boolean;
  };
  referredBy?: string;
  leadId?: string;
  approvalDate?: Date;
  niches?: string[];
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: string;
  // Campos 2FA
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  twoFactorBackupCodes?: string[];
  // Campos reset senha
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  // Métodos
  comparePassword(candidatePassword: string): Promise<boolean>;
  createPasswordResetToken(): string;
}

// ========================================
// TIPOS DE POLICIES
// ========================================
export type Operation = 'read' | 'create' | 'update' | 'delete';

export interface PolicyPermissions {
  read?: string;
  create?: string;
  update?: string;
  delete?: string;
}

export interface PolicyFields {
  read?: Record<string, string[]>;
  write?: Record<string, string[]>;
}

export interface PolicyDefinition {
  permissions?: PolicyPermissions;
  fields?: PolicyFields;
  rules?: Record<string, string>;
}

export interface PermissionContext {
  user: IUser;
  target?: any;
  operacao: Operation;
  permissions?: PolicyDefinition;
  body?: any;
  params?: any;
  isSelf: boolean;
}

// ========================================
// TIPOS DE HOOKS
// ========================================
export interface HookContext<T = any> {
  user?: IUser;
  data?: Partial<T>;
  target?: T;
  model: string;
  Model: Model<T>;
  operation: Operation;
  result?: T;
  error?: Error;
}

export interface HookDefinition {
  name?: string;
  condition?: string;
  run: (ctx: HookContext) => Promise<void> | void;
}

export type HookType =
  | 'beforeCreate' | 'afterCreate'
  | 'beforeUpdate' | 'afterUpdate'
  | 'beforeDelete' | 'afterDelete'
  | 'beforeRead' | 'afterRead'
  | 'onError';

export type ModelHooks = {
  [K in HookType]?: HookDefinition | HookDefinition[] | ((ctx: HookContext) => Promise<void>);
}

// ========================================
// TIPOS DE CONFIGURAÇÃO
// ========================================
export interface AppConfig {
  roles: Record<UserRole, number>;
  defaultPolicy: 'allow' | 'deny';
  cacheEnabled: boolean;
  models: Record<string, PolicyDefinition>;
}

// ========================================
// TIPOS DE ERROS CUSTOMIZADOS
// ========================================
export interface ApiError extends Error {
  statusCode?: number;
  hookName?: string;
  originalError?: Error;
}

// ========================================
// DECLARAÇÃO DE MÓDULOS PARA FASTIFY
// ========================================
declare module 'fastify' {
  interface FastifyRequest {
    user?: IUser;
    permissionContext?: PermissionContext;
    permissionFilter?: (data: any) => any;
    hookCtx?: HookContext;
    afterHook?: (result: any) => Promise<void>;
    cookies: { [cookieName: string]: string | undefined };
  }

  interface FastifyReply {
    sucesso: (dados: any, mensagem?: string, codigo?: number) => FastifyReply;
    erro: (mensagem?: string, codigo?: number, detalhes?: any) => FastifyReply;
    setCookie(name: string, value: string, options?: any): FastifyReply;
    clearCookie(name: string, options?: any): FastifyReply;
  }
}

export {};
