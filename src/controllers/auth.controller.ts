import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendUnauthorized,
  sendConflict,
} from '../helpers/index.js';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  safeParseBody,
} from '../helpers/validation.js';

export const authController = {
  /** POST /api/auth/login */
  async login(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(loginSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const result = await authService.login(parsed.data);
    if (!result) { sendUnauthorized(res, 'Invalid email or password'); return; }

    sendSuccess(res, result, 'Login successful');
  },

  /** POST /api/auth/register */
  async register(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(registerSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const result = await authService.register(parsed.data);
    if (result === 'email_taken') { sendConflict(res, 'An account with this email already exists'); return; }

    sendCreated(res, result, 'Account created successfully');
  },

  /** POST /api/auth/refresh */
  async refresh(req: Request, res: Response): Promise<void> {
    const parsed = safeParseBody(refreshTokenSchema, req.body);
    if (!parsed.success) { sendError(res, parsed.error); return; }

    const tokens = await authService.refreshTokens(parsed.data.refreshToken);
    if (!tokens) { sendUnauthorized(res, 'Invalid or expired refresh token'); return; }

    sendSuccess(res, tokens, 'Tokens refreshed');
  },

  /** POST /api/auth/logout */
  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body as { refreshToken?: string };
    await authService.logout(req.userId!, refreshToken);
    sendSuccess(res, null, 'Logged out successfully');
  },

  /** GET /api/auth/me */
  async me(req: Request, res: Response): Promise<void> {
    const user = await authService.getMe(req.userId!);
    if (!user) { sendUnauthorized(res, 'User not found'); return; }
    sendSuccess(res, user);
  },
};
