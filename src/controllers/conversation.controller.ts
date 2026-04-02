/**
 * conversation.controller.ts — Refactored with asyncHandler + AppErrors.
 */

import type { Request, Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { conversationService } from '../services/conversation.service.js';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../errors/AppError.js';
import { sendOk, sendCreated } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  parseBody,
  createConversationSchema,
  createGroupSchema,
} from '../helpers/validation.js';
import { getSocketsForUser } from '../config/runtimeStore.js';

export const conversationController = {
  /** GET /api/conversations */
  list: asyncHandler(async (req: Request, res: Response) => {
    const conversations = await conversationService.getConversationsForUser(
      req.userId!,
    );
    sendOk(res, conversations);
  }),

  /** GET /api/conversations/:conversationId */
  getOne: asyncHandler(async (req: Request, res: Response) => {
    const conv = await conversationService.getConversationById(
      req.params['conversationId']!,
      req.userId!,
    );
    if (!conv) throw new NotFoundError('Conversation');
    sendOk(res, conv);
  }),

  /** POST /api/conversations */
  createDirect: asyncHandler(async (req: Request, res: Response) => {
    const data = parseBody(createConversationSchema, req.body);

    const result = await conversationService.findOrCreateDirect(
      req.userId!,
      data,
    );

    if (result === 'user_not_found') throw new NotFoundError('User');
    if (result === 'cannot_self')
      throw new BadRequestError(
        'You cannot start a conversation with yourself',
      );

    sendCreated(res, result, 'Conversation ready');

    // Join both users' sockets to the new DM room
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const roomId = result.id;
      getSocketsForUser(req.userId!).forEach((sid) =>
        io.sockets.sockets.get(sid)?.join(roomId),
      );
      getSocketsForUser(data.userId).forEach((sid) =>
        io.sockets.sockets.get(sid)?.join(roomId),
      );
    }
  }),

  /** POST /api/conversations/group */
  createGroup: asyncHandler(async (req: Request, res: Response) => {
    const data = parseBody(createGroupSchema, req.body);

    const result = await conversationService.createGroup(req.userId!, data);

    if (result === 'invalid_members') {
      throw new BadRequestError(
        'One or more specified users do not exist, or group must have at least 2 other members',
      );
    }

    sendCreated(res, result, 'Group created');

    // Join all members' sockets to the new group room
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      result.users.forEach((member) => {
        getSocketsForUser(member.id).forEach((sid) =>
          io.sockets.sockets.get(sid)?.join(result.id),
        );
      });
    }
  }),

  /** POST /api/conversations/:conversationId/members */
  addMember: asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new BadRequestError('userId is required');

    const result = await conversationService.addGroupMember(
      req.params['conversationId']!,
      req.userId!,
      userId,
    );

    if (result === 'not_found') throw new NotFoundError('Conversation');
    if (result === 'not_group')
      throw new BadRequestError('This is not a group conversation');
    if (result === 'not_admin')
      throw new ForbiddenError('Only the group admin can add members');
    if (result === 'already_member')
      throw new BadRequestError('User is already a member of this group');
    if (result === 'user_not_found') throw new NotFoundError('User');

    sendOk(res, result, 'Member added');

    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const roomId = req.params['conversationId']!;
      getSocketsForUser(userId).forEach((sid) =>
        io.sockets.sockets.get(sid)?.join(roomId),
      );
      io.to(roomId).emit('member_added', {
        conversationId: roomId,
        userId,
        conversation: result,
      });
    }
  }),

  /** DELETE /api/conversations/:conversationId/members/:userId */
  removeMember: asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params['conversationId']!;
    const targetUserId = req.params['userId']!;

    // Prevent self-removal via this endpoint — use /leave instead
    if (targetUserId === req.userId) {
      throw new BadRequestError('Use POST /leave to leave a group yourself');
    }

    const result = await conversationService.removeGroupMember(
      conversationId,
      req.userId!,
      targetUserId,
    );

    if (result === 'not_found') throw new NotFoundError('Conversation');
    if (result === 'not_group')
      throw new BadRequestError('This is not a group conversation');
    if (result === 'not_admin')
      throw new ForbiddenError('Only the admin can remove members');
    if (result === 'not_member') throw new NotFoundError('Member');

    sendOk(res, result, 'Member removed');

    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      getSocketsForUser(targetUserId).forEach((sid) =>
        io.sockets.sockets.get(sid)?.leave(conversationId),
      );
      io.to(conversationId).emit('member_removed', {
        conversationId,
        userId: targetUserId,
        conversation: result,
      });
      getSocketsForUser(targetUserId).forEach((sid) =>
        io.to(sid).emit('removed_from_group', { conversationId }),
      );
    }
  }),

  /**
   * POST /api/conversations/:conversationId/leave
   * Any member can leave a group conversation.
   * If the leaving user is the admin and others remain, admin is transferred
   * to the next member. If they are the last member, the conversation is deleted.
   */
  leaveGroup: asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params['conversationId']!;
    const userId = req.userId!;

    const result = await conversationService.leaveGroup(conversationId, userId);

    if (result === 'not_found') throw new NotFoundError('Conversation');
    if (result === 'not_group')
      throw new BadRequestError('You can only leave group conversations');
    if (result === 'not_member')
      throw new ForbiddenError('You are not a member of this conversation');

    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      // Remove the leaving user from the socket room
      getSocketsForUser(userId).forEach((sid) =>
        io.sockets.sockets.get(sid)?.leave(conversationId),
      );

      if (result === 'deleted') {
        // Last member left — conversation is gone
        getSocketsForUser(userId).forEach((sid) =>
          io.to(sid).emit('removed_from_group', { conversationId }),
        );
      } else {
        // Notify remaining members of the updated conversation
        io.to(conversationId).emit('member_removed', {
          conversationId,
          userId,
          conversation: result,
        });
        // Notify the leaving user so their sidebar updates
        getSocketsForUser(userId).forEach((sid) =>
          io.to(sid).emit('removed_from_group', { conversationId }),
        );
      }
    }

    sendOk(res, null, 'You have left the group');
  }),

  /** POST /api/conversations/:conversationId/read */
  markRead: asyncHandler(async (req: Request, res: Response) => {
    await conversationService.markAsRead(
      req.params['conversationId']!,
      req.userId!,
    );
    sendOk(res, null, 'Marked as read');
  }),
};
