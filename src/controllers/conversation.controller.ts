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

export const conversationController = {
  /** GET /api/conversations */
  async list(req: Request, res: Response): Promise<void> {
    const conversations = await conversationService.getConversationsForUser(req.userId!);
    sendSuccess(res, conversations);
  },

  /** GET /api/conversations/:conversationId */
  async getOne(req: Request, res: Response): Promise<void> {
    const conv = await conversationService.getConversationById(
      req.params['conversationId']!,
      req.userId!,
    );
    if (!conv) { sendNotFound(res, 'Conversation'); return; }
    sendSuccess(res, conv);
  },

  /** POST /api/conversations */
  async createDirect(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(createConversationSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const result = await conversationService.findOrCreateDirect(req.userId!, parsed.data);
    if (result === 'user_not_found') { sendNotFound(res, 'User'); return; }
    if (result === 'cannot_self') { sendError(res, 'You cannot start a conversation with yourself'); return; }

    sendCreated(res, result, 'Conversation ready');
  },

  /** POST /api/conversations/group */
  async createGroup(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(createGroupSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const result = await conversationService.createGroup(req.userId!, parsed.data);
    if (result === 'invalid_members') {
      sendError(res, 'One or more specified users do not exist, or group must have at least 2 other members');
      return;
    }

    sendCreated(res, result, 'Group created');
  },

  /** POST /api/conversations/:conversationId/members */
  async addMember(req: Request, res: Response): Promise<void> {
    const { userId } = req.body as { userId?: string };
    if (!userId) { sendError(res, 'userId is required'); return; }

    const result = await conversationService.addGroupMember(
      req.params['conversationId']!,
      req.userId!,
      userId,
    );

    if (result === 'not_found') { sendNotFound(res, 'Conversation'); return; }
    if (result === 'not_group') { sendError(res, 'This is not a group conversation'); return; }
    if (result === 'not_admin') { sendForbidden(res, 'Only the group admin can add members'); return; }
    if (result === 'already_member') { sendError(res, 'User is already a member of this group'); return; }
    if (result === 'user_not_found') { sendNotFound(res, 'User'); return; }

    sendSuccess(res, result, 'Member added');
  },

  /** DELETE /api/conversations/:conversationId/members/:userId */
  async removeMember(req: Request, res: Response): Promise<void> {
    const result = await conversationService.removeGroupMember(
      req.params['conversationId']!,
      req.userId!,
      req.params['userId']!,
    );

    if (result === 'not_found') { sendNotFound(res, 'Conversation'); return; }
    if (result === 'not_group') { sendError(res, 'This is not a group conversation'); return; }
    if (result === 'not_admin') { sendForbidden(res, 'Only the admin can remove members'); return; }
    if (result === 'not_member') { sendNotFound(res, 'Member'); return; }

    sendSuccess(res, result, 'Member removed');
  },

  /** POST /api/conversations/:conversationId/read */
  async markRead(req: Request, res: Response): Promise<void> {
    await conversationService.markAsRead(req.params['conversationId']!, req.userId!);
    sendSuccess(res, null, 'Marked as read');
  },
};
