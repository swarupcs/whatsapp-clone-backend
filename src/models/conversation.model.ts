import mongoose, { type Document, type Model, Schema } from 'mongoose';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IConversation {
  name: string;
  picture: string;
  isGroup: boolean;
  members: mongoose.Types.ObjectId[];
  adminId?: mongoose.Types.ObjectId;
  latestMessage?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationDocument extends IConversation, Document {
  _id: mongoose.Types.ObjectId;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const conversationSchema = new Schema<IConversationDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    picture: {
      type: String,
      default: '',
    },
    isGroup: {
      type: Boolean,
      default: false,
      index: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    latestMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
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
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Fast lookup: "all conversations containing this user"
conversationSchema.index({ members: 1, updatedAt: -1 });

// Unique DM: prevent duplicate 1-on-1 conversations
// (enforced in service layer, not DB, due to variable-length array)

// ─── Model ────────────────────────────────────────────────────────────────────

export const Conversation: Model<IConversationDocument> =
  mongoose.models['Conversation'] ??
  mongoose.model<IConversationDocument>('Conversation', conversationSchema);
