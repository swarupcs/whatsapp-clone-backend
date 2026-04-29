import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../helpers/upload.js';

const router = Router();

router.use(requireAuth);

router.get('/search', userController.search);
router.get('/online', userController.getOnlineUsers);
router.get('/:userId', userController.getUser);

router.patch('/me/profile', userController.updateProfile);
router.patch('/me/status', userController.updateStatus);

/**
 * POST /api/users/me/avatar
 * Upload a profile picture to ImageKit.
 * Accepts: multipart/form-data, field name "avatar", single image file.
 */
router.post(
  '/me/avatar',
  upload.single('avatar'),
  userController.uploadAvatar,
);

export default router;
