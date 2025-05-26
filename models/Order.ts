import mongoose, { Schema, Document } from 'mongoose';
import { validatePositiveNumber, validatePercentage } from '../utils/validations';

// Interface para o Order
export interface IOrderItem {
  productId: string;
  name: string;
  productImageUrl?: string;
  variationId?: string;
  quantity: number;
  priceType: 'bodycoins' | 'cash';
  pricePaid: number;
  equivalentCashPrice?: number;
  costs?: {
    base?: number;
    box?: number;
    labels?: number;
  };
}

export interface IOrderStatusHistory {
  status: 'order_placed' | 'payment_approved' | 'products_being_picked' | 'invoiced' | 'products_in_transit' | 'delivered' | 'canceled';
  timestamp: Date;
  changedBy?: string;
}

export interface IOrderNote {
  content: string;
  createdAt: Date;
  createdBy: {
    id: string;
    name?: string;
  };
}

export interface IOrderEmailHistory {
  subject: string;
  htmlContent: string;
  sentAt: Date;
  relatedStatus?: string;
  sendTo: string;
}

export interface IOrderChangeHistory {
  field: string;
  oldValue: any;
  newValue: any;
  changedAt: Date;
  changedBy?: string;
}

export interface IOrder extends Document {
  id: string;
  type: 'b2c' | 'b2i';
  asaasId?: string;
  influencerId?: string;
  customerId?: string;
  payment: {
    billingType: 'boleto' | 'credit_card' | 'pix' | 'undefined';
    status: 'approved' | 'pending' | 'failed' | 'refunded';
    cardLastDigits?: string;
    cardBrand?: string;
    paymentProcessor?: string;
    installments: number;
    installmentValue?: number;
    paidAt?: Date;
  };
  itens: IOrderItem[];
  totals: {
    products: {
      cash: number;
      bodycoins: number;
    };
    shipping: {
      total: number;
      paidByCustomer: number;
      absorbedByCompany: number;
    };
    discount: {
      total: number;
      voucher: number;
      coupon: number;
      bodycoins: number;
    };
    bodycoinsUsage: {
      amountUsed: number;
      equivalentCashValue: number;
    };
    productionCost: number;
    commission: number;
    netProfit: number;
  };
  discount?: {
    type: 'coupon' | 'voucher';
    typeId?: string;
    code?: string;
    value?: number;
    discountType?: 'percentual' | 'fixed';
    couponType?: 'all' | 'organic' | 'trafficPaid';
    influencerCommissionRate?: number;
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
  status: {
    current: 'order_placed' | 'payment_approved' | 'products_being_picked' | 'invoiced' | 'products_in_transit' | 'delivered' | 'canceled';
    history: IOrderStatusHistory[];
  };
  invoice?: {
    number?: string;
    issueDate?: Date;
    series?: string;
    accessKey?: string;
    pdfUrl?: string;
    history?: IOrderChangeHistory[];
  };
  tracking?: {
    code?: string;
    carrier?: string;
    shippingMethod?: string;
    history?: IOrderChangeHistory[];
  };
  notes?: IOrderNote[];
  emailHistory?: IOrderEmailHistory[];
  previouslyAbandoned?: {
    wasAbandoned: boolean;
    abandonedCheckoutId?: string;
    abandonedAt?: {
      stage?: 'personal_data' | 'shipping_data' | 'shipping_method' | 'payment';
      timestamp?: Date;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>({
  id: {
    type: String,
    required: [true, 'ID é obrigatório'],
    unique: true,
    validate: {
      validator: (v: string) => /^ORD\d{4,}$/.test(v),
      message: 'ID deve estar no formato ORD1000'
    }
  },
  type: {
    type: String,
    enum: {
      values: ['b2c', 'b2i'],
      message: 'Tipo de pedido inválido'
    },
    required: [true, 'Tipo é obrigatório']
  },
  asaasId: String,
  influencerId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer'
  },
  payment: {
    billingType: {
      type: String,
      enum: {
        values: ['boleto', 'credit_card', 'pix', 'undefined'],
        message: 'Tipo de pagamento inválido'
      },
      default: 'undefined'
    },
    status: {
      type: String,
      enum: {
        values: ['approved', 'pending', 'failed', 'refunded'],
        message: 'Status de pagamento inválido'
      },
      default: 'pending'
    },
    cardLastDigits: String,
    cardBrand: String,
    paymentProcessor: String,
    installments: {
      type: Number,
      min: [1, 'Parcelas devem ser pelo menos 1'],
      default: 1
    },
    installmentValue: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Valor da parcela deve ser positivo'
      }
    },
    paidAt: Date
  },
  itens: [{
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
      enum: {
        values: ['bodycoins', 'cash'],
        message: 'Tipo de preço inválido'
      },
      required: [true, 'Tipo de preço é obrigatório']
    },
    pricePaid: {
      type: Number,
      required: [true, 'Preço pago é obrigatório'],
      validate: {
        validator: validatePositiveNumber,
        message: 'Preço pago deve ser positivo'
      }
    },
    equivalentCashPrice: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Preço equivalente deve ser positivo'
      }
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
      labels: {
        type: Number,
        validate: {
          validator: validatePositiveNumber,
          message: 'Custo das etiquetas deve ser positivo'
        }
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
      total: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Total de frete deve ser positivo'
        }
      },
      paidByCustomer: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Frete pago pelo cliente deve ser positivo'
        }
      },
      absorbedByCompany: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Frete absorvido deve ser positivo'
        }
      }
    },
    discount: {
      total: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Desconto total deve ser positivo'
        }
      },
      voucher: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Desconto voucher deve ser positivo'
        }
      },
      coupon: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Desconto cupom deve ser positivo'
        }
      },
      bodycoins: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Desconto bodycoins deve ser positivo'
        }
      }
    },
    bodycoinsUsage: {
      amountUsed: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Bodycoins usados deve ser positivo'
        }
      },
      equivalentCashValue: {
        type: Number,
        default: 0,
        validate: {
          validator: validatePositiveNumber,
          message: 'Valor equivalente deve ser positivo'
        }
      }
    },
    productionCost: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Custo de produção deve ser positivo'
      }
    },
    commission: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Comissão deve ser positiva'
      }
    },
    netProfit: {
      type: Number,
      default: 0
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
    },
    discountType: {
      type: String,
      enum: ['percentual', 'fixed']
    },
    couponType: {
      type: String,
      enum: ['all', 'organic', 'trafficPaid']
    },
    influencerCommissionRate: {
      type: Number,
      validate: {
        validator: validatePercentage,
        message: 'Taxa de comissão deve estar entre 0 e 100%'
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
  status: {
    current: {
      type: String,
      enum: {
        values: ['order_placed', 'payment_approved', 'products_being_picked', 'invoiced', 'products_in_transit', 'delivered', 'canceled'],
        message: 'Status do pedido inválido'
      },
      default: 'order_placed'
    },
    history: [{
      status: {
        type: String,
        enum: {
          values: ['order_placed', 'payment_approved', 'products_being_picked', 'invoiced', 'products_in_transit', 'delivered', 'canceled'],
          message: 'Status do pedido inválido'
        },
        required: [true, 'Status é obrigatório']
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      changedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },
  invoice: {
    number: String,
    issueDate: Date,
    series: String,
    accessKey: String,
    pdfUrl: String,
    history: [{
      field: {
        type: String,
        required: [true, 'Campo é obrigatório']
      },
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed,
      changedAt: {
        type: Date,
        default: Date.now
      },
      changedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },
  tracking: {
    code: String,
    carrier: String,
    shippingMethod: String,
    history: [{
      field: {
        type: String,
        required: [true, 'Campo é obrigatório']
      },
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed,
      changedAt: {
        type: Date,
        default: Date.now
      },
      changedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },
  notes: [{
    content: {
      type: String,
      required: [true, 'Conteúdo da nota é obrigatório']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Autor da nota é obrigatório']
      },
      name: String
    }
  }],
  emailHistory: [{
    subject: {
      type: String,
      required: [true, 'Assunto do email é obrigatório']
    },
    htmlContent: {
      type: String,
      required: [true, 'Conteúdo do email é obrigatório']
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    relatedStatus: String,
    sendTo: {
      type: String,
      required: [true, 'Destinatário é obrigatório']
    }
  }],
  previouslyAbandoned: {
    wasAbandoned: {
      type: Boolean,
      default: false
    },
    abandonedCheckoutId: {
      type: Schema.Types.ObjectId,
      ref: 'AbandonedCheckout'
    },
    abandonedAt: {
      stage: {
        type: String,
        enum: ['personal_data', 'shipping_data', 'shipping_method', 'payment']
      },
      timestamp: Date
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
OrderSchema.virtual('_id').get(function(this: any) {
  return this.id;
});

// Índices para performance
OrderSchema.index({ id: 1 });
OrderSchema.index({ type: 1 });
OrderSchema.index({ influencerId: 1 });
OrderSchema.index({ customerId: 1 });
OrderSchema.index({ 'payment.status': 1 });
OrderSchema.index({ 'status.current': 1 });
OrderSchema.index({ createdAt: -1 });

export default mongoose.model<IOrder>('Order', OrderSchema);
