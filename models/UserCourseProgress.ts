import mongoose, { Schema, Document } from 'mongoose';
import { validatePositiveNumber, validatePercentage } from '../utils/validations';

// Interfaces para o UserCourseProgress
export interface ICompletedLesson {
  lessonId: string;
  completedAt: Date;
}

export interface IQuizAnswer {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  pointsEarned?: number;
}

export interface IUserCourseProgress extends Document {
  id: string;
  userId: string;
  courseId: string;
  enrollmentDate: Date;
  completionDate?: Date;
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number;
  completedLessons: ICompletedLesson[];
  quiz?: {
    completed: boolean;
    completedAt?: Date;
    score?: number;
    correctAnswers?: number;
    totalQuestions?: number;
    percentageCorrect?: number;
    answers?: IQuizAnswer[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserCourseProgressSchema = new Schema<IUserCourseProgress>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Usuário é obrigatório']
  },
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Curso é obrigatório']
  },
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  completionDate: Date,
  status: {
    type: String,
    enum: {
      values: ['not_started', 'in_progress', 'completed'],
      message: 'Status de progresso inválido'
    },
    default: 'not_started'
  },
  progress: {
    type: Number,
    default: 0,
    validate: {
      validator: validatePercentage,
      message: 'Progresso deve estar entre 0 e 100%'
    }
  },
  completedLessons: [{
    lessonId: {
      type: String,
      required: [true, 'ID da lição é obrigatório']
    },
    completedAt: {
      type: Date,
      default: Date.now
    }
  }],
  quiz: {
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date,
    score: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Pontuação deve ser positiva'
      }
    },
    correctAnswers: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Número de respostas corretas deve ser positivo'
      }
    },
    totalQuestions: {
      type: Number,
      validate: {
        validator: validatePositiveNumber,
        message: 'Número total de questões deve ser positivo'
      }
    },
    percentageCorrect: {
      type: Number,
      validate: {
        validator: validatePercentage,
        message: 'Porcentagem deve estar entre 0 e 100%'
      }
    },
    answers: [{
      questionId: {
        type: String,
        required: [true, 'ID da questão é obrigatório']
      },
      selectedOptionId: {
        type: String,
        required: [true, 'ID da opção selecionada é obrigatório']
      },
      isCorrect: {
        type: Boolean,
        required: [true, 'Indicação de resposta correta é obrigatória']
      },
      pointsEarned: {
        type: Number,
        validate: {
          validator: validatePositiveNumber,
          message: 'Pontos ganhos devem ser positivos'
        }
      }
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
UserCourseProgressSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
UserCourseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });
UserCourseProgressSchema.index({ status: 1 });
UserCourseProgressSchema.index({ enrollmentDate: -1 });

export default mongoose.model<IUserCourseProgress>('UserCourseProgress', UserCourseProgressSchema);
