import mongoose, { Schema, Document } from 'mongoose';

// Interface para o Config
export interface IConfig extends Document {
  id: string;
  domain: 'legal' | 'shipping' | 'financial';
  configs: any;
  createdAt: Date;
  updatedAt: Date;
  updatedBy?: string;
}

const ConfigSchema = new Schema<IConfig>({
  domain: {
    type: String,
    enum: {
      values: ['legal', 'shipping', 'financial'],
      message: 'Domínio inválido'
    },
    required: [true, 'Domínio é obrigatório']
  },
  configs: {
    type: Schema.Types.Mixed,
    required: [true, 'Configurações são obrigatórias']
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

// Virtual para ID sem underscore
ConfigSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índice para performance
ConfigSchema.index({ domain: 1 });

export default mongoose.model<IConfig>('Config', ConfigSchema);
