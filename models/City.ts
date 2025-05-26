import mongoose, { Schema, Document } from 'mongoose';

// Interface para o City
export interface ICity extends Document {
  id: string;
  name: string;
  uf: string;
  region: 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';
}

const CitySchema = new Schema<ICity>({
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true
  },
  uf: {
    type: String,
    required: [true, 'UF é obrigatória'],
    trim: true,
    uppercase: true,
    validate: {
      validator: (v: string) => /^[A-Z]{2}$/.test(v),
      message: 'UF deve ter 2 letras maiúsculas'
    }
  },
  region: {
    type: String,
    required: [true, 'Região é obrigatória'],
    trim: true,
    enum: {
      values: ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'],
      message: 'Região inválida'
    }
  }
}, {
  timestamps: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
CitySchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
CitySchema.index({ name: 1, uf: 1 });
CitySchema.index({ uf: 1 });
CitySchema.index({ region: 1 });

export default mongoose.model<ICity>('City', CitySchema);
