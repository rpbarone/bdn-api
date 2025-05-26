import mongoose, { Schema, Document } from 'mongoose';

// Interface para o ProductCategory
export interface IProductCategory extends Document {
  id: string;
  shopifyId: string;
  name: string;
  normalizedName?: string;
  title?: string;
  subtitle?: string;
  bannerUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

const ProductCategorySchema = new Schema<IProductCategory>({
  shopifyId: {
    type: String,
    required: [true, 'Shopify ID é obrigatório'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true
  },
  normalizedName: {
    type: String,
    trim: true,
    lowercase: true
  },
  title: {
    type: String,
    trim: true
  },
  subtitle: {
    type: String,
    trim: true
  },
  bannerUrl: {
    type: String,
    trim: true
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

// Pre-save hook para normalizar nome
ProductCategorySchema.pre('save', function(next) {
  if (this.name) {
    this.normalizedName = this.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  next();
});

// Virtual para ID sem underscore
ProductCategorySchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
ProductCategorySchema.index({ shopifyId: 1 });
ProductCategorySchema.index({ name: 'text', normalizedName: 'text' });

export default mongoose.model<IProductCategory>('ProductCategory', ProductCategorySchema);
