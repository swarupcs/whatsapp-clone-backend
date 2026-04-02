import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller.js';
import { requireAuth, requireConversationMember } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', conversationController.list);
router.post('/', conversationController.createDirect);
router.post('/group', conversationController.createGroup);

router.get(
  '/:conversationId',
  requireConversationMember,
  conversationController.getOne,
);
router.post(
  '/:conversationId/read',
  requireConversationMember,
  conversationController.markRead,
);

router.post(
  '/:conversationId/members',
  requireConversationMember,
  conversationController.addMember,
);
router.delete(
  '/:conversationId/members/:userId',
  requireConversationMember,
  conversationController.removeMember,
);

// Leave group — any member can leave themselves
router.post(
  '/:conversationId/leave',
  requireConversationMember,
  conversationController.leaveGroup,
);

export default router;
