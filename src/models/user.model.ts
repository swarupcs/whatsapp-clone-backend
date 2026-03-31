import mongoose, { type Document, type Model, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────

export type UserStatus = 'online' | 'offline' | 'away';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  picture: string;
  status: UserStatus;
  about: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  _id: mongoose.Types.ObjectId;
}

export type IUserPublic = Omit<IUser, 'passwordHash'> & { id: string };

// ─── Schema ───────────────────────────────────────────────────────────────────

const userSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    picture: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away'],
      default: 'offline',
    },
    about: {
      type: String,
      default: 'Hey there! I am using WhatsUp',
      maxlength: 200,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret['id'] = ret['_id'].toString();
        delete ret['_id'];
        delete ret['__v'];
        delete ret['passwordHash'];
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

userSchema.index({ name: 'text', email: 'text' });

// ─── Model ────────────────────────────────────────────────────────────────────

export const User: Model<IUserDocument> =
  mongoose.models['User'] ?? mongoose.model<IUserDocument>('User', userSchema);
