import { Router } from 'express';
import { messageController } from '../controllers/message.controller.js';
import { requireAuth, requireConversationMember } from '../middleware/auth.js';
import { upload } from '../helpers/upload.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireConversationMember);

router.get('/', messageController.list);
router.get('/search', messageController.search);
router.get('/pinned', messageController.listPinned);

router.post('/', upload.array('files', 10), messageController.send);

router.patch('/:messageId', messageController.edit);
router.delete('/:messageId', messageController.delete);

router.post('/:messageId/reactions', messageController.toggleReaction);

router.post('/:messageId/pin', messageController.pin);
router.delete('/:messageId/pin', messageController.unpin);

router.post('/:messageId/forward', messageController.forward);
router.post('/:messageId/seen', messageController.markSeen);

export default router;
