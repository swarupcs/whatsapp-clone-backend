import type { Request, Response } from 'express';
import { messageService } from '../services/message.service.js';
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
} from '../helpers/index.js';
import {
  editMessageSchema,
  addReactionSchema,
  forwardMessageSchema,
  paginationQuerySchema,
  safeParseBody,
} from '../helpers/validation.js';
import { multerFileToAttachment } from '../helpers/upload.js';
import type { Server as SocketIOServer } from 'socket.io';
import { conversationService } from '../services/conversation.service.js';
import { emitNewMessage } from '../socket/index.js';

export const messageController = {
  /** GET /api/conversations/:conversationId/messages */
  async list(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(paginationQuerySchema, req.query);
    const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 30 };

    const result = await messageService.getMessages(req.params['conversationId']!, page, limit);
    sendSuccess(res, result);
  },

  /** GET /api/conversations/:conversationId/messages/search?q=... */
  async search(req: Request, res: Response): Promise<void> {
    const q = String(req.query['q'] ?? '').trim();
    if (!q) { sendError(res, 'Search query is required'); return; }

    const results = await messageService.searchMessages(req.params['conversationId']!, q);
    sendSuccess(res, results);
  },

  /** GET /api/messages/search?q=... */
  async globalSearch(req: Request, res: Response): Promise<void> {
    const q = String(req.query['q'] ?? '').trim();
    if (q.length < 2) { sendError(res, 'Search query must be at least 2 characters'); return; }

    const results = await messageService.globalSearch(req.userId!, q);
    sendSuccess(res, results);
  },

  /** POST /api/conversations/:conversationId/messages */
  async send(req: Request, res: Response): Promise<void> {
    const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
    const rawMessage = String(req.body?.['message'] ?? '').trim();

    if (!rawMessage && uploadedFiles.length === 0) {
      sendError(res, 'Message text or at least one file is required');
      return;
    }

    let replyTo: Parameters<typeof messageService.sendMessage>[4];
    if (req.body?.['replyTo']) {
      try {
        replyTo =
          typeof req.body['replyTo'] === 'string'
            ? JSON.parse(req.body['replyTo'])
            : req.body['replyTo'];
      } catch {
        sendError(res, 'Invalid replyTo format');
        return;
      }
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileAttachments = uploadedFiles.map((f) => multerFileToAttachment(f, baseUrl));

    const result = await messageService.sendMessage(
      req.params['conversationId']!,
      req.userId!,
      rawMessage,
      fileAttachments.length > 0 ? fileAttachments : undefined,
      replyTo,
    );

    if (result === 'conversation_not_found') { sendNotFound(res, 'Conversation'); return; }
    if (result === 'not_member') { sendForbidden(res, 'You are not a member of this conversation'); return; }

    // Broadcast via Socket.IO before sending HTTP response
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const conv = await conversationService.getConversationById(result.conversationId, req.userId!);
      if (conv) {
        emitNewMessage(io, result.conversationId, result, conv);
      }
    }

    sendCreated(res, result, 'Message sent');
  },

  /** PATCH /api/conversations/:conversationId/messages/:messageId */
  async edit(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(editMessageSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const result = await messageService.editMessage(
      req.params['conversationId']!,
      req.params['messageId']!,
      req.userId!,
      parsed.data.message,
    );

    if (result === 'not_found') { sendNotFound(res, 'Message'); return; }
    if (result === 'not_owner') { sendForbidden(res, 'You can only edit your own messages'); return; }
    if (result === 'deleted') { sendError(res, 'Cannot edit a deleted message'); return; }

    sendSuccess(res, result, 'Message edited');
  },

  /** DELETE /api/conversations/:conversationId/messages/:messageId */
  async delete(req: Request, res: Response): Promise<void> {
    const result = await messageService.deleteMessage(
      req.params['conversationId']!,
      req.params['messageId']!,
      req.userId!,
    );

    if (result === 'not_found') { sendNotFound(res, 'Message'); return; }
    if (result === 'not_owner') { sendForbidden(res, 'You can only delete your own messages'); return; }

    sendSuccess(res, result, 'Message deleted');
  },

  /** POST /api/conversations/:conversationId/messages/:messageId/reactions */
  async toggleReaction(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(addReactionSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const result = await messageService.toggleReaction(
      req.params['conversationId']!,
      req.params['messageId']!,
      req.userId!,
      parsed.data.emoji,
    );

    if (result === 'not_found') { sendNotFound(res, 'Message'); return; }
    if (result === 'deleted') { sendError(res, 'Cannot react to a deleted message'); return; }

    sendSuccess(res, result);
  },

  /** POST /api/conversations/:conversationId/messages/:messageId/pin */
  async pin(req: Request, res: Response): Promise<void> {
    const result = await messageService.pinMessage(
      req.params['conversationId']!,
      req.params['messageId']!,
      req.userId!,
    );

    if (result === 'not_found') { sendNotFound(res, 'Message'); return; }
    if (result === 'deleted') { sendError(res, 'Cannot pin a deleted message'); return; }

    sendSuccess(res, result, 'Message pinned');
  },

  /** DELETE /api/conversations/:conversationId/messages/:messageId/pin */
  async unpin(req: Request, res: Response): Promise<void> {
    const result = await messageService.unpinMessage(
      req.params['conversationId']!,
      req.params['messageId']!,
    );

    if (result === 'not_found') { sendNotFound(res, 'Message'); return; }
    if (result === 'deleted') { sendError(res, 'Cannot unpin a deleted message'); return; }

    sendSuccess(res, result, 'Message unpinned');
  },

  /** GET /api/conversations/:conversationId/messages/pinned */
  async listPinned(req: Request, res: Response): Promise<void> {
    const pinned = await messageService.getPinnedMessages(req.params['conversationId']!);
    sendSuccess(res, pinned);
  },

  /** POST /api/conversations/:conversationId/messages/:messageId/forward */
  async forward(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(forwardMessageSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const result = await messageService.forwardMessage(
      req.params['messageId']!,
      req.params['conversationId']!,
      parsed.data.toConversationId,
      req.userId!,
    );

    if (result === 'not_found') { sendNotFound(res, 'Message'); return; }
    if (result === 'target_not_found') { sendNotFound(res, 'Target conversation'); return; }
    if (result === 'not_member') { sendForbidden(res, 'You are not a member of the target conversation'); return; }

    sendCreated(res, result, 'Message forwarded');
  },

  /** POST /api/conversations/:conversationId/messages/:messageId/seen */
  async markSeen(req: Request, res: Response): Promise<void> {
    const updated = await messageService.markMessageSeen(
      req.params['conversationId']!,
      req.params['messageId']!,
      req.userId!,
    );

    if (!updated) { sendNotFound(res, 'Message'); return; }
    sendSuccess(res, updated);
  },
};
