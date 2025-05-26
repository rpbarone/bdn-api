import mongoose, { Schema, Document } from 'mongoose';

// Interface para o AppReview
export interface IAppReview extends Document {
  id: string;
  userId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createdAt: Date;
}

const AppReviewSchema = new Schema<IAppReview>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Usuário é obrigatório']
  },
  rating: {
    type: Number,
    enum: {
      values: [1, 2, 3, 4, 5],
      message: 'Avaliação deve ser entre 1 e 5'
    },
    required: [true, 'Avaliação é obrigatória']
  },
  comment: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para ID sem underscore
AppReviewSchema.virtual('id').get(function(this: any) {
  return this._id?.toHexString() || this._id?.toString();
});

// Índices para performance
AppReviewSchema.index({ userId: 1 });
AppReviewSchema.index({ rating: 1 });
AppReviewSchema.index({ createdAt: -1 });

export default mongoose.model<IAppReview>('AppReview', AppReviewSchema);
