import mongoose, { Schema, Document } from 'mongoose';

// Interface para o Counter
export interface ICounter extends Document {
  id: string;
  collectionName: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  collectionName: {
    type: String,
    required: [true, 'Nome da coleção é obrigatório'],
    unique: true,
    trim: true
  },
  seq: {
    type: Number,
    default: 1000
  }
}, {
  timestamps: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
CounterSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índice para performance
CounterSchema.index({ collectionName: 1 });

export default mongoose.model<ICounter>('Counter', CounterSchema);
