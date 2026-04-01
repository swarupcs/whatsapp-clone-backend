/**
 * auth.controller.ts — Refactored with asyncHandler + AppErrors.
 *
 * BEFORE:  every method had its own try/catch.
 * AFTER:   no try/catch anywhere. asyncHandler catches every thrown error
 *          (AppError, ZodError, Mongoose error, etc.) and forwards it to the
 *          global error handler which produces a consistent response.
 *
 * Controller responsibilities:
 *   1. Parse + validate the request            → throws ValidationError on failure
 *   2. Call the service                        → returns data OR a discriminant string
 *   3. Map the service result to an HTTP response (success or throw an AppError)
 */

import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../errors/AppError.js';
import { sendOk, sendCreated } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  parseBody,
  loginSchema,
  registerSchema,
  refreshTokenSchema,
} from '../helpers/validation.js';

export const authController = {
  /** POST /api/auth/login */
  login: asyncHandler(async (req: Request, res: Response) => {
    const data = parseBody(loginSchema, req.body);

    const result = await authService.login(data);
    if (!result) throw new UnauthorizedError('Invalid email or password');

    sendOk(res, result, 'Login successful');
  }),

  /** POST /api/auth/register */
  register: asyncHandler(async (req: Request, res: Response) => {
    const data = parseBody(registerSchema, req.body);

    const result = await authService.register(data);
    if (result === 'email_taken') {
      throw new ConflictError('An account with this email already exists');
    }

    sendCreated(res, result, 'Account created successfully');
  }),

  /** POST /api/auth/refresh */
  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = parseBody(refreshTokenSchema, req.body);

    const tokens = await authService.refreshTokens(refreshToken);
    if (!tokens) throw new UnauthorizedError('Invalid or expired refresh token');

    sendOk(res, tokens, 'Tokens refreshed');
  }),

  /** POST /api/auth/logout */
  logout: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    await authService.logout(req.userId!, refreshToken);
    sendOk(res, null, 'Logged out successfully');
  }),

  /** GET /api/auth/me */
  me: asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.getMe(req.userId!);
    if (!user) throw new NotFoundError('User');

    sendOk(res, user);
  }),
};
