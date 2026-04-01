/**
 * user.controller.ts — Refactored with asyncHandler + AppErrors.
 */

import type { Request, Response } from 'express';
import { userService } from '../services/user.service.js';
import { NotFoundError, BadRequestError } from '../errors/AppError.js';
import { sendOk } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  parseBody,
  searchUsersSchema,
  updateProfileSchema,
  updateStatusSchema,
} from '../helpers/validation.js';
import { getOnlineUserIds } from '../config/runtimeStore.js';

export const userController = {
  /** GET /api/users/search?q=... */
  search: asyncHandler(async (req: Request, res: Response) => {
    const { q } = parseBody(searchUsersSchema, req.query);
    const results = await userService.searchUsers(q, req.userId!);
    sendOk(res, results);
  }),

  /** GET /api/users/:userId */
  getUser: asyncHandler(async (req: Request, res: Response) => {
    const user = await userService.getUserById(req.params['userId']!);
    if (!user) throw new NotFoundError('User');
    sendOk(res, user);
  }),

  /** PATCH /api/users/me/profile */
  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const data = parseBody(updateProfileSchema, req.body);
    const updated = await userService.updateProfile(req.userId!, data);
    if (!updated) throw new NotFoundError('User');
    sendOk(res, updated, 'Profile updated');
  }),

  /** PATCH /api/users/me/status */
  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const { status } = parseBody(updateStatusSchema, req.body);
    const updated = await userService.updateStatus(req.userId!, status);
    if (!updated) throw new NotFoundError('User');
    sendOk(res, updated, `Status updated to ${status}`);
  }),

  /** GET /api/users/online */
  getOnlineUsers: asyncHandler(async (_req: Request, res: Response) => {
    sendOk(res, getOnlineUserIds());
  }),
};
