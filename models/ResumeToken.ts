import mongoose, { Schema, Document } from 'mongoose';

export interface IResumeToken extends Document {
  streamName: string;
  token: any;
  lastUpdated: Date;
  metadata?: {
    lastProcessedAt?: Date;
    processedCount?: number;
    errorCount?: number;
  };
}

const ResumeTokenSchema = new Schema<IResumeToken>({
  streamName: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  token: { 
    type: Schema.Types.Mixed, 
    required: true 
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  metadata: {
    lastProcessedAt: Date,
    processedCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Index para limpeza automática de tokens antigos
ResumeTokenSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 604800 }); // 7 dias

export const ResumeToken = mongoose.model<IResumeToken>('ResumeToken', ResumeTokenSchema);
