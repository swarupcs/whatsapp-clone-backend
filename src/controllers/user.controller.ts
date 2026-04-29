/**
 * user.controller.ts — Refactored with asyncHandler + AppErrors.
 *
 * CHANGES:
 *  - uploadAvatar endpoint: accepts a single image file, uploads it to
 *    ImageKit (/swiftchat/avatars) and saves the returned CDN URL as the
 *    user's profile picture.
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
import { uploadAvatar } from '../helpers/upload.js';

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

  /**
   * POST /api/users/me/avatar
   *
   * Expects a multipart/form-data request with a single file field named
   * "avatar". The file is uploaded to ImageKit and the CDN URL is saved as
   * the user's profile picture.
   */
  uploadAvatar: asyncHandler(async (req: Request, res: Response) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) throw new BadRequestError('No avatar file provided');

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestError('Only image files are accepted for avatars');
    }

    const cdnUrl = await uploadAvatar(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    const updated = await userService.updateProfile(req.userId!, {
      picture: cdnUrl,
    });
    if (!updated) throw new NotFoundError('User');

    sendOk(res, updated, 'Avatar uploaded successfully');
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
