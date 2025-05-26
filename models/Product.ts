import mongoose, { Schema, Document } from 'mongoose';
import { validatePositiveNumber } from '../utils/validations';

// Interface para o Product
export interface IProduct extends Document {
  id: string;
  shopifyId: string;
  name: string;
  normalizedName?: string;
  isInfluencerExclusive: boolean;
  description?: string;
  categoryId?: string;
  productImageUrl?: string;
  costs?: {
    base?: number;
    box?: number;
    label?: number;
  };
  prices?: {
    b2c?: number;
    b2cOffer?: number;
    b2i?: number;
    bodycoins?: number;
  };
  availableUnits: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  isArchived: boolean;
  isActive: boolean;
  variations?: Array<{
    name: string;
    sku: string;
    availableUnits: number;
  }>;
  shipping?: {
    processingTime?: number;
  };
  dimensions?: {
    weight?: number;
    height?: number;
    width?: number;
    length?: number;
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

const ProductSchema = new Schema<IProduct>({
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
  isInfluencerExclusive: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    trim: true
  },
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'ProductCategory'
  },
  productImageUrl: {
    type: String,
    trim: true
  },
  costs: {
    base: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Custo base deve ser positivo'
      }
    },
    box: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Custo da caixa deve ser positivo'
      }
    },
    label: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Custo da etiqueta deve ser positivo'
      }
    }
  },
  prices: {
    b2c: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Preço B2C deve ser positivo'
      }
    },
    b2cOffer: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Preço B2C oferta deve ser positivo'
      }
    },
    b2i: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Preço B2I deve ser positivo'
      }
    },
    bodycoins: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Preço em BodyCoins deve ser positivo'
      }
    }
  },
  availableUnits: {
    type: Number,
    default: 0,
    validate: {
      validator: validatePositiveNumber,
      message: 'Unidades disponíveis deve ser positivo'
    }
  },
  stockStatus: {
    type: String,
    enum: {
      values: ['in_stock', 'low_stock', 'out_of_stock'],
      message: 'Status de estoque inválido'
    },
    default: 'out_of_stock'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  variations: [{
    name: {
      type: String,
      required: [true, 'Nome da variação é obrigatório']
    },
    sku: {
      type: String,
      required: [true, 'SKU é obrigatório']
    },
    availableUnits: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Unidades disponíveis deve ser positivo'
      }
    }
  }],
  shipping: {
    processingTime: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Tempo de processamento deve ser positivo'
      }
    }
  },
  dimensions: {
    weight: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Peso deve ser positivo'
      }
    },
    height: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Altura deve ser positiva'
      }
    },
    width: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Largura deve ser positiva'
      }
    },
    length: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Comprimento deve ser positivo'
      }
    }
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
ProductSchema.pre('save', function(next) {
  if (this.name) {
    this.normalizedName = this.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  next();
});

// Virtual para ID sem underscore
ProductSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
ProductSchema.index({ shopifyId: 1 });
ProductSchema.index({ name: 'text', normalizedName: 'text' });
ProductSchema.index({ categoryId: 1 });
ProductSchema.index({ isActive: 1, isArchived: 1 });
ProductSchema.index({ stockStatus: 1 });

export default mongoose.model<IProduct>('Product', ProductSchema);
