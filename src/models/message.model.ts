import mongoose, { type Document, type Model, Schema } from 'mongoose';

// ─── Sub-document interfaces ──────────────────────────────────────────────────

export interface IReaction {
  emoji: string;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IFileAttachment {
  attachmentId: string;
  name: string;
  type: string;
  url: string;
  size: number;
}

export interface IReplyTo {
  messageId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderName: string;
  message: string;
}

// ─── Main interface ───────────────────────────────────────────────────────────

export interface IMessage {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  message: string;
  files?: IFileAttachment[];
  reactions: IReaction[];
  replyTo?: IReplyTo;
  seenBy: mongoose.Types.ObjectId[];
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  isPinned: boolean;
  pinnedAt?: Date;
  pinnedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessageDocument extends IMessage, Document {
  _id: mongoose.Types.ObjectId;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const reactionSchema = new Schema<IReaction>(
  {
    emoji: { type: String, required: true, maxlength: 8 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const fileAttachmentSchema = new Schema<IFileAttachment>(
  {
    attachmentId: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

const replyToSchema = new Schema<IReplyTo>(
  {
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    message: { type: String, required: true, maxlength: 200 },
  },
  { _id: false },
);

// ─── Main schema ──────────────────────────────────────────────────────────────

const messageSchema = new Schema<IMessageDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      default: '',
      maxlength: 4000,
    },
    files: [fileAttachmentSchema],
    reactions: [reactionSchema],
    replyTo: replyToSchema,
    seenBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    isPinned: { type: Boolean, default: false, index: true },
    pinnedAt: Date,
    pinnedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret['id'] = ret['_id'].toString();
        delete ret['_id'];
        delete ret['__v'];
        // Normalize ObjectId refs to strings for the frontend
        if (ret['senderId']?._id) ret['senderId'] = ret['senderId'].id;
        if (ret['conversationId']?._id) ret['conversationId'] = ret['conversationId'].id;
        if (ret['pinnedBy']?._id) ret['pinnedBy'] = ret['pinnedBy'].id;
        if (Array.isArray(ret['seenBy'])) {
          ret['seenBy'] = ret['seenBy'].map((s: unknown) =>
            typeof s === 'object' && s !== null && '_id' in s
              ? (s as { _id: { toString(): string } })._id.toString()
              : String(s),
          );
        }
        if (Array.isArray(ret['reactions'])) {
          ret['reactions'] = ret['reactions'].map((r: Record<string, unknown>) => ({
            ...r,
            userId:
              r['userId'] && typeof r['userId'] === 'object' && '_id' in r['userId']
                ? (r['userId'] as { _id: { toString(): string } })._id.toString()
                : String(r['userId']),
          }));
        }
        if (Array.isArray(ret['files'])) {
          ret['files'] = ret['files'].map((f: any) => {
            const { attachmentId, ...rest } = f;
            return { id: attachmentId, ...rest };
          }) as any;
        }        return ret;      },
    },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ conversationId: 1, isPinned: 1 });
messageSchema.index({ conversationId: 1, message: 'text' });

// ─── Model ────────────────────────────────────────────────────────────────────

export const Message: Model<IMessageDocument> =
  mongoose.models['Message'] ??
  mongoose.model<IMessageDocument>('Message', messageSchema);
