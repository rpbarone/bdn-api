import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateSecureToken, hashToObjectId } from '../utils/crypto';
import { 
  validateEmail, 
  validatePhone, 
  validateCPF, 
  validateDate, 
  validateInstagram, 
  validateCEP,
  validatePassword 
} from '../utils/validations';
import { PASSWORD_VALIDATION_OPTIONS, SECURITY_CONFIG } from '../utils/constants';

// Tipo para role do usuário
export type UserRole = 'influencer' | 'admin' | 'super_admin';

// Interface para o documento User
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
    validate: {
      validator: validateEmail,
      message: 'Email inválido'
    }
  },
  password: { 
    type: String, 
    required: [true, 'Senha é obrigatória'],
    select: false, // Não retorna senha por padrão
    validate: {
      validator: function(value: string) {
        // Só valida se for senha nova (não hash)
        if (!value || value.startsWith('$2a$') || value.startsWith('$2b$')) {
          return true;
        }
        
        const validation = validatePassword(value, PASSWORD_VALIDATION_OPTIONS);
        
        return validation.isValid;
      },
      message: function(props: any) {
        // Só valida se for senha nova (não hash)
        if (!props.value || props.value.startsWith('$2a$') || props.value.startsWith('$2b$')) {
          return '';
        }
        
        const validation = validatePassword(props.value, PASSWORD_VALIDATION_OPTIONS);
        
        return validation.errors.join(', ');
      }
    }
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
  birthDate: {
    type: Date,
    validate: {
      validator: (v: Date) => !v || validateDate(v, { minAge: 13, maxAge: 120 }),
      message: 'Data de nascimento inválida ou idade fora do permitido (13-120 anos)'
    }
  },
  gender: String,
  cpf: {
    type: String,
    validate: {
      validator: (v: string) => !v || validateCPF(v),
      message: 'CPF inválido'
    }
  },
  rg: String,
  phone: {
    type: String,
    validate: {
      validator: (v: string) => !v || validatePhone(v),
      message: 'Telefone inválido'
    }
  },
  social: {
    instagram: {
      type: String,
      validate: {
        validator: (v: string) => !v || validateInstagram(v),
        message: 'Username do Instagram inválido'
      }
    },
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
    pixKey: {
      type: String,
      validate: {
        validator: function(this: IUser, v: string) {
          if (!v || !this.bankInfo?.pixType) return true;
          
          switch (this.bankInfo.pixType) {
            case 'cpf':
              return validateCPF(v);
            case 'email':
              return validateEmail(v);
            case 'phone':
              return validatePhone(v);
            case 'random':
              return true; // Chave aleatória não tem validação específica
            default:
              return true;
          }
        },
        message: 'Chave PIX inválida para o tipo selecionado'
      }
    }
  },
  address: {
    zipCode: {
      type: String,
      validate: {
        validator: (v: string) => !v || validateCEP(v),
        message: 'CEP inválido'
      }
    },
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
  timestamps: true
});

// Índices para performance
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ passwordResetToken: 1 });


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
  this.passwordResetExpires = new Date(Date.now() + SECURITY_CONFIG.PASSWORD_RESET_EXPIRATION);
  
  return resetToken;
};

export default mongoose.model<IUser>('User', UserSchema);
