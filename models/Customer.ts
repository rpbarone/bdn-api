import mongoose, { Schema, Document } from 'mongoose';
import { validateEmail, validatePhone, validatePositiveNumber } from '../utils/validations';

// Interface para o Customer
export interface ICustomerNote {
  content: string;
  createdBy: string;
  createdAt: Date;
}

export interface ICustomer extends Document {
  id: string;
  name: string;
  normalizedName?: string;
  email: string;
  phone?: string;
  address?: {
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  financials: {
    totalSpent: number;
    averageTicket: number;
  };
  orders: string[];
  notes?: ICustomerNote[];
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>({
  id: {
    type: String,
    required: [true, 'ID é obrigatório'],
    unique: true,
    validate: {
      validator: (v: string) => /^LD\d{4,}$/.test(v),
      message: 'ID deve estar no formato LD1000'
    }
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
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    lowercase: true,
    trim: true,
    validate: {
      validator: validateEmail,
      message: 'Por favor informe um email válido'
    }
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: (v: string) => !v || validatePhone(v),
      message: 'Telefone deve ter 10 ou 11 dígitos válidos'
    }
  },
  address: {
    zipCode: String,
    street: String,
    number: String,
    complement: String,
    neighborhood: String,
    city: String,
    state: String
  },
  financials: {
    totalSpent: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Total gasto deve ser positivo'
      }
    },
    averageTicket: {
      type: Number,
      default: 0,
      validate: {
        validator: validatePositiveNumber,
        message: 'Ticket médio deve ser positivo'
      }
    }
  },
  orders: [{
    type: Schema.Types.ObjectId,
    ref: 'Order'
  }],
  notes: [{
    content: {
      type: String,
      required: [true, 'Conteúdo da nota é obrigatório']
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Autor da nota é obrigatório']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save hook para normalizar nome
CustomerSchema.pre('save', function(next) {
  if (this.name) {
    this.normalizedName = this.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  next();
});

// Virtual para ID sem underscore
CustomerSchema.virtual('_id').get(function(this: any) {
  return this.id;
});

// Índices para performance
CustomerSchema.index({ id: 1 });
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ normalizedName: 'text' });

export default mongoose.model<ICustomer>('Customer', CustomerSchema);
