import mongoose from 'mongoose';
import { Message } from '../models/message.model.js';
import { Conversation } from '../models/conversation.model.js';
import { nowDate } from '../helpers/index.js';
import type {
  Message as MessageType,
  FileAttachment,
  ReplyTo,
  PaginatedResponse,
  Reaction,
} from '../types/index.js';

// ─── Helper: map Mongoose doc → plain DTO ────────────────────────────────────

function toDto(doc: InstanceType<typeof Message>): MessageType {
  const o = doc.toObject({ virtuals: true }) as Record<string, unknown>;

  const toStr = (v: unknown): string => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (v instanceof mongoose.Types.ObjectId) return v.toString();
    if (typeof v === 'object' && v !== null && '_id' in v)
      return (v as { _id: mongoose.Types.ObjectId })._id.toString();
    return String(v);
  };

  return {
    id: toStr(o['id'] ?? o['_id']),
    conversationId: toStr(o['conversationId']),
    senderId: toStr(o['senderId']),
    message: String(o['message'] ?? ''),
    files: (
      o['files'] as
        | {
            attachmentId: string;
            name: string;
            type: string;
            url: string;
            size: number;
          }[]
        | undefined
    )?.map((f) => ({
      id: f.attachmentId,
      name: f.name,
      type: f.type,
      url: f.url,
      size: f.size,
    })),
    reactions: ((o['reactions'] as unknown[]) ?? []).map((r) => {
      const rr = r as Record<string, unknown>;
      return {
        emoji: String(rr['emoji']),
        userId: toStr(rr['userId']),
        createdAt: rr['createdAt'] as Date,
      } as Reaction;
    }),
    replyTo: o['replyTo']
      ? {
          messageId: toStr(
            (o['replyTo'] as Record<string, unknown>)['messageId'],
          ),
          senderId: toStr(
            (o['replyTo'] as Record<string, unknown>)['senderId'],
          ),
          senderName: String(
            (o['replyTo'] as Record<string, unknown>)['senderName'],
          ),
          message: String((o['replyTo'] as Record<string, unknown>)['message']),
        }
      : undefined,
    seenBy: ((o['seenBy'] as unknown[]) ?? []).map(toStr),
    isEdited: Boolean(o['isEdited']),
    editedAt: o['editedAt'] as Date | undefined,
    isDeleted: Boolean(o['isDeleted']),
    deletedAt: o['deletedAt'] as Date | undefined,
    isPinned: Boolean(o['isPinned']),
    pinnedAt: o['pinnedAt'] as Date | undefined,
    pinnedBy: o['pinnedBy'] ? toStr(o['pinnedBy']) : undefined,
    createdAt: o['createdAt'] as Date,
    updatedAt: o['updatedAt'] as Date,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const messageService = {
  /**
   * Paginated messages for a conversation (cursor = page number).
   * Messages within a page are returned in chronological order.
   */
  async getMessages(
    conversationId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<MessageType>> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));

    const total = await Message.countDocuments({ conversationId });

    const skip = Math.max(0, total - safePage * safeLimit);
    const take = Math.min(safeLimit, total - (safePage - 1) * safeLimit);

    const docs = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(take);

    const hasMore = skip > 0;

    return {
      data: docs.map(toDto),
      total,
      page: safePage,
      limit: safeLimit,
      hasMore,
      nextCursor: hasMore ? String(safePage + 1) : undefined,
    };
  },

  /**
   * Search messages in a single conversation by text (case-insensitive).
   * Excludes deleted messages.
   */
  async searchMessages(
    conversationId: string,
    query: string,
  ): Promise<MessageType[]> {
    const docs = await Message.find({
      conversationId,
      isDeleted: false,
      message: { $regex: query, $options: 'i' },
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return docs.map(toDto);
  },

  /**
   * Search messages across all conversations the requesting user is a member of.
   *
   * FIX: The search is correctly scoped to only the user's conversations so
   * they cannot see messages from conversations they are not part of. We first
   * retrieve conversation IDs via a lean query (faster than full population),
   * then run a single $in query against Message.
   */
  async globalSearch(userId: string, query: string): Promise<MessageType[]> {
    // Lean query — we only need the _id field from each conversation doc.
    const convs = await Conversation.find(
      { members: new mongoose.Types.ObjectId(userId) },
      '_id',
    ).lean();

    const convIds = convs.map((c) => c._id);

    if (convIds.length === 0) return [];

    const docs = await Message.find({
      conversationId: { $in: convIds },
      isDeleted: false,
      message: { $regex: query, $options: 'i' },
    })
      .sort({ createdAt: -1 })
      .limit(100);

    return docs.map(toDto);
  },

  /**
   * Send a new message (text, files, or both).
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    text: string,
    files?: FileAttachment[],
    replyTo?: ReplyTo,
  ): Promise<MessageType | 'conversation_not_found' | 'not_member'> {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return 'conversation_not_found';

    const isMember = conv.members.some((m) => m.toString() === senderId);
    if (!isMember) return 'not_member';

    const now = nowDate();

    const newDoc = await Message.create({
      conversationId,
      senderId,
      message: text,
      files: files?.map((f) => ({
        attachmentId: f.id,
        name: f.name,
        type: f.type,
        url: f.url,
        size: f.size,
      })),
      replyTo: replyTo
        ? {
            messageId: replyTo.messageId,
            senderId: replyTo.senderId,
            senderName: replyTo.senderName,
            message: replyTo.message,
          }
        : undefined,
      reactions: [],
      seenBy: [new mongoose.Types.ObjectId(senderId)],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      latestMessage: newDoc._id,
      updatedAt: now,
    });

    return toDto(newDoc);
  },

  /**
   * Edit a message (sender only).
   */
  async editMessage(
    conversationId: string,
    messageId: string,
    senderId: string,
    newText: string,
  ): Promise<MessageType | 'not_found' | 'not_owner' | 'deleted'> {
    const msg = await Message.findOne({ _id: messageId, conversationId });
    if (!msg) return 'not_found';
    if (msg.senderId.toString() !== senderId) return 'not_owner';
    if (msg.isDeleted) return 'deleted';

    const now = nowDate();
    msg.message = newText;
    msg.isEdited = true;
    msg.editedAt = now;
    msg.updatedAt = now;
    await msg.save();

    await refreshLatestMessage(conversationId);

    return toDto(msg);
  },

  /**
   * Soft-delete a message (sender only).
   */
  async deleteMessage(
    conversationId: string,
    messageId: string,
    senderId: string,
  ): Promise<MessageType | 'not_found' | 'not_owner'> {
    const msg = await Message.findOne({ _id: messageId, conversationId });
    if (!msg) return 'not_found';
    if (msg.senderId.toString() !== senderId) return 'not_owner';

    const now = nowDate();
    msg.isDeleted = true;
    msg.deletedAt = now;
    msg.message = '';
    msg.updatedAt = now;
    await msg.save();

    await refreshLatestMessage(conversationId);

    return toDto(msg);
  },

  /**
   * Toggle a reaction on a message.
   */
  async toggleReaction(
    conversationId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<MessageType | 'not_found' | 'deleted'> {
    const msg = await Message.findOne({ _id: messageId, conversationId });
    if (!msg) return 'not_found';
    if (msg.isDeleted) return 'deleted';

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const existingIdx = msg.reactions.findIndex(
      (r) => r.emoji === emoji && r.userId.toString() === userId,
    );

    if (existingIdx !== -1) {
      msg.reactions.splice(existingIdx, 1);
    } else {
      msg.reactions.push({ emoji, userId: userObjectId, createdAt: nowDate() });
    }

    msg.updatedAt = nowDate();
    await msg.save();

    return toDto(msg);
  },

  /**
   * Pin a message in a conversation.
   *
   * FIX: The service correctly handles both DMs and group chats — there is no
   * group-only restriction on pinning. Any conversation member with access
   * (verified by requireConversationMember middleware) can pin. The controller
   * now emits MESSAGE_PINNED via socket so all room members update in real time.
   */
  async pinMessage(
    conversationId: string,
    messageId: string,
    pinnedBy: string,
  ): Promise<MessageType | 'not_found' | 'deleted'> {
    // Verify the conversation exists and the message belongs to it
    const conv = await Conversation.findById(conversationId);
    if (!conv) return 'not_found';

    const msg = await Message.findOne({ _id: messageId, conversationId });
    if (!msg) return 'not_found';
    if (msg.isDeleted) return 'deleted';

    const now = nowDate();
    msg.isPinned = true;
    msg.pinnedAt = now;
    msg.pinnedBy = new mongoose.Types.ObjectId(pinnedBy);
    msg.updatedAt = now;
    await msg.save();

    return toDto(msg);
  },

  /**
   * Unpin a message.
   *
   * FIX: Same as pin — works for both DMs and group chats. The controller
   * emits MESSAGE_UNPINNED via socket so all room members update in real time.
   */
  async unpinMessage(
    conversationId: string,
    messageId: string,
  ): Promise<MessageType | 'not_found' | 'deleted'> {
    const msg = await Message.findOne({ _id: messageId, conversationId });
    if (!msg) return 'not_found';
    if (msg.isDeleted) return 'deleted';

    msg.isPinned = false;
    msg.pinnedAt = undefined;
    msg.pinnedBy = undefined;
    msg.updatedAt = nowDate();
    await msg.save();

    return toDto(msg);
  },

  /**
   * Get all pinned (non-deleted) messages in a conversation, newest pin first.
   */
  async getPinnedMessages(conversationId: string): Promise<MessageType[]> {
    const docs = await Message.find({
      conversationId,
      isPinned: true,
      isDeleted: false,
    }).sort({ pinnedAt: -1 });

    return docs.map(toDto);
  },

  /**
   * Forward a message to another conversation.
   */
  async forwardMessage(
    messageId: string,
    fromConversationId: string,
    toConversationId: string,
    senderId: string,
  ): Promise<MessageType | 'not_found' | 'target_not_found' | 'not_member'> {
    const sourceMsg = await Message.findOne({
      _id: messageId,
      conversationId: fromConversationId,
      isDeleted: false,
    });
    if (!sourceMsg) return 'not_found';

    const targetConv = await Conversation.findById(toConversationId);
    if (!targetConv) return 'target_not_found';

    const isMember = targetConv.members.some((m) => m.toString() === senderId);
    if (!isMember) return 'not_member';

    const now = nowDate();
    const forwarded = await Message.create({
      conversationId: toConversationId,
      senderId,
      message: sourceMsg.message,
      files: sourceMsg.files,
      reactions: [],
      seenBy: [new mongoose.Types.ObjectId(senderId)],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });

    await Conversation.findByIdAndUpdate(toConversationId, {
      latestMessage: forwarded._id,
      updatedAt: now,
    });

    return toDto(forwarded);
  },

  /**
   * Mark a single message as seen by a user.
   */
  async markMessageSeen(
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<MessageType | null> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const msg = await Message.findOneAndUpdate(
      {
        _id: messageId,
        conversationId,
        seenBy: { $nin: [userObjectId] },
      },
      { $addToSet: { seenBy: userObjectId } },
      { new: true },
    );

    if (!msg) {
      // May already be seen — return the message anyway
      const existing = await Message.findOne({
        _id: messageId,
        conversationId,
      });
      return existing ? toDto(existing) : null;
    }

    return toDto(msg);
  },
};

// ─── Private helpers ──────────────────────────────────────────────────────────

async function refreshLatestMessage(conversationId: string): Promise<void> {
  const latest = await Message.findOne({ conversationId, isDeleted: false })
    .sort({ createdAt: -1 })
    .select('_id');

  await Conversation.findByIdAndUpdate(conversationId, {
    latestMessage: latest?._id ?? null,
    updatedAt: nowDate(),
  });
}
