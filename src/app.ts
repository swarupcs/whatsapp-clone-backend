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
} from './middleware/error.js';

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
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // ── Request logger ────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Body parsers ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later.' },
    skip: (req) => req.path === '/api/health',
  });
  app.use('/api', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: 'Too many auth attempts, please try again later.' },
  });
  app.use('/api/auth', authLimiter);

  // ── Static file serving ───────────────────────────────────────────────────
  app.use(
    '/uploads',
    express.static(path.resolve(process.cwd(), env.upload.uploadDir), { maxAge: '7d' }),
  );

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api', apiRouter);

  // ── 404 + error handlers ─────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}
