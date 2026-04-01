/**
 * auth.middleware.ts — Refactored with AppErrors + asyncHandler.
 *
 * Throwing AppErrors here is safe because:
 *   - For synchronous middleware (requireAuth), Express's error-handling chain
 *     is triggered when we call next(new AppError(...)).
 *   - For async middleware wrapped in asyncHandler, a throw is caught and
 *     forwarded to next() automatically.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  extractBearerToken,
  verifyAccessToken,
} from '../helpers/index.js';
import {
  UnauthorizedError,
  InvalidTokenError,
  ForbiddenError,
  NotFoundError,
} from '../errors/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';

// ─── Augment Express Request ──────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      requestId?: string;
    }
  }
}

// ─── requireAuth ──────────────────────────────────────────────────────────────
/**
 * Synchronous JWT guard. Calls next(err) on failure — compatible with Express
 * error-handling chain without needing asyncHandler.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    next(new UnauthorizedError('No authentication token provided'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    const jwtErr = err as { name?: string };

    if (jwtErr?.name === 'TokenExpiredError') {
      next(new InvalidTokenError('Access token has expired'));
    } else {
      next(new InvalidTokenError('Invalid access token'));
    }
  }
}

// ─── requireConversationMember ────────────────────────────────────────────────
/**
 * Async middleware — wrapped in asyncHandler so DB errors are forwarded to
 * the global error handler instead of crashing the request.
 */
export const requireConversationMember = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { conversationId } = req.params;
    const userId = req.userId!;

    const conv = await Conversation.findById(conversationId);

    if (!conv) throw new NotFoundError('Conversation');

    const isMember = conv.members.some((m) => m.toString() === userId);
    if (!isMember) throw new ForbiddenError('You are not a member of this conversation');

    next();
  },
);

// ─── requireMessageOwner ──────────────────────────────────────────────────────
/**
 * Async middleware — verifies the requesting user owns the target message.
 */
export const requireMessageOwner = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { conversationId, messageId } = req.params;
    const userId = req.userId!;

    const message = await Message.findOne({ _id: messageId, conversationId });

    if (!message) throw new NotFoundError('Message');

    if (message.senderId.toString() !== userId) {
      throw new ForbiddenError('You can only modify your own messages');
    }

    next();
  },
);
