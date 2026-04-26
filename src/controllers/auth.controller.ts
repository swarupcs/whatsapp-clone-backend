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
  BadRequestError,
} from '../errors/AppError.js';
import { sendOk, sendCreated } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  parseBody,
  loginSchema,
  registerSchema,
} from '../helpers/validation.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

export const authController = {
  /** POST /api/auth/login */
  login: asyncHandler(async (req: Request, res: Response) => {
    const data = parseBody(loginSchema, req.body);

    const result = await authService.login(data);
    if (!result) throw new UnauthorizedError('Invalid email or password');

    const { tokens, user } = result;
    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);

    sendOk(res, { user, tokens: { accessToken: tokens.accessToken } }, 'Login successful');
  }),

  /** POST /api/auth/register */
  register: asyncHandler(async (req: Request, res: Response) => {
    const data = parseBody(registerSchema, req.body);

    const result = await authService.register(data);
    if (result === 'email_taken') {
      throw new ConflictError('An account with this email already exists');
    }

    const { tokens, user } = result as Exclude<typeof result, 'email_taken'>;
    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);

    sendCreated(res, { user, tokens: { accessToken: tokens.accessToken } }, 'Account created successfully');
  }),

  /** POST /api/auth/refresh */
  refresh: asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new BadRequestError('Refresh token missing from cookies');

    const tokens = await authService.refreshTokens(refreshToken);
    if (!tokens) {
      res.clearCookie('refreshToken');
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS);
    sendOk(res, { accessToken: tokens.accessToken }, 'Tokens refreshed');
  }),

  /** POST /api/auth/logout */
  logout: asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;
    await authService.logout(req.userId!, refreshToken);
    res.clearCookie('refreshToken');
    sendOk(res, null, 'Logged out successfully');
  }),

  /** GET /api/auth/me */
  me: asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.getMe(req.userId!);
    if (!user) throw new NotFoundError('User');

    sendOk(res, user);
  }),
};
