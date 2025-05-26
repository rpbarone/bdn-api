import mongoose, { Schema, Document } from 'mongoose';

// Interface para o Bank
export interface IBank extends Document {
  id: string;
  name: string;
  code: string;
}

const BankSchema = new Schema<IBank>({
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Código é obrigatório'],
    trim: true
  }
}, {
  timestamps: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
BankSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
BankSchema.index({ code: 1 });
BankSchema.index({ name: 1 });

export default mongoose.model<IBank>('Bank', BankSchema);
