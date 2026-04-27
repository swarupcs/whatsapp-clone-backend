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
  const memberDocs = await User.find({ _id: { $in: conv.members } });
  const users: PublicUser[] = memberDocs.map((u) => ({
    ...docToPublicUser(u),
    status: isUserOnline(u._id.toString()) ? 'online' : u.status,
  }));

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

  const unreadCount = await Message.countDocuments({
    conversationId: conv._id,
    senderId: { $ne: new mongoose.Types.ObjectId(requestingUserId) },
    isDeleted: false,
    seenBy: { $nin: [new mongoose.Types.ObjectId(requestingUserId)] },
  });

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
  async getConversationsForUser(userId: string): Promise<ConversationType[]> {
    const convs = await Conversation.find({ members: userId }).sort({
      updatedAt: -1,
    });
    return Promise.all(convs.map((c) => buildConversationDto(c, userId)));
  },

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

    const existing = await Conversation.findOne({
      isGroup: false,
      members: { $all: [requesterObjectId, targetObjectId] },
    });

    if (existing && existing.members.length === 2) {
      return buildConversationDto(existing, requesterId);
    }

    const newConv = await Conversation.create({
      name: targetUser.name,
      picture: targetUser.picture,
      isGroup: false,
      members: [requesterObjectId, targetObjectId],
    });

    return buildConversationDto(newConv, requesterId);
  },

  async createGroup(
    creatorId: string,
    data: CreateGroupRequest,
  ): Promise<ConversationType | 'invalid_members'> {
    // Deduplicate and ensure creator is always included
    const uniqueUserIds = [
      ...new Set(data.userIds.filter((id) => id !== creatorId)),
    ];
    const memberIds = [creatorId, ...uniqueUserIds];

    // Group needs creator + at least 2 others = 3 total minimum
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

  async updateGroup(
    conversationId: string,
    requesterId: string,
    data: { name?: string; picture?: string },
  ): Promise<ConversationType | 'not_found' | 'not_group' | 'not_admin'> {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return 'not_found';
    if (!conv.isGroup) return 'not_group';
    if (conv.adminId?.toString() !== requesterId) return 'not_admin';

    if (data.name) conv.name = data.name.trim();
    if (data.picture) conv.picture = data.picture;

    conv.updatedAt = nowDate();
    await conv.save();

    return buildConversationDto(conv, requesterId);
  },

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

    // Only admin can remove others (self-leave goes through leaveGroup)
    if (conv.adminId?.toString() !== requesterId) return 'not_admin';

    const isMember = conv.members.some((m) => m.toString() === targetUserId);
    if (!isMember) return 'not_member';

    conv.members = conv.members.filter((m) => m.toString() !== targetUserId);
    conv.updatedAt = nowDate();
    await conv.save();

    return buildConversationDto(conv, requesterId);
  },

  /**
   * Leave a group conversation.
   * - Any member can leave themselves.
   * - If the leaving user is admin and others remain, admin transfers to the
   *   next member in the list.
   * - If they are the last member, the conversation (and its messages) is deleted.
   * Returns 'deleted' if the conversation was removed, or the updated DTO.
   */
  async leaveGroup(
    conversationId: string,
    userId: string,
  ): Promise<
    ConversationType | 'deleted' | 'not_found' | 'not_group' | 'not_member'
  > {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return 'not_found';
    if (!conv.isGroup) return 'not_group';

    const isMember = conv.members.some((m) => m.toString() === userId);
    if (!isMember) return 'not_member';

    // Remove user from members list
    conv.members = conv.members.filter((m) => m.toString() !== userId);

    // If no members left, delete the conversation and all its messages
    if (conv.members.length === 0) {
      await Message.deleteMany({ conversationId: conv._id });
      await Conversation.findByIdAndDelete(conv._id);
      return 'deleted';
    }

    // If leaving user was admin, transfer admin to the first remaining member
    if (conv.adminId?.toString() === userId) {
      conv.adminId = conv.members[0];
    }

    conv.updatedAt = nowDate();
    await conv.save();

    // Build DTO from the perspective of the first remaining member
    // (the leaving user is no longer in the conversation)
    return buildConversationDto(conv, conv.members[0]!.toString());
  },

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
