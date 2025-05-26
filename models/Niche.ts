import mongoose, { Schema, Document } from 'mongoose';

// Interface para o Niche
export interface INiche extends Document {
  id: string;
  name: string;
  createdAt: Date;
}

const NicheSchema = new Schema<INiche>({
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
    unique: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
NicheSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índice para performance
NicheSchema.index({ name: 1 });

export default mongoose.model<INiche>('Niche', NicheSchema);
