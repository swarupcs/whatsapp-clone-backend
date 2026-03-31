import mongoose from 'mongoose';
import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';
import { User } from '../models/user.model.js';
import { docToPublicUser, nowDate } from '../helpers/index.js';
import { isUserOnline, getSocketsForUser } from '../config/runtimeStore.js';
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

  // BUG FIX 1: For DM conversations, show the OTHER person's name/picture
  // relative to the requesting user, not the stored name (which is from creator's POV)
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
   */
  async findOrCreateDirect(
    requesterId: string,
    data: CreateConversationRequest,
  ): Promise<ConversationType | 'user_not_found' | 'cannot_self'> {
    const { userId: targetId } = data;

    if (targetId === requesterId) return 'cannot_self';

    const targetUser = await User.findById(targetId);
    if (!targetUser) return 'user_not_found';

    // Check if DM already exists
    const existing = await Conversation.findOne({
      isGroup: false,
      members: { $all: [requesterId, targetId], $size: 2 },
    });

    if (existing) return buildConversationDto(existing, requesterId);

    const requester = await User.findById(requesterId);
    if (!requester) return 'user_not_found';

    // BUG FIX 1: Store the target user's name/picture so that when the target
    // views this conversation, buildConversationDto will swap it to the requester's
    // name/picture for them (since we now derive name from the other member).
    const newConv = await Conversation.create({
      name: targetUser.name,
      picture: targetUser.picture,
      isGroup: false,
      members: [requesterId, targetId],
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
   * Returns the updated conversation DTO AND the new member's socket IDs
   * so the caller (controller) can join them to the socket room.
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
   * Returns the updated conversation DTO.
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
