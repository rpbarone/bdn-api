import mongoose, { Schema, Document } from 'mongoose';
import { validatePositiveNumber, validatePercentage } from '../utils/validations';

// Interface para o Voucher
export interface IVoucher extends Document {
  id: string;
  code: string;
  description: string;
  normalizedDescription?: string;
  maxUses?: number;
  currentUses: number;
  minimumOrderValue: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  discountType: 'percentual' | 'fixed';
  discountValue: number;
  minItemQuantity: number;
  freeShipping: boolean;
  oneTimePerUser: boolean;
  niches?: string[];
  specificInfluencers?: string[];
  exceptions?: {
    excludedCategories?: string[];
    excludedProducts?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

const VoucherSchema = new Schema<IVoucher>({
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
      validator: function(this: IVoucher, v: Date) {
        return v > this.startDate;
      },
      message: 'Data de término deve ser posterior à data de início'
    }
  },
  isActive: {
    type: Boolean,
    default: true
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
        validator: function(this: IVoucher, v: number) {
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
  niches: [{
    type: Schema.Types.ObjectId,
    ref: 'Niche'
  }],
  specificInfluencers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
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
VoucherSchema.pre('save', function(next) {
  if (this.description) {
    this.normalizedDescription = this.description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  next();
});

// Virtual para ID sem underscore
VoucherSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
VoucherSchema.index({ code: 1 });
VoucherSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
VoucherSchema.index({ currentUses: 1, maxUses: 1 });
VoucherSchema.index({ niches: 1 });
VoucherSchema.index({ specificInfluencers: 1 });

export default mongoose.model<IVoucher>('Voucher', VoucherSchema);
