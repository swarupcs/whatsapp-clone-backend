import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/search', userController.search);
router.get('/online', userController.getOnlineUsers);
router.get('/:userId', userController.getUser);
router.patch('/me/profile', userController.updateProfile);
router.patch('/me/status', userController.updateStatus);

export default router;
