import type { Request, Response } from 'express';
import { userService } from '../services/user.service.js';
import { sendSuccess, sendError, sendNotFound } from '../helpers/index.js';
import {
  searchUsersSchema,
  updateProfileSchema,
  updateStatusSchema,
  safeParseBody,
} from '../helpers/validation.js';
import { getOnlineUserIds } from '../config/runtimeStore.js';

export const userController = {
  /** GET /api/users/search?q=... */
  async search(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(searchUsersSchema, req.query);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const results = await userService.searchUsers(parsed.data.q, req.userId!);
    sendSuccess(res, results);
  },

  /** GET /api/users/:userId */
  async getUser(req: Request, res: Response): Promise<void> {
    const user = await userService.getUserById(req.params['userId']!);
    if (!user) { sendNotFound(res, 'User'); return; }
    sendSuccess(res, user);
  },

  /** PATCH /api/users/me/profile */
  async updateProfile(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(updateProfileSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const updated = await userService.updateProfile(req.userId!, parsed.data);
    if (!updated) { sendNotFound(res, 'User'); return; }

    sendSuccess(res, updated, 'Profile updated');
  },

  /** PATCH /api/users/me/status */
  async updateStatus(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(updateStatusSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const updated = await userService.updateStatus(req.userId!, parsed.data.status);
    if (!updated) { sendNotFound(res, 'User'); return; }

    sendSuccess(res, updated, `Status updated to ${parsed.data.status}`);
  },

  /** GET /api/users/online */
  getOnlineUsers(_req: Request, res: Response): void {
    sendSuccess(res, getOnlineUserIds());
  },
};
