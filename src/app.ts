/**
 * app.ts — Express application factory.
 *
 * Order of middleware matters:
 *   1. Security (helmet, CORS)
 *   2. Request ID attachment (for log correlation)
 *   3. Request logger
 *   4. Body parsers
 *   5. Rate limiters
 *   6. Static files
 *   7. API routes
 *   8. 404 handler          ← catches unmatched routes
 *   9. Global error handler ← MUST be last, MUST have 4 params (err, req, res, next)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import {
  requestLogger,
  notFoundHandler,
  globalErrorHandler,
  attachRequestId,
  requireJsonBody,
} from './middleware/error.middleware.js';

export function createApp(): express.Application {
  const app = express();

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.cors.clientUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    }),
  );

  // ── Request correlation ID ────────────────────────────────────────────────
  app.use(attachRequestId);

  // ── Request logger ────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Body parsers ────────────────────────────────────────────────────────────
  // These throw SyntaxError on malformed JSON — caught by globalErrorHandler
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // ── Content-Type guard (after body parsers, before routes) ────────────────
  app.use('/api', requireJsonBody);

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    // Return a proper structured error instead of a plain string
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        statusCode: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests, please try again later.',
      });
    },
    skip: (req) => req.path === '/api/health',
  });
  app.use('/api', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        statusCode: 429,
        code: 'TOO_MANY_AUTH_ATTEMPTS',
        message: 'Too many authentication attempts, please try again later.',
      });
    },
  });
  app.use('/api/auth', authLimiter);

  // ── Static file serving ───────────────────────────────────────────────────
  app.use(
    '/uploads',
    express.static(path.resolve(process.cwd(), env.upload.uploadDir), { maxAge: '7d' }),
  );

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api', apiRouter);

  // ── 404 handler ───────────────────────────────────────────────────────────
  // Must come AFTER all routes
  app.use(notFoundHandler);

  // ── Global error handler ──────────────────────────────────────────────────
  // MUST be last and MUST have exactly 4 parameters so Express recognizes it
  // as an error handler
  app.use(globalErrorHandler);

  return app;
}
n app;
}
