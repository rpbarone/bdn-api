import mongoose, { Schema, Document } from 'mongoose';
import { validatePositiveNumber } from '../utils/validations';

// Interface para o PointsCoinsHistory
export interface IPointsCoinsHistory extends Document {
  id: string;
  type: 'bodycoins' | 'ranking_points';
  userId: string;
  quantity: number;
  operation: 'add' | 'subtract';
  balanceAfter: number;
  reason: string;
  associatedEntity: 'order' | 'user' | 'review' | 'academy' | 'admin';
  associatedId: string;
  createdAt: Date;
  createdBy?: string;
}

const PointsCoinsHistorySchema = new Schema<IPointsCoinsHistory>({
  type: {
    type: String,
    enum: {
      values: ['bodycoins', 'ranking_points'],
      message: 'Tipo inválido'
    },
    required: [true, 'Tipo é obrigatório']
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Usuário é obrigatório']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantidade é obrigatória'],
    validate: {
      validator: validatePositiveNumber,
      message: 'Quantidade deve ser positiva'
    }
  },
  operation: {
    type: String,
    enum: {
      values: ['add', 'subtract'],
      message: 'Operação inválida'
    },
    required: [true, 'Operação é obrigatória']
  },
  balanceAfter: {
    type: Number,
    required: [true, 'Saldo após operação é obrigatório'],
    validate: {
      validator: validatePositiveNumber,
      message: 'Saldo não pode ser negativo'
    }
  },
  reason: {
    type: String,
    required: [true, 'Motivo é obrigatório'],
    trim: true
  },
  associatedEntity: {
    type: String,
    enum: {
      values: ['order', 'user', 'review', 'academy', 'admin'],
      message: 'Entidade associada inválida'
    },
    required: [true, 'Entidade associada é obrigatória']
  },
  associatedId: {
    type: Schema.Types.ObjectId,
    required: [true, 'ID associado é obrigatório']
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
PointsCoinsHistorySchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
PointsCoinsHistorySchema.index({ userId: 1, type: 1 });
PointsCoinsHistorySchema.index({ associatedEntity: 1, associatedId: 1 });
PointsCoinsHistorySchema.index({ createdAt: -1 });

export default mongoose.model<IPointsCoinsHistory>('PointsCoinsHistory', PointsCoinsHistorySchema);
