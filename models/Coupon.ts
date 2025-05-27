import mongoose, { Schema, Document } from 'mongoose';
import { validatePositiveNumber, validatePercentage } from '../utils/validations';

// Interface para o Coupon
export interface ICoupon extends Document {
  id: string;
  origin: 'all' | 'organic' | 'trafficPaid';
  associatedInfluencer?: string;
  code: string;
  description: string;
  normalizedDescription?: string;
  maxUses?: number;
  currentUses: number;
  minimumOrderValue: number;
  startDate: Date;
  endDate: Date;
  discountType: 'percentual' | 'fixed';
  discountValue: number;
  minItemQuantity: number;
  freeShipping: boolean;
  oneTimePerUser: boolean;
  exceptions?: {
    excludedCategories?: string[];
    excludedProducts?: string[];
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

const CouponSchema = new Schema<ICoupon>({
  origin: {
    type: String,
    enum: {
      values: ['all', 'organic', 'trafficPaid'],
      message: 'Origem inválida'
    },
    required: [true, 'Origem é obrigatória']
  },
  associatedInfluencer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: function(this: ICoupon, v: any) {
        // Se origem é 'all', não precisa de influenciador
        // Se origem é 'organic' ou 'trafficPaid', precisa de influenciador
        return this.origin === 'all' || v !== undefined;
      },
      message: 'Influenciador associado é obrigatório para cupons organic e trafficPaid'
    }
  },
  code: {
    type: String,
    required: [true, 'Código é obrigatório'],
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Descrição é obrigatória'],
    trim: true
  },
  normalizedDescription: {
    type: String,
    trim: true,
    lowercase: true
  },
  maxUses: {
    type: Number,
    validate: {
      validator: validatePositiveNumber,
      message: 'Número máximo de usos deve ser positivo'
    }
  },
  currentUses: {
    type: Number,
    default: 0,
    validate: {
      validator: validatePositiveNumber,
      message: 'Número de usos atuais deve ser positivo'
    }
  },
  minimumOrderValue: {
    type: Number,
    default: 0,
    validate: {
      validator: validatePositiveNumber,
      message: 'Valor mínimo do pedido deve ser positivo'
    }
  },
  startDate: {
    type: Date,
    required: [true, 'Data de início é obrigatória']
  },
  endDate: {
    type: Date,
    required: [true, 'Data de término é obrigatória'],
    validate: {
      validator: function(this: ICoupon, v: Date) {
        return v > this.startDate;
      },
      message: 'Data de término deve ser posterior à data de início'
    }
  },
  discountType: {
    type: String,
    enum: {
      values: ['percentual', 'fixed'],
      message: 'Tipo de desconto inválido'
    },
    required: [true, 'Tipo de desconto é obrigatório']
  },
  discountValue: {
    type: Number,
    required: [true, 'Valor do desconto é obrigatório'],
    validate: [
      {
        validator: validatePositiveNumber,
        message: 'Valor do desconto deve ser positivo'
      },
      {
        validator: function(this: ICoupon, v: number) {
          if (this.discountType === 'percentual') {
            return validatePercentage(v);
          }
          return true;
        },
        message: 'Desconto percentual deve estar entre 0 e 100%'
      }
    ]
  },
  minItemQuantity: {
    type: Number,
    default: 1,
    min: [1, 'Quantidade mínima de itens deve ser pelo menos 1']
  },
  freeShipping: {
    type: Boolean,
    default: false
  },
  oneTimePerUser: {
    type: Boolean,
    default: false
  },
  exceptions: {
    excludedCategories: [{
      type: Schema.Types.ObjectId,
      ref: 'ProductCategory'
    }],
    excludedProducts: [{
      type: Schema.Types.ObjectId,
      ref: 'Product'
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save hook para normalizar descrição
CouponSchema.pre('save', function(next) {
  if (this.description) {
    this.normalizedDescription = this.description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  next();
});

// Virtual para ID sem underscore
CouponSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Virtual para status calculado
CouponSchema.virtual('status').get(function(this: ICoupon) {
  const now = new Date();
  
  if (!this.isActive) {
    return 'Inativo';
  }
  
  if (now < this.startDate) {
    return 'Agendado';
  }
  
  if (now > this.endDate) {
    return 'Expirado';
  }
  
  // Se tem limite de usos e já atingiu
  if (this.maxUses && this.currentUses >= this.maxUses) {
    return 'Esgotado';
  }
  
  return 'Ativo';
});

// Índices para performance
CouponSchema.index({ origin: 1, associatedInfluencer: 1 });
CouponSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
CouponSchema.index({ currentUses: 1, maxUses: 1 });

export default mongoose.model<ICoupon>('Coupon', CouponSchema);
