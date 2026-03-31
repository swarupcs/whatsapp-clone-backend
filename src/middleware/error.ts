import type { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { env } from '../config/env.js';
import { sendInternalError } from '../helpers/index.js';
import { MulterError } from 'multer';

export const requestLogger = morgan(env.isDev ? 'dev' : 'combined');

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
}

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof MulterError) {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') message = `File is too large. Maximum size is ${env.upload.maxFileSizeMb}MB`;
    else if (err.code === 'LIMIT_FILE_COUNT') message = 'Too many files. Maximum is 10 files per upload';
    else if (err.code === 'LIMIT_UNEXPECTED_FILE') message = 'Unexpected file field';
    res.status(400).json({ success: false, error: message });
    return;
  }

  if (err.message?.startsWith('File type')) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  if (err.name === 'ZodError') {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({ success: false, error: 'Token expired' });
    return;
  }

  // CastError from mongoose (invalid ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({ success: false, error: 'Invalid ID format' });
    return;
  }

  // Mongoose duplicate key
  if ((err as NodeJS.ErrnoException).code === '11000') {
    res.status(409).json({ success: false, error: 'Duplicate key error' });
    return;
  }

  if (env.isDev) console.error('[Error]', err);

  sendInternalError(res);
}

export function requireJsonBody(req: Request, res: Response, next: NextFunction): void {
  if (
    req.method !== 'GET' &&
    req.method !== 'DELETE' &&
    !req.is('application/json') &&
    !req.is('multipart/form-data')
  ) {
    res.status(415).json({ success: false, error: 'Content-Type must be application/json' });
    return;
  }
  next();
}
