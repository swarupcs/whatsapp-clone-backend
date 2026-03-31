import type { Request, Response } from 'express';
import { conversationService } from '../services/conversation.service.js';
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
} from '../helpers/index.js';
import {
  createConversationSchema,
  createGroupSchema,
  safeParseBody,
} from '../helpers/validation.js';
import type { Server as SocketIOServer } from 'socket.io';
import { getSocketsForUser } from '../config/runtimeStore.js';

export const conversationController = {
  /** GET /api/conversations */
  async list(req: Request, res: Response): Promise<void> {
    const conversations = await conversationService.getConversationsForUser(
      req.userId!,
    );
    sendSuccess(res, conversations);
  },

  /** GET /api/conversations/:conversationId */
  async getOne(req: Request, res: Response): Promise<void> {
    const conv = await conversationService.getConversationById(
      req.params['conversationId']!,
      req.userId!,
    );
    if (!conv) {
      sendNotFound(res, 'Conversation');
      return;
    }
    sendSuccess(res, conv);
  },

  /** POST /api/conversations */
  async createDirect(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(createConversationSchema, req.body);
    if (!parsed.success) {
      sendError(res, parsed.error);
      return;
    }

    const result = await conversationService.findOrCreateDirect(
      req.userId!,
      parsed.data,
    );
    if (result === 'user_not_found') {
      sendNotFound(res, 'User');
      return;
    }
    if (result === 'cannot_self') {
      sendError(res, 'You cannot start a conversation with yourself');
      return;
    }

    sendCreated(res, result, 'Conversation ready');

    // BUG FIX 6: Join BOTH users' sockets to the new DM room
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const { userId: targetId } = parsed.data;
      const roomId = result.id;
      // Join the requester's sockets
      getSocketsForUser(req.userId!).forEach((sid) => {
        io.sockets.sockets.get(sid)?.join(roomId);
      });
      // Join the target user's sockets
      getSocketsForUser(targetId).forEach((sid) => {
        io.sockets.sockets.get(sid)?.join(roomId);
      });
      console.log(`[Socket] DM room ${roomId} created, joined both users`);
    }
  },

  /** POST /api/conversations/group */
  async createGroup(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(createGroupSchema, req.body);
    if (!parsed.success) {
      sendError(res, parsed.error);
      return;
    }

    const result = await conversationService.createGroup(
      req.userId!,
      parsed.data,
    );
    if (result === 'invalid_members') {
      sendError(
        res,
        'One or more specified users do not exist, or group must have at least 2 other members',
      );
      return;
    }

    sendCreated(res, result, 'Group created');

    // BUG FIX 6: Join ALL members' sockets to the new group room
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const roomId = result.id;
      result.users.forEach((member) => {
        getSocketsForUser(member.id).forEach((sid) => {
          io.sockets.sockets.get(sid)?.join(roomId);
          console.log(
            `[Socket] User ${member.id} socket ${sid} joined group room ${roomId}`,
          );
        });
      });
    }
  },

  /** POST /api/conversations/:conversationId/members */
  async addMember(req: Request, res: Response): Promise<void> {
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      sendError(res, 'userId is required');
      return;
    }

    const result = await conversationService.addGroupMember(
      req.params['conversationId']!,
      req.userId!,
      userId,
    );

    if (result === 'not_found') {
      sendNotFound(res, 'Conversation');
      return;
    }
    if (result === 'not_group') {
      sendError(res, 'This is not a group conversation');
      return;
    }
    if (result === 'not_admin') {
      sendForbidden(res, 'Only the group admin can add members');
      return;
    }
    if (result === 'already_member') {
      sendError(res, 'User is already a member of this group');
      return;
    }
    if (result === 'user_not_found') {
      sendNotFound(res, 'User');
      return;
    }

    sendSuccess(res, result, 'Member added');

    // BUG FIX 6: Join the new member's active sockets to the group room immediately
    // so they receive real-time messages without needing to reconnect
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const roomId = req.params['conversationId']!;
      getSocketsForUser(userId).forEach((sid) => {
        io.sockets.sockets.get(sid)?.join(roomId);
        console.log(
          `[Socket] New member ${userId} socket ${sid} joined group room ${roomId}`,
        );
      });

      // Notify the room that a new member was added
      io.to(roomId).emit('member_added', {
        conversationId: roomId,
        userId,
        conversation: result,
      });
    }
  },

  /** DELETE /api/conversations/:conversationId/members/:userId */
  async removeMember(req: Request, res: Response): Promise<void> {
    const conversationId = req.params['conversationId']!;
    const targetUserId = req.params['userId']!;

    const result = await conversationService.removeGroupMember(
      conversationId,
      req.userId!,
      targetUserId,
    );

    if (result === 'not_found') {
      sendNotFound(res, 'Conversation');
      return;
    }
    if (result === 'not_group') {
      sendError(res, 'This is not a group conversation');
      return;
    }
    if (result === 'not_admin') {
      sendForbidden(res, 'Only the admin can remove members');
      return;
    }
    if (result === 'not_member') {
      sendNotFound(res, 'Member');
      return;
    }

    sendSuccess(res, result, 'Member removed');

    // BUG FIX 5: Remove the kicked user's sockets from the group room immediately
    // so they stop receiving messages in real-time
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const roomId = conversationId;
      getSocketsForUser(targetUserId).forEach((sid) => {
        io.sockets.sockets.get(sid)?.leave(roomId);
        console.log(
          `[Socket] Removed member ${targetUserId} socket ${sid} left group room ${roomId}`,
        );
      });

      // Notify remaining room members
      io.to(roomId).emit('member_removed', {
        conversationId: roomId,
        userId: targetUserId,
        conversation: result,
      });

      // Notify the removed user on their own sockets
      getSocketsForUser(targetUserId).forEach((sid) => {
        io.to(sid).emit('removed_from_group', {
          conversationId: roomId,
        });
      });
    }
  },

  /** POST /api/conversations/:conversationId/read */
  async markRead(req: Request, res: Response): Promise<void> {
    await conversationService.markAsRead(
      req.params['conversationId']!,
      req.userId!,
    );
    sendSuccess(res, null, 'Marked as read');
  },
};
