import mongoose, { Schema, Document } from 'mongoose';
import { validateEmail, validatePhone, validatePositiveNumber } from '../utils/validations';

// Interfaces para o AbandonedCheckout
export interface IAbandonedCheckoutItem {
  productId: string;
  name: string;
  productImageUrl?: string;
  variationId?: string;
  quantity: number;
  priceType: 'bodycoins' | 'cash';
  price: number;
}

export interface IRecoveryAttempt {
  attemptNumber: number;
  type: 'email' | 'whatsapp';
  sentAt: Date;
  openedAt?: Date;
  clickedAt?: Date;
}

export interface IAbandonedCheckout extends Document {
  id: string;
  type: 'b2c' | 'b2i';
  influencerId?: string;
  customerId?: string;
  guestEmail?: string;
  guestPhone?: string;
  items: IAbandonedCheckoutItem[];
  totals: {
    products: {
      cash: number;
      bodycoins: number;
    };
    shipping: number;
    discount: number;
  };
  discount?: {
    type: 'coupon' | 'voucher';
    typeId?: string;
    code?: string;
    value?: number;
  };
  shippingAddress?: {
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  abandonedAt: {
    stage: 'personal_data' | 'shipping_data' | 'shipping_method' | 'payment';
    timestamp: Date;
  };
  checkoutAnalytics: {
    timeSpentSeconds: number;
    viewCount: number;
    lastViewedDate?: Date;
  };
  recoveryAttempts?: IRecoveryAttempt[];
  convertedToOrder: {
    status: boolean;
    orderId?: string;
    conversionDate?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AbandonedCheckoutSchema = new Schema<IAbandonedCheckout>({
  id: {
    type: String,
    required: [true, 'ID é obrigatório'],
    unique: true,
    validate: {
      validator: (v: string) => /^AC\d{4,}$/.test(v),
      message: 'ID deve estar no formato AC1000'
    }
  },
  type: {
    type: String,
    enum: ['b2c', 'b2i'],
    required: [true, 'Tipo é obrigatório']
  },
  influencerId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer'
  },
  guestEmail: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: (v: string) => !v || validateEmail(v),
      message: 'Por favor informe um email válido'
    }
  },
  guestPhone: {
    type: String,
    trim: true,
    validate: {
      validator: (v: string) => !v || validatePhone(v),
      message: 'Telefone deve ter 10 ou 11 dígitos válidos'
    }
  },
  items: [{
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Produto é obrigatório']
    },
    name: {
      type: String,
      required: [true, 'Nome do produto é obrigatório']
    },
    productImageUrl: String,
    variationId: String,
    quantity: {
      type: Number,
      required: [true, 'Quantidade é obrigatória'],
      min: [1, 'Quantidade deve ser pelo menos 1']
    },
    priceType: {
      type: String,
      enum: ['bodycoins', 'cash'],
      required: [true, 'Tipo de preço é obrigatório']
    },
    price: {
      type: Number,
      required: [true, 'Preço é obrigatório'],
      validate: {
        validator: validatePositiveNumber,
        message: 'Preço deve ser positivo'
      }
    }
  }],
  totals: {
    products: {
      cash: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Total em dinheiro deve ser positivo'
        }
      },
      bodycoins: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Total em bodycoins deve ser positivo'
        }
      }
    },
    shipping: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Frete deve ser positivo'
      }
    },
    discount: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Desconto deve ser positivo'
      }
    }
  },
  discount: {
    type: {
      type: String,
      enum: ['coupon', 'voucher']
    },
    typeId: Schema.Types.ObjectId,
    code: String,
    value: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Valor do desconto deve ser positivo'
      }
    }
  },
  shippingAddress: {
    zipCode: String,
    street: String,
    number: String,
    complement: String,
    neighborhood: String,
    city: String,
    state: String
  },
  abandonedAt: {
    stage: {
      type: String,
      enum: ['personal_data', 'shipping_data', 'shipping_method', 'payment'],
      required: [true, 'Estágio de abandono é obrigatório']
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  checkoutAnalytics: {
    timeSpentSeconds: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Tempo gasto deve ser positivo'
      }
    },
    viewCount: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Contagem de visualizações deve ser positiva'
      }
    },
    lastViewedDate: Date
  },
  recoveryAttempts: [{
    attemptNumber: {
      type: Number,
      required: [true, 'Número da tentativa é obrigatório'],
      min: [1, 'Número da tentativa deve ser pelo menos 1']
    },
    type: {
      type: String,
      enum: ['email', 'whatsapp'],
      required: [true, 'Tipo de tentativa é obrigatório']
    },
    sentAt: {
      type: Date,
      required: [true, 'Data de envio é obrigatória']
    },
    openedAt: Date,
    clickedAt: Date
  }],
  convertedToOrder: {
    status: {
      type: Boolean,
      default: false
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order'
    },
    conversionDate: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para performance
AbandonedCheckoutSchema.index({ id: 1 });
AbandonedCheckoutSchema.index({ type: 1 });
AbandonedCheckoutSchema.index({ influencerId: 1 });
AbandonedCheckoutSchema.index({ customerId: 1 });
AbandonedCheckoutSchema.index({ 'convertedToOrder.status': 1 });
AbandonedCheckoutSchema.index({ 'abandonedAt.stage': 1 });
AbandonedCheckoutSchema.index({ createdAt: -1 });

export default mongoose.model<IAbandonedCheckout>('AbandonedCheckout', AbandonedCheckoutSchema);
