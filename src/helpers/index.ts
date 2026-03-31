import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type {
  ApiSuccess,
  ApiError,
  AuthTokenPayload,
  AuthTokens,
  PaginatedResponse,
  PublicUser,
} from '../types/index.js';
import { env } from '../config/env.js';
import type { IUserDocument } from '../models/user.model.js';

// ─── Response Helpers ─────────────────────────────────────────────────────────

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode = 200): void {
  const body: ApiSuccess<T> = { success: true, data, message };
  res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T, message?: string): void {
  sendSuccess(res, data, message, 201);
}

export function sendError(res: Response, error: string, statusCode = 400, details?: unknown): void {
  const body: ApiError = { success: false, error, details };
  res.status(statusCode).json(body);
}

export function sendUnauthorized(res: Response, message = 'Unauthorized'): void {
  sendError(res, message, 401);
}

export function sendForbidden(res: Response, message = 'Forbidden'): void {
  sendError(res, message, 403);
}

export function sendNotFound(res: Response, resource = 'Resource'): void {
  sendError(res, `${resource} not found`, 404);
}

export function sendConflict(res: Response, message: string): void {
  sendError(res, message, 409);
}

export function sendInternalError(res: Response, message = 'Internal server error'): void {
  sendError(res, message, 500);
}

// ─── JWT Helpers ──────────────────────────────────────────────────────────────

export function signAccessToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwt.secret) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as AuthTokenPayload;
}

export function generateTokenPair(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>): AuthTokens {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/** Parse the refresh token's expiry for TTL storage */
export function getRefreshTokenExpiry(): Date {
  const duration = env.jwt.refreshExpiresIn; // e.g. "30d"
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const num = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return new Date(Date.now() + num * (multipliers[unit] ?? 86400000));
}

// ─── Password Helpers ─────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── Pagination Helpers ───────────────────────────────────────────────────────

export function paginateArray<T extends { createdAt: Date }>(
  items: T[],
  page: number,
  limit: number,
  order: 'asc' | 'desc' = 'desc',
): PaginatedResponse<T> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;

  const sorted = [...items].sort((a, b) =>
    order === 'desc'
      ? b.createdAt.getTime() - a.createdAt.getTime()
      : a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const total = sorted.length;
  const data = sorted.slice(offset, offset + safeLimit);
  const hasMore = offset + safeLimit < total;

  return {
    data,
    total,
    page: safePage,
    limit: safeLimit,
    hasMore,
    nextCursor: hasMore ? String(safePage + 1) : undefined,
  };
}

// ─── User Helpers ─────────────────────────────────────────────────────────────

export function docToPublicUser(user: IUserDocument): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    picture: user.picture,
    status: user.status,
    about: user.about,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ─── String Helpers ───────────────────────────────────────────────────────────

export function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

export function nowDate(): Date {
  return new Date();
}
