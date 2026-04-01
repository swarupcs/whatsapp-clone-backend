/**
 * response.ts — Structured, consistent API response helpers.
 *
 * Every API response follows one shape:
 *
 *  SUCCESS
 *  {
 *    "success": true,
 *    "statusCode": 200,
 *    "message": "...",        ← optional human-readable note
 *    "data": { ... },
 *    "meta": { ... }          ← optional pagination / extra context
 *  }
 *
 *  ERROR
 *  {
 *    "success": false,
 *    "statusCode": 400,
 *    "code": "VALIDATION_ERROR",
 *    "message": "...",
 *    "details": [ ... ]       ← only in development OR for validation errors
 *  }
 *
 * WHY: A consistent envelope means the client NEVER needs to guess the shape.
 * It also makes logging / monitoring far easier because every response has
 * a predictable structure.
 */

import type { Response } from 'express';
import { env } from '../config/env.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
  nextCursor?: string;
  [key: string]: unknown;
}

export interface SuccessPayload<T = unknown> {
  success: true;
  statusCode: number;
  message?: string;
  data: T;
  meta?: ApiMeta;
}

export interface ErrorPayload {
  success: false;
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  /** Request correlation id — set by requestId middleware */
  requestId?: string;
}

export type ApiResponse<T = unknown> = SuccessPayload<T> | ErrorPayload;

// ─── Success helpers ─────────────────────────────────────────────────────────

/**
 * Generic success — caller controls status code.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
  meta?: ApiMeta,
): void {
  const body: SuccessPayload<T> = { success: true, statusCode, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  res.status(statusCode).json(body);
}

/** 200 OK */
export function sendOk<T>(res: Response, data: T, message?: string, meta?: ApiMeta): void {
  sendSuccess(res, data, message, 200, meta);
}

/** 201 Created */
export function sendCreated<T>(res: Response, data: T, message?: string): void {
  sendSuccess(res, data, message, 201);
}

/** 204 No Content — data is null */
export function sendNoContent(res: Response): void {
  res.status(204).end();
}

// ─── Error helpers ────────────────────────────────────────────────────────────

/**
 * Core error responder — used internally by the global error handler.
 * Callers should throw AppError subclasses instead of calling this directly.
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
  requestId?: string,
): void {
  const body: ErrorPayload = { success: false, statusCode, code, message };

  // Only attach `details` for validation errors or in development
  if (details !== undefined && (statusCode === 400 || statusCode === 422 || env.isDev)) {
    body.details = details;
  }

  if (requestId) body.requestId = requestId;

  res.status(statusCode).json(body);
}
