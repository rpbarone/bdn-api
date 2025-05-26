import mongoose, { Schema, Document } from 'mongoose';
import { validatePositiveNumber } from '../utils/validations';

// Interfaces para o Course
export interface ICourseLesson {
  title: string;
  description?: string;
  mediaUrl?: string;
  type: 'video' | 'doc';
  durationSeconds?: number;
  order: number;
  slug?: string;
}

export interface IQuizOption {
  answer: string;
  isCorrect: boolean;
}

export interface IQuizQuestion {
  content: string;
  imageUrl?: string;
  options: IQuizOption[];
}

export interface ICourse extends Document {
  id: string;
  title: string;
  titleNormalized?: string;
  description?: string;
  coverPictureUrl?: string;
  isActive: boolean;
  isInitial: boolean;
  durationSeconds?: number;
  conclusions: number;
  lessons: ICourseLesson[];
  quiz?: {
    id?: string;
    timeLimit?: number;
    maxPoints?: number;
    questions?: IQuizQuestion[];
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

const CourseSchema = new Schema<ICourse>({
  title: {
    type: String,
    required: [true, 'Título é obrigatório'],
    trim: true
  },
  titleNormalized: {
    type: String,
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    trim: true
  },
  coverPictureUrl: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isInitial: {
    type: Boolean,
    default: false
  },
  durationSeconds: {
    type: Number,
    validate: {
      validator: validatePositiveNumber,
      message: 'Duração deve ser positiva'
    }
  },
  conclusions: {
    type: Number,
    default: 0,
    validate: {
      validator: validatePositiveNumber,
      message: 'Número de conclusões deve ser positivo'
    }
  },
  lessons: {
    type: [{
      title: {
        type: String,
        required: [true, 'Título da lição é obrigatório'],
        trim: true
      },
      description: {
        type: String,
        trim: true
      },
      mediaUrl: {
        type: String,
        trim: true
      },
      type: {
        type: String,
        enum: {
          values: ['video', 'doc'],
          message: 'Tipo de lição inválido'
        },
        required: [true, 'Tipo da lição é obrigatório']
      },
      durationSeconds: {
        type: Number,
        validate: {
          validator: validatePositiveNumber,
          message: 'Duração deve ser positiva'
        }
      },
      order: {
        type: Number,
        required: [true, 'Ordem da lição é obrigatória']
      },
      slug: {
        type: String,
        trim: true
      }
    }],
    validate: {
      validator: (v: any[]) => Array.isArray(v) && v.length > 0,
      message: 'Curso deve ter pelo menos uma lição'
    }
  },
  quiz: {
    id: {
      type: String,
      validate: {
        validator: (v: string) => !v || /^QZ\d{4,}$/.test(v),
        message: 'ID deve estar no formato QZ1000'
      }
    },
    timeLimit: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Tempo limite deve ser positivo'
      }
    },
    maxPoints: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Pontuação máxima deve ser positiva'
      }
    },
    questions: [{
      content: {
        type: String,
        required: [true, 'Conteúdo da pergunta é obrigatório']
      },
      imageUrl: String,
      options: [{
        answer: {
          type: String,
          required: [true, 'Resposta é obrigatória']
        },
        isCorrect: {
          type: Boolean,
          required: [true, 'Indicação de resposta correta é obrigatória']
        }
      }]
    }]
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

// Pre-save hook para normalizar título
CourseSchema.pre('save', function(next) {
  if (this.title) {
    this.titleNormalized = this.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  next();
});

// Virtual para ID sem underscore
CourseSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
CourseSchema.index({ titleNormalized: 'text' });
CourseSchema.index({ isActive: 1 });
CourseSchema.index({ isInitial: 1 });

export default mongoose.model<ICourse>('Course', CourseSchema);
