import mongoose from 'mongoose';
import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';
import { User } from '../models/user.model.js';
import { docToPublicUser, nowDate } from '../helpers/index.js';
import { isUserOnline } from '../config/runtimeStore.js';
import type {
  Conversation as ConversationType,
  PublicUser,
  CreateConversationRequest,
  CreateGroupRequest,
  Message as MessageType,
} from '../types/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docToMessage(doc: InstanceType<typeof Message>): MessageType {
  const obj = doc.toObject({ virtuals: true }) as Record<string, unknown>;
  return {
    id: String(obj['id'] ?? obj['_id']),
    conversationId: String(obj['conversationId']),
    senderId: String(obj['senderId']),
    message: String(obj['message'] ?? ''),
    files: (
      obj['files'] as
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
    reactions: ((obj['reactions'] as unknown[]) ?? []).map((r) => {
      const reaction = r as Record<string, unknown>;
      return {
        emoji: String(reaction['emoji']),
        userId: String(reaction['userId']),
        createdAt: reaction['createdAt'] as Date,
      };
    }),
    replyTo: obj['replyTo'] as MessageType['replyTo'],
    seenBy: ((obj['seenBy'] as unknown[]) ?? []).map(String),
    isEdited: Boolean(obj['isEdited']),
    editedAt: obj['editedAt'] as Date | undefined,
    isDeleted: Boolean(obj['isDeleted']),
    deletedAt: obj['deletedAt'] as Date | undefined,
    isPinned: Boolean(obj['isPinned']),
    pinnedAt: obj['pinnedAt'] as Date | undefined,
    pinnedBy: obj['pinnedBy'] ? String(obj['pinnedBy']) : undefined,
    createdAt: obj['createdAt'] as Date,
    updatedAt: obj['updatedAt'] as Date,
  };
}

async function buildConversationDto(
  conv: InstanceType<typeof Conversation>,
  requestingUserId: string,
): Promise<ConversationType> {
  // Populate members
  const memberDocs = await User.find({ _id: { $in: conv.members } });
  const users: PublicUser[] = memberDocs.map((u) => ({
    ...docToPublicUser(u),
    status: isUserOnline(u._id.toString()) ? 'online' : u.status,
  }));

  // FIX: For DM conversations, always derive display name/picture from the
  // OTHER user's document (relative to requestingUserId). The stored conv.name
  // reflects whoever created the conversation, so user B would see their own
  // name rather than user A's name without this swap.
  let displayName = conv.name;
  let displayPicture = conv.picture;

  if (!conv.isGroup) {
    const otherUser = memberDocs.find(
      (u) => u._id.toString() !== requestingUserId,
    );
    if (otherUser) {
      displayName = otherUser.name;
      displayPicture = otherUser.picture;
    }
  }

  // Unread count: messages not sent by me, not deleted, not seen by me
  const unreadCount = await Message.countDocuments({
    conversationId: conv._id,
    senderId: { $ne: new mongoose.Types.ObjectId(requestingUserId) },
    isDeleted: false,
    seenBy: { $nin: [new mongoose.Types.ObjectId(requestingUserId)] },
  });

  // Latest message
  let latestMessage: MessageType | undefined;
  if (conv.latestMessage) {
    const latestDoc = await Message.findById(conv.latestMessage);
    if (latestDoc) latestMessage = docToMessage(latestDoc);
  }

  return {
    id: conv._id.toString(),
    name: displayName,
    picture: displayPicture,
    isGroup: conv.isGroup,
    users,
    adminId: conv.adminId?.toString(),
    latestMessage,
    unreadCount,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const conversationService = {
  /**
   * Get all conversations for a user, sorted by latest activity.
   */
  async getConversationsForUser(userId: string): Promise<ConversationType[]> {
    const convs = await Conversation.find({ members: userId }).sort({
      updatedAt: -1,
    });
    return Promise.all(convs.map((c) => buildConversationDto(c, userId)));
  },

  /**
   * Get a single conversation (only if user is a member).
   */
  async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<ConversationType | null> {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;
    const conv = await Conversation.findOne({
      _id: conversationId,
      members: userId,
    });
    if (!conv) return null;
    return buildConversationDto(conv, userId);
  },

  /**
   * Start or return an existing 1-on-1 DM.
   *
   * FIX 1 (correct name for both users): We now store the TARGET user's
   * name/picture on the conversation document. buildConversationDto swaps
   * displayed name/picture to the OTHER member relative to the viewer, so
   * both parties always see the correct name.
   *
   * FIX 2 (return existing DM): The previous $size:2 + $all query does NOT
   * work reliably in MongoDB because $size and $all are evaluated independently
   * and don't compose into "array contains exactly these two elements". We
   * replace it with a two-step approach: find all non-group convs where both
   * users are members, then filter in JS for exactly 2 members. This is safe
   * because DMs always have exactly 2 members by construction.
   */
  async findOrCreateDirect(
    requesterId: string,
    data: CreateConversationRequest,
  ): Promise<ConversationType | 'user_not_found' | 'cannot_self'> {
    const { userId: targetId } = data;

    if (targetId === requesterId) return 'cannot_self';

    const targetUser = await User.findById(targetId);
    if (!targetUser) return 'user_not_found';

    const requesterObjectId = new mongoose.Types.ObjectId(requesterId);
    const targetObjectId = new mongoose.Types.ObjectId(targetId);

    // FIX: Find existing DM by checking both members are present in a
    // non-group conversation. $elemMatch + countDocuments approach is fragile;
    // instead we query for convs containing BOTH users and filter for 2 members.
    const existing = await Conversation.findOne({
      isGroup: false,
      members: { $all: [requesterObjectId, targetObjectId] },
    });

    // Verify it really is a 2-member conversation (guards against edge cases
    // where a member was once in a group that accidentally matched).
    if (existing && existing.members.length === 2) {
      return buildConversationDto(existing, requesterId);
    }

    // Create new DM. Store target's name/picture so that buildConversationDto
    // can derive the correct display for each viewer via the "other member" swap.
    const newConv = await Conversation.create({
      name: targetUser.name,
      picture: targetUser.picture,
      isGroup: false,
      members: [requesterObjectId, targetObjectId],
    });

    return buildConversationDto(newConv, requesterId);
  },

  /**
   * Create a new group conversation.
   */
  async createGroup(
    creatorId: string,
    data: CreateGroupRequest,
  ): Promise<ConversationType | 'invalid_members'> {
    // Deduplicate and ensure creator is always included
    const uniqueUserIds = [
      ...new Set(data.userIds.filter((id) => id !== creatorId)),
    ];
    const memberIds = [creatorId, ...uniqueUserIds];

    // Group needs creator + at least 2 others
    if (memberIds.length < 3) return 'invalid_members';

    // Verify all users exist
    const count = await User.countDocuments({ _id: { $in: memberIds } });
    if (count !== memberIds.length) return 'invalid_members';

    const newGroup = await Conversation.create({
      name: data.name.trim(),
      picture:
        data.picture ??
        `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(data.name)}`,
      isGroup: true,
      members: memberIds,
      adminId: creatorId,
    });

    return buildConversationDto(newGroup, creatorId);
  },

  /**
   * Add a member to a group (admin only).
   */
  async addGroupMember(
    conversationId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<
    | ConversationType
    | 'not_found'
    | 'not_group'
    | 'not_admin'
    | 'already_member'
    | 'user_not_found'
  > {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return 'not_found';
    if (!conv.isGroup) return 'not_group';
    if (conv.adminId?.toString() !== requesterId) return 'not_admin';

    const alreadyMember = conv.members.some(
      (m) => m.toString() === targetUserId,
    );
    if (alreadyMember) return 'already_member';

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return 'user_not_found';

    conv.members.push(new mongoose.Types.ObjectId(targetUserId));
    conv.updatedAt = nowDate();
    await conv.save();

    return buildConversationDto(conv, requesterId);
  },

  /**
   * Remove a member from a group (admin only, or self-leave).
   */
  async removeGroupMember(
    conversationId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<
    ConversationType | 'not_found' | 'not_group' | 'not_admin' | 'not_member'
  > {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return 'not_found';
    if (!conv.isGroup) return 'not_group';

    const isSelf = requesterId === targetUserId;
    if (!isSelf && conv.adminId?.toString() !== requesterId) return 'not_admin';

    const isMember = conv.members.some((m) => m.toString() === targetUserId);
    if (!isMember) return 'not_member';

    conv.members = conv.members.filter((m) => m.toString() !== targetUserId);
    conv.updatedAt = nowDate();
    await conv.save();

    return buildConversationDto(conv, requesterId);
  },

  /**
   * Mark all messages in a conversation as read for a user.
   */
  async markAsRead(conversationId: string, userId: string): Promise<void> {
    const objectId = new mongoose.Types.ObjectId(userId);
    await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: objectId },
        seenBy: { $nin: [objectId] },
      },
      { $addToSet: { seenBy: objectId } },
    );
  },
};
