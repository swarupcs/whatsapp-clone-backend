import mongoose, { type Document, type Model, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IRefreshToken {
  token: string;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

export interface IRefreshTokenDocument extends IRefreshToken, Document {}

// ─── Schema ───────────────────────────────────────────────────────────────────

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Auto-delete expired tokens via TTL index
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Model ────────────────────────────────────────────────────────────────────

export const RefreshToken: Model<IRefreshTokenDocument> =
  mongoose.models['RefreshToken'] ??
  mongoose.model<IRefreshTokenDocument>('RefreshToken', refreshTokenSchema);
