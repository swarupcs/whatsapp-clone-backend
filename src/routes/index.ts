/**
 * routes/index.ts
 *
 * FIX: The global message search route GET /messages/search MUST be registered
 * before the conversation-scoped message routes. Express matches routes in
 * registration order, and the conversation router uses mergeParams which means
 * a request to /api/messages/search would be caught by the /api/conversations
 * prefix ONLY if Express tries to match ":conversationId" = "messages" first.
 *
 * Registering the standalone /messages/search BEFORE the conversation routes
 * ensures it short-circuits correctly.
 */

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import conversationRoutes from './conversation.routes.js';
import messageRoutes from './message.routes.js';
import { messageController } from '../controllers/message.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Health check — no auth required
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    },
  });
});

// Auth routes
router.use('/auth', authRoutes);

// User routes
router.use('/users', userRoutes);

// FIX: Register the global message search BEFORE the conversation-scoped
// message subrouter. Without this ordering, a GET /api/messages/search request
// would fall through to the conversation router where Express would interpret
// "messages" as a :conversationId value, causing a 404 or wrong response.
router.get('/messages/search', requireAuth, messageController.globalSearch);

// Conversation routes (includes the /conversations/:id sub-resources)
router.use('/conversations', conversationRoutes);

// Conversation-scoped message routes
// mergeParams: true is set in message.routes.ts so :conversationId is visible
router.use('/conversations/:conversationId/messages', messageRoutes);

export default router;
