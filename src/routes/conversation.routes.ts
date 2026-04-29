import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller.js';
import { requireAuth, requireConversationMember } from '../middleware/auth.js';
import { upload } from '../helpers/upload.js';

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
router.patch(
  '/:conversationId',
  requireConversationMember,
  conversationController.updateGroup,
);
router.post(
  '/:conversationId/read',
  requireConversationMember,
  conversationController.markRead,
);

/**
 * POST /api/conversations/:conversationId/picture
 * Upload a group avatar image to ImageKit CDN.
 * Field name: "picture", single image file.
 */
router.post(
  '/:conversationId/picture',
  requireConversationMember,
  upload.single('picture'),
  conversationController.uploadGroupPicture,
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

