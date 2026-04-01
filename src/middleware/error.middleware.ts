/**
 * error.middleware.ts — Global error handling middleware.
 *
 * This file is the SINGLE place where all errors in the application are
 * caught, classified, logged, and transformed into a consistent HTTP
 * response. It handles:
 *
 *   1. Our own AppError subclasses           → use their statusCode / code
 *   2. Mongoose errors                        → map to appropriate HTTP codes
 *   3. Zod validation errors                  → 400 with field details
 *   4. JWT errors                             → 401
 *   5. Multer upload errors                   → 400/413
 *   6. Express body-parser errors             → 400
 *   7. Unknown / programming errors           → 500 (generic message to client)
 *
 * THE GOLDEN RULE: never let a request hang. Every code path in this handler
 * must call res.json() (via sendErrorResponse) exactly once.
 */

import type { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { AppError } from '../errors/AppError.js';
import { sendErrorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// ─── Request logger ───────────────────────────────────────────────────────────

export const requestLogger = morgan(env.isDev ? 'dev' : 'combined');

// ─── Request ID middleware ────────────────────────────────────────────────────
/**
 * Attaches a unique ID to every request so that logs and error responses can
 * be correlated. The ID comes from the upstream proxy header if present,
 * otherwise a simple timestamp+random combination.
 */
export function attachRequestId(req: Request, _res: Response, next: NextFunction): void {
  req.requestId =
    (req.headers['x-request-id'] as string | undefined) ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  next();
}

// ─── 404 handler ─────────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  sendErrorResponse(
    res,
    404,
    'NOT_FOUND',
    `Route ${req.method} ${req.path} not found`,
    undefined,
    req.requestId,
  );
}

// ─── Global error handler ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction, // must be declared even if unused — Express uses arity
): void {
  // ── 1. Our own operational errors ──────────────────────────────────────────
  if (err instanceof AppError) {
    // Operational errors are expected — log at warn unless it's a 5xx
    if (err.statusCode >= 500) {
      logger.error(err, { requestId: req.requestId, path: req.path });
    } else {
      logger.warn(err.message, {
        code: err.code,
        statusCode: err.statusCode,
        path: req.path,
        requestId: req.requestId,
      });
    }

    sendErrorResponse(
      res,
      err.statusCode,
      err.code,
      // For non-operational 5xx errors, never leak internal details to client
      err.isOperational ? err.message : 'An unexpected error occurred',
      err.details,
      req.requestId,
    );
    return;
  }

  // ── 2. Zod validation errors ───────────────────────────────────────────────
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    logger.warn('Validation failed', {
      path: req.path,
      requestId: req.requestId,
      issues: details,
    });

    sendErrorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      details,
      req.requestId,
    );
    return;
  }

  // ── 3. Mongoose errors ─────────────────────────────────────────────────────
  if (err instanceof mongoose.Error.CastError) {
    logger.warn('Invalid ObjectId', { path: req.path, requestId: req.requestId });
    sendErrorResponse(res, 400, 'INVALID_ID', 'Invalid ID format', undefined, req.requestId);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    logger.warn('Mongoose validation error', { path: req.path, requestId: req.requestId });
    sendErrorResponse(res, 400, 'VALIDATION_ERROR', err.message, details, req.requestId);
    return;
  }

  // Mongoose duplicate key (code 11000)
  const mongoErr = err as { code?: number; keyValue?: Record<string, unknown> };
  if (mongoErr?.code === 11000) {
    const field = Object.keys(mongoErr.keyValue ?? {})[0] ?? 'field';
    logger.warn('Duplicate key error', {
      field,
      path: req.path,
      requestId: req.requestId,
    });
    sendErrorResponse(
      res,
      409,
      'DUPLICATE_KEY',
      `A record with that ${field} already exists`,
      undefined,
      req.requestId,
    );
    return;
  }

  // ── 4. JWT errors ──────────────────────────────────────────────────────────
  const jwtErr = err as { name?: string; message?: string };
  if (jwtErr?.name === 'JsonWebTokenError') {
    sendErrorResponse(res, 401, 'INVALID_TOKEN', 'Invalid token', undefined, req.requestId);
    return;
  }

  if (jwtErr?.name === 'TokenExpiredError') {
    sendErrorResponse(res, 401, 'TOKEN_EXPIRED', 'Token has expired', undefined, req.requestId);
    return;
  }

  if (jwtErr?.name === 'NotBeforeError') {
    sendErrorResponse(res, 401, 'TOKEN_NOT_ACTIVE', 'Token is not yet active', undefined, req.requestId);
    return;
  }

  // ── 5. Multer upload errors ────────────────────────────────────────────────
  if (err instanceof MulterError) {
    const errorMap: Record<string, { statusCode: number; message: string }> = {
      LIMIT_FILE_SIZE: {
        statusCode: 413,
        message: `File is too large. Maximum size is ${env.upload.maxFileSizeMb}MB`,
      },
      LIMIT_FILE_COUNT: {
        statusCode: 400,
        message: 'Too many files. Maximum is 10 files per upload',
      },
      LIMIT_UNEXPECTED_FILE: {
        statusCode: 400,
        message: 'Unexpected file field name',
      },
      LIMIT_PART_COUNT: {
        statusCode: 400,
        message: 'Too many form parts',
      },
    };

    const mapped = errorMap[err.code];
    if (mapped) {
      sendErrorResponse(res, mapped.statusCode, err.code, mapped.message, undefined, req.requestId);
      return;
    }

    sendErrorResponse(res, 400, 'UPLOAD_ERROR', err.message, undefined, req.requestId);
    return;
  }

  // Multer file-type rejection (comes as a plain Error with a specific message)
  const plainErr = err as { message?: string };
  if (typeof plainErr?.message === 'string' && plainErr.message.startsWith('File type')) {
    sendErrorResponse(res, 400, 'UNSUPPORTED_FILE_TYPE', plainErr.message, undefined, req.requestId);
    return;
  }

  // ── 6. Express body-parser / JSON parse errors ────────────────────────────
  if (
    typeof plainErr?.message === 'string' &&
    (plainErr.message.includes('JSON') ||
      (err as { type?: string })?.type === 'entity.parse.failed')
  ) {
    sendErrorResponse(res, 400, 'INVALID_JSON', 'Request body contains invalid JSON', undefined, req.requestId);
    return;
  }

  // ── 7. Unknown / programming errors ───────────────────────────────────────
  // ALWAYS log the full error for debugging. NEVER expose internals to client.
  logger.error(err instanceof Error ? err : new Error(String(err)), {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });

  // In development, surface the real message to speed up debugging
  const message = env.isDev && err instanceof Error
    ? err.message
    : 'An unexpected error occurred. Please try again later.';

  sendErrorResponse(res, 500, 'INTERNAL_SERVER_ERROR', message, undefined, req.requestId);
}

// ─── Content-Type guard ───────────────────────────────────────────────────────

/**
 * Reject non-JSON requests on mutation endpoints (POST, PUT, PATCH).
 * multipart/form-data is allowed for file uploads.
 */
export function requireJsonBody(req: Request, res: Response, next: NextFunction): void {
  const skipMethods = ['GET', 'DELETE', 'HEAD', 'OPTIONS'];
  if (skipMethods.includes(req.method)) {
    next();
    return;
  }

  if (req.is('application/json') || req.is('multipart/form-data')) {
    next();
    return;
  }

  sendErrorResponse(
    res,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    'Content-Type must be application/json or multipart/form-data',
    undefined,
    req.requestId,
  );
}
