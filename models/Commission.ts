import mongoose, { Schema, Document } from 'mongoose';
import { validatePositiveNumber, validatePercentage } from '../utils/validations';

// Interface para o Commission
export interface ICommission extends Document {
  id: string;
  order: {
    orderId: string;
    friendlyId: string;
    couponUsed?: string;
  };
  amount: number;
  commissionRate: number;
  type: 'organic' | 'traffic_paid' | 'referral';
  influencerId: string;
  payment: {
    expectedPaymentDate?: Date;
    paid: boolean;
    paidBy?: string;
    paidAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const CommissionSchema = new Schema<ICommission>({
  order: {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Pedido é obrigatório']
    },
    friendlyId: {
      type: String,
      required: [true, 'ID amigável é obrigatório']
    },
    couponUsed: String
  },
  amount: {
    type: Number,
    required: [true, 'Valor é obrigatório'],
    validate: {
      validator: validatePositiveNumber,
      message: 'Valor deve ser positivo'
    }
  },
  commissionRate: {
    type: Number,
    required: [true, 'Taxa de comissão é obrigatória'],
    validate: {
      validator: validatePercentage,
      message: 'Taxa de comissão deve estar entre 0 e 100%'
    }
  },
  type: {
    type: String,
    enum: {
      values: ['organic', 'traffic_paid', 'referral'],
      message: 'Tipo de comissão inválido'
    },
    required: [true, 'Tipo é obrigatório']
  },
  influencerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Influenciador é obrigatório']
  },
  payment: {
    expectedPaymentDate: Date,
    paid: {
      type: Boolean,
      default: false
    },
    paidBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    paidAt: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
CommissionSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
CommissionSchema.index({ 'order.orderId': 1 });
CommissionSchema.index({ influencerId: 1 });
CommissionSchema.index({ type: 1 });
CommissionSchema.index({ 'payment.paid': 1 });
CommissionSchema.index({ createdAt: -1 });

export default mongoose.model<ICommission>('Commission', CommissionSchema);
