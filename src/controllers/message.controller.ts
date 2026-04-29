/**
 * message.controller.ts — Refactored with asyncHandler + AppErrors.
 *
 * FIXES applied:
 *  - pin/unpin now emit socket events to the conversation room so all members
 *    see the change in real time without a full refetch.
 *  - edit/delete now emit socket events so all members see the change.
 *  - globalSearch route is correctly protected and accessible.
 */

import type { Request, Response } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { messageService } from '../services/message.service.js';
import { conversationService } from '../services/conversation.service.js';
import {
  emitNewMessage,
  emitMessageEdited,
  emitMessageDeleted,
} from '../socket/index.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../errors/AppError.js';
import { sendOk, sendCreated } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  parseBody,
  editMessageSchema,
  addReactionSchema,
  forwardMessageSchema,
  paginationQuerySchema,
} from '../helpers/validation.js';
import { multerFileToAttachment } from '../helpers/upload.js';

// Socket event names for pin/unpin (mirrors what the frontend listens for)
const MESSAGE_PINNED = 'message_pinned';
const MESSAGE_UNPINNED = 'message_unpinned';
const REACTION_UPDATED = 'reaction_updated';
const MESSAGE_SEEN = 'message_seen';

export const messageController = {
  /** GET /api/conversations/:conversationId/messages */
  list: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = parseBody(paginationQuerySchema, req.query);
    const result = await messageService.getMessages(
      req.params['conversationId']!,
      page,
      limit,
    );

    sendOk(res, result, undefined, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    });
  }),

  /** GET /api/conversations/:conversationId/messages/search?q=... */
  search: asyncHandler(async (req: Request, res: Response) => {
    const q = String(req.query['q'] ?? '').trim();
    if (!q) throw new BadRequestError('Search query is required');

    const results = await messageService.searchMessages(
      req.params['conversationId']!,
      q,
    );
    sendOk(res, results);
  }),

  /**
   * GET /api/messages/search?q=...
   *
   * FIX: This handler is mounted at the top-level router as:
   *   router.get('/messages/search', requireAuth, messageController.globalSearch)
   * Make sure it appears BEFORE the conversation-scoped message router in
   * routes/index.ts so Express matches it before trying to treat "messages"
   * as a :conversationId param.
   */
  globalSearch: asyncHandler(async (req: Request, res: Response) => {
    const q = String(req.query['q'] ?? '').trim();
    if (q.length < 2)
      throw new BadRequestError('Search query must be at least 2 characters');

    const results = await messageService.globalSearch(req.userId!, q);
    sendOk(res, results);
  }),

  /** POST /api/conversations/:conversationId/messages */
  send: asyncHandler(async (req: Request, res: Response) => {
    const uploadedFiles =
      (req.files as Express.Multer.File[] | undefined) ?? [];
    const rawMessage = String(req.body?.['message'] ?? '').trim();

    if (!rawMessage && uploadedFiles.length === 0) {
      throw new BadRequestError(
        'Message text or at least one file is required',
      );
    }

    let replyTo: Parameters<typeof messageService.sendMessage>[4];
    if (req.body?.['replyTo']) {
      try {
        replyTo =
          typeof req.body['replyTo'] === 'string'
            ? JSON.parse(req.body['replyTo'])
            : req.body['replyTo'];
      } catch {
        throw new BadRequestError('Invalid replyTo format');
      }
    }

    // Upload each file to ImageKit (async — returns CDN URLs)
    const fileAttachments = await Promise.all(
      uploadedFiles.map((f) => multerFileToAttachment(f)),
    );

    const result = await messageService.sendMessage(
      req.params['conversationId']!,
      req.userId!,
      rawMessage,
      fileAttachments.length > 0 ? fileAttachments : undefined,
      replyTo,
    );

    if (result === 'conversation_not_found')
      throw new NotFoundError('Conversation');
    if (result === 'not_member')
      throw new ForbiddenError('You are not a member of this conversation');

    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const conv = await conversationService.getConversationById(
        result.conversationId,
        req.userId!,
      );
      if (conv) emitNewMessage(io, result.conversationId, result, conv);
    }

    sendCreated(res, result, 'Message sent');
  }),


  /** PATCH /api/conversations/:conversationId/messages/:messageId */
  edit: asyncHandler(async (req: Request, res: Response) => {
    const { message } = parseBody(editMessageSchema, req.body);

    const result = await messageService.editMessage(
      req.params['conversationId']!,
      req.params['messageId']!,
      req.userId!,
      message,
    );

    if (result === 'not_found') throw new NotFoundError('Message');
    if (result === 'not_owner')
      throw new ForbiddenError('You can only edit your own messages');
    if (result === 'deleted')
      throw new BadRequestError('Cannot edit a deleted message');

    // FIX: emit MESSAGE_EDITED to room so all members see the update instantly.
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      emitMessageEdited(io, req.params['conversationId']!, result);
    }

    sendOk(res, result, 'Message edited');
  }),

  /** DELETE /api/conversations/:conversationId/messages/:messageId */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const result = await messageService.deleteMessage(
      req.params['conversationId']!,
      req.params['messageId']!,
      req.userId!,
    );

    if (result === 'not_found') throw new NotFoundError('Message');
    if (result === 'not_owner')
      throw new ForbiddenError('You can only delete your own messages');

    // FIX: emit MESSAGE_DELETED to room so all members see the deletion.
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      emitMessageDeleted(io, req.params['conversationId']!, result.id);
    }

    sendOk(res, result, 'Message deleted');
  }),

  /** POST /api/conversations/:conversationId/messages/:messageId/reactions */
  toggleReaction: asyncHandler(async (req: Request, res: Response) => {
    const { emoji } = parseBody(addReactionSchema, req.body);

    const result = await messageService.toggleReaction(
      req.params['conversationId']!,
      req.params['messageId']!,
      req.userId!,
      emoji,
    );

    if (result === 'not_found') throw new NotFoundError('Message');
    if (result === 'deleted')
      throw new BadRequestError('Cannot react to a deleted message');

    // FIX: emit REACTION_UPDATED so all room members see the change.
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      io.to(req.params['conversationId']!).emit(REACTION_UPDATED, {
        conversationId: req.params['conversationId']!,
        messageId: result.id,
        reactions: result.reactions,
      });
    }

    sendOk(res, result);
  }),

  /**
   * POST /api/conversations/:conversationId/messages/:messageId/pin
   *
   * FIX: After persisting, emit MESSAGE_PINNED to the conversation room so
   * every member's PinnedMessagesBar updates in real time without a refetch.
   * The frontend SocketContext handler for 'message_pinned' calls
   * queryClient.invalidateQueries({ queryKey: messageKeys.pinned(convId) })
   * which re-fetches the pinned list for all connected clients.
   */
  pin: asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params['conversationId']!;
    const result = await messageService.pinMessage(
      conversationId,
      req.params['messageId']!,
      req.userId!,
    );

    if (result === 'not_found') throw new NotFoundError('Message');
    if (result === 'deleted')
      throw new BadRequestError('Cannot pin a deleted message');

    // FIX: broadcast so all room members see the pinned message bar update.
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      io.to(conversationId).emit(MESSAGE_PINNED, {
        conversationId,
        message: result,
      });
    }

    sendOk(res, result, 'Message pinned');
  }),

  /**
   * DELETE /api/conversations/:conversationId/messages/:messageId/pin
   *
   * FIX: Same as pin — emit MESSAGE_UNPINNED so the PinnedMessagesBar
   * disappears / updates for all connected group members instantly.
   */
  unpin: asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params['conversationId']!;
    const result = await messageService.unpinMessage(
      conversationId,
      req.params['messageId']!,
    );

    if (result === 'not_found') throw new NotFoundError('Message');
    if (result === 'deleted')
      throw new BadRequestError('Cannot unpin a deleted message');

    // FIX: broadcast so all room members see the bar update.
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      io.to(conversationId).emit(MESSAGE_UNPINNED, {
        conversationId,
        message: result,
      });
    }

    sendOk(res, result, 'Message unpinned');
  }),

  /** GET /api/conversations/:conversationId/messages/pinned */
  listPinned: asyncHandler(async (req: Request, res: Response) => {
    const pinned = await messageService.getPinnedMessages(
      req.params['conversationId']!,
    );
    sendOk(res, pinned);
  }),

  /** POST /api/conversations/:conversationId/messages/:messageId/forward */
  forward: asyncHandler(async (req: Request, res: Response) => {
    const { toConversationId } = parseBody(forwardMessageSchema, req.body);

    const result = await messageService.forwardMessage(
      req.params['messageId']!,
      req.params['conversationId']!,
      toConversationId,
      req.userId!,
    );

    if (result === 'not_found') throw new NotFoundError('Message');
    if (result === 'target_not_found')
      throw new NotFoundError('Target conversation');
    if (result === 'not_member')
      throw new ForbiddenError(
        'You are not a member of the target conversation',
      );

    // Emit new_message to the target conversation room so recipients see it.
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      const conv = await conversationService.getConversationById(
        toConversationId,
        req.userId!,
      );
      if (conv) emitNewMessage(io, toConversationId, result, conv);
    }

    sendCreated(res, result, 'Message forwarded');
  }),

  /** POST /api/conversations/:conversationId/messages/:messageId/seen */
  markSeen: asyncHandler(async (req: Request, res: Response) => {
    const conversationId = req.params['conversationId']!;
    const messageId = req.params['messageId']!;

    const updated = await messageService.markMessageSeen(
      conversationId,
      messageId,
      req.userId!,
    );

    if (!updated) throw new NotFoundError('Message');

    // FIX: emit MESSAGE_SEEN so the sender's read receipt updates instantly.
    const io = req.app.locals['io'] as SocketIOServer | undefined;
    if (io) {
      io.to(conversationId).emit(MESSAGE_SEEN, {
        conversationId,
        messageId,
        userId: req.userId!,
        seenBy: updated.seenBy,
      });
    }

    sendOk(res, updated);
  }),
};
