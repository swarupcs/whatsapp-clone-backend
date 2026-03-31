import type { Request, Response, NextFunction } from 'express';
import {
  extractBearerToken,
  verifyAccessToken,
  sendUnauthorized,
  sendForbidden,
} from '../helpers/index.js';
import { userService } from '../services/user.service.js';
import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';

// ─── Augment Express Request ──────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

// ─── requireAuth ──────────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    sendUnauthorized(res, 'No token provided');
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch {
    sendUnauthorized(res, 'Invalid or expired token');
  }
}

// ─── requireConversationMember ────────────────────────────────────────────────

export async function requireConversationMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { conversationId } = req.params;
  const userId = req.userId!;

  try {
    const conv = await Conversation.findById(conversationId);

    if (!conv) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    const isMember = conv.members.some((m) => m.toString() === userId);
    if (!isMember) {
      sendForbidden(res, 'You are not a member of this conversation');
      return;
    }

    next();
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ─── requireMessageOwner ──────────────────────────────────────────────────────

export async function requireMessageOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { conversationId, messageId } = req.params;
  const userId = req.userId!;

  try {
    const message = await Message.findOne({ _id: messageId, conversationId });

    if (!message) {
      res.status(404).json({ success: false, error: 'Message not found' });
      return;
    }

    if (message.senderId.toString() !== userId) {
      sendForbidden(res, 'You can only modify your own messages');
      return;
    }

    next();
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
