import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { validatePhone, validateInstagram, validatePercentage, validatePositiveNumber } from '../utils/validations';

// Interfaces para o Lead
export interface ILeadStageHistory {
  stage: string;
  enteredAt: Date;
  lastViewedDate?: Date;
  timeSpentSeconds: number;
  viewCount: number;
}

export interface ILeadActivity {
  id: string;
  type: 'system_event' | 'user_action' | 'ai_message' | 'lead_interaction';
  title: string;
  messageContent?: string;
  createdAt: Date;
}

export interface ILead extends Document {
  id: string;
  currentStage: string;
  stageHistory: ILeadStageHistory[];
  activities: ILeadActivity[];
  indicatedBy?: string;
  name: string;
  normalizedName?: string;
  phone?: string;
  profilePicture?: string;
  instagramUsername?: string;
  niches?: string[];
  followers: number;
  engagement: number;
  aiAnalysis?: {
    approved: boolean;
    level?: 1 | 2 | 3 | 4;
    visualPerformanceScore?: number;
    contentRelevanceScore?: number;
    audienceEngagementScore?: number;
    conversionPotentialScore?: number;
    profile_highlights?: string[];
  };
  adminReview: {
    reviewedAt?: Date;
    reviewedBy?: string;
    status: 'pending' | 'approved' | 'rejected';
    assignedLevel?: 1 | 2 | 3 | 4;
    notes?: string;
    previousStatus?: string;
    previousReviewedAt?: Date;
    previousReviewedBy?: string;
    previousNotes?: string;
    statusChangedAt?: Date;
  };
  userInput?: {
    avgStoryViews?: number;
    avgReelViews?: number;
    engagementRate?: number;
  };
  presentedBenefits?: string;
  location?: {
    city?: string;
    uf?: string;
    region?: string;
  };
  password: string;
  termsAcceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Métodos
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const LeadSchema = new Schema<ILead>({
  id: {
    type: String,
    required: [true, 'ID é obrigatório'],
    unique: true,
    validate: {
      validator: (v: string) => /^LD\d{4,}$/.test(v),
      message: 'ID deve estar no formato LD1000'
    }
  },
  currentStage: {
    type: String,
    required: [true, 'Estágio atual é obrigatório'],
    trim: true
  },
  stageHistory: [{
    stage: {
      type: String,
      required: [true, 'Estágio é obrigatório'],
      trim: true
    },
    enteredAt: {
      type: Date,
      default: Date.now
    },
    lastViewedDate: {
      type: Date
    },
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
    }
  }],
  activities: [{
    id: {
      type: String,
      required: [true, 'ID da atividade é obrigatório']
    },
    type: {
      type: String,
      enum: {
        values: ['system_event', 'user_action', 'ai_message', 'lead_interaction'],
        message: 'Tipo de atividade inválido'
      },
      required: [true, 'Tipo da atividade é obrigatório']
    },
    title: {
      type: String,
      required: [true, 'Título da atividade é obrigatório'],
      trim: true
    },
    messageContent: {
      type: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  indicatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
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
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: (v: string) => !v || validatePhone(v),
      message: 'Telefone deve ter 10 ou 11 dígitos válidos'
    }
  },
  profilePicture: {
    type: String,
    trim: true
  },
  instagramUsername: {
    type: String,
    trim: true,
    validate: {
      validator: (v: string) => !v || validateInstagram(v),
      message: 'Username do Instagram inválido'
    }
  },
  niches: [{
    type: Schema.Types.ObjectId,
    ref: 'Niche'
  }],
  followers: {
    type: Number,
    default: 0,
    validate: {
      validator: validatePositiveNumber,
      message: 'Número de seguidores deve ser positivo'
    }
  },
  engagement: {
    type: Number,
    default: 0,
    validate: {
      validator: validatePositiveNumber,
      message: 'Engajamento deve ser positivo'
    }
  },
  aiAnalysis: {
    approved: {
      type: Boolean,
      default: false
    },
    level: {
      type: Number,
      enum: {
        values: [1, 2, 3, 4],
        message: 'Nível deve ser entre 1 e 4'
      }
    },
    visualPerformanceScore: {
      type: Number,
      validate: {
        validator: validatePercentage,
        message: 'Score deve estar entre 0 e 100'
      }
    },
    contentRelevanceScore: {
      type: Number,
      validate: {
        validator: validatePercentage,
        message: 'Score deve estar entre 0 e 100'
      }
    },
    audienceEngagementScore: {
      type: Number,
      validate: {
        validator: validatePercentage,
        message: 'Score deve estar entre 0 e 100'
      }
    },
    conversionPotentialScore: {
      type: Number,
      validate: {
        validator: validatePercentage,
        message: 'Score deve estar entre 0 e 100'
      }
    },
    profile_highlights: [String]
  },
  adminReview: {
    reviewedAt: Date,
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected'],
        message: 'Status de revisão inválido'
      },
      default: 'pending'
    },
    assignedLevel: {
      type: Number,
      enum: {
        values: [1, 2, 3, 4],
        message: 'Nível deve ser entre 1 e 4'
      }
    },
    notes: String,
    previousStatus: String,
    previousReviewedAt: Date,
    previousReviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    previousNotes: String,
    statusChangedAt: Date
  },
  userInput: {
    avgStoryViews: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Visualizações médias de story devem ser positivas'
      }
    },
    avgReelViews: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Visualizações médias de reel devem ser positivas'
      }
    },
    engagementRate: {
      type: Number,
      validate: {
        validator: validatePercentage,
        message: 'Taxa de engajamento deve estar entre 0 e 100%'
      }
    }
  },
  presentedBenefits: {
    type: String
  },
  location: {
    city: String,
    uf: {
      type: String,
      uppercase: true,
      validate: {
        validator: (v: string) => !v || /^[A-Z]{2}$/.test(v),
        message: 'UF deve ter 2 letras maiúsculas'
      }
    },
    region: String
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: [8, 'Senha deve ter pelo menos 8 caracteres'],
    select: false
  },
  termsAcceptedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save hook para hash da senha
LeadSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
    this.password = await bcrypt.hash(this.password, rounds);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Pre-save hook para normalizar nome
LeadSchema.pre('save', function(next) {
  if (this.name) {
    this.normalizedName = this.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  next();
});

// Método para comparar senha
LeadSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch {
    return false;
  }
};


// Índices para performance
LeadSchema.index({ currentStage: 1 });
LeadSchema.index({ 'adminReview.status': 1 });
LeadSchema.index({ indicatedBy: 1 });
LeadSchema.index({ instagramUsername: 1 });
LeadSchema.index({ normalizedName: 'text' });

export default mongoose.model<ILead>('Lead', LeadSchema);
