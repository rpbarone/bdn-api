import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../types';
import { generateSecureToken, hashToObjectId } from '../utils/crypto';

const UserSchema = new Schema<IUser>({
  name: { 
    type: String, 
    required: [true, 'Nome é obrigatório'],
    trim: true,
    minlength: [2, 'Nome deve ter no mínimo 2 caracteres'],
    maxlength: [100, 'Nome deve ter no máximo 100 caracteres']
  },
  normalizedName: {
    type: String,
    trim: true,
    lowercase: true
  },
  username: { 
    type: String, 
    required: [true, 'Username é obrigatório'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username deve ter no mínimo 3 caracteres'],
    maxlength: [30, 'Username deve ter no máximo 30 caracteres'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username só pode conter letras, números e underscore']
  },
  role: { 
    type: String, 
    enum: ['influencer', 'admin', 'super_admin'],
    default: 'influencer',
    required: true
  },
  email: { 
    type: String, 
    required: [true, 'Email é obrigatório'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido']
  },
  password: { 
    type: String, 
    required: [true, 'Senha é obrigatória'],
    minlength: [6, 'Senha deve ter no mínimo 6 caracteres'],
    select: false // Não retorna senha por padrão
  },
  profilePicture: String,
  status: { 
    type: String, 
    enum: ['ativo', 'inativo'],
    default: 'ativo'
  },
  deactivationReason: String,
  level: { 
    type: Number, 
    enum: [1, 2, 3, 4],
    default: 1
  },
  bodyCoins: { 
    type: Number, 
    default: 0,
    min: [0, 'BodyCoins não pode ser negativo']
  },
  rankingPoints: { 
    type: Number, 
    default: 0,
    min: [0, 'Pontos de ranking não podem ser negativos']
  },
  ranking: Number,
  birthDate: Date,
  gender: String,
  cpf: {
    type: String,
    match: [/^\d{11}$/, 'CPF deve conter 11 dígitos']
  },
  rg: String,
  phone: {
    type: String,
    match: [/^\+?[\d\s()-]+$/, 'Telefone inválido']
  },
  social: {
    instagram: String,
    tiktok: String,
    xtwitter: String,
    youtube: String,
    facebook: String
  },
  bankInfo: {
    code: String,
    name: String,
    agency: String,
    accountNumber: String,
    pixType: {
      type: String,
      enum: ['cpf', 'email', 'phone', 'random']
    },
    pixKey: String
  },
  address: {
    zipCode: String,
    street: String,
    number: String,
    complement: String,
    neighborhood: String,
    city: String,
    state: String
  },
  coupons: {
    organicCode: String,
    trafficPaidCode: String
  },
  hasReviewedApp: { 
    type: Boolean, 
    default: false 
  },
  onboarding: {
    isCourseCompleted: { type: Boolean, default: false },
    whatsappGroupMember: { type: Boolean, default: false },
    isProfileCompleted: { type: Boolean, default: false }
  },
  referredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  leadId: String,
  approvalDate: Date,
  niches: [String],
  lastLogin: Date,
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // Campos para 2FA
  twoFactorSecret: {
    type: String,
    select: false
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorBackupCodes: {
    type: [String],
    select: false
  },
  // Campo para reset de senha
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para performance
// UserSchema.index({ email: 1 }); // Removido - já tem unique: true
// UserSchema.index({ username: 1 }); // Removido - já tem unique: true
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ passwordResetToken: 1 });

// Pre-save hook para hash da senha
UserSchema.pre('save', async function(next) {
  // Só faz hash se a senha foi modificada
  if (!this.isModified('password')) return next();
  
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
    this.password = await bcrypt.hash(this.password, rounds);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Pre-save hook para normalizar nome
UserSchema.pre('save', function(next) {
  if (this.name) {
    this.normalizedName = this.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  next();
});

// Método para comparar senha
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch {
    return false;
  }
};

// Método para gerar token de reset de senha
UserSchema.methods.createPasswordResetToken = function(): string {
  const resetToken = generateSecureToken(32);
  
  // Hash do token para salvar no banco
  const hashedToken = hashToObjectId(
    require('crypto').createHash('sha256').update(resetToken).digest('hex')
  );
  
  this.passwordResetToken = hashedToken;
  this.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos
  
  return resetToken;
};

// Virtual para ID sem underscore
UserSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

export default mongoose.model<IUser>('User', UserSchema);
