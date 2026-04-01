/**
 * index.ts — Application entry point + process-level error guards.
 *
 * Process-level guards are the LAST line of defence. They should almost never
 * fire in a correctly-written application because:
 *
 *   - Every async route is wrapped in asyncHandler
 *   - Every thrown error is forwarded to globalErrorHandler
 *
 * But they exist because no application is perfect:
 *   - Third-party libraries may emit uncaught rejections
 *   - Bugs in middleware that isn't wrapped in asyncHandler can escape
 *
 * Strategy:
 *   - unhandledRejection: log + exit(1) in production; log only in dev
 *     (exiting in prod avoids running in a corrupted/unknown state)
 *   - uncaughtException: ALWAYS exit(1) — the process state is undefined
 */

import { createServer } from 'http';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';
import { connectDB, disconnectDB } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Create Express app
  const app = createApp();

  // 3. Wrap in HTTP server
  const httpServer = createServer(app);

  // 4. Attach Socket.IO
  const io = initSocket(httpServer);
  app.locals['io'] = io;

  // 5. Start listening
  await new Promise<void>((resolve) => {
    httpServer.listen(env.port, resolve);
  });

  logger.info(`🚀 Server running on http://localhost:${env.port}`, {
    environment: env.nodeEnv,
    corsOrigin: env.cors.clientUrl,
  });

  // 6. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);

    // Stop accepting new connections
    httpServer.close(async () => {
      try {
        await disconnectDB();
        logger.info('HTTP server and DB connection closed cleanly');
        process.exit(0);
      } catch (err) {
        logger.error(err instanceof Error ? err : new Error(String(err)), {
          context: 'shutdown',
        });
        process.exit(1);
      }
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error(new Error('Forced shutdown after timeout'));
      process.exit(1);
    }, 10_000).unref(); // .unref() prevents this timer from keeping the event loop alive
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// ─── Process-level error guards ───────────────────────────────────────────────

/**
 * Unhandled promise rejection — a promise was rejected and nothing caught it.
 * This should NOT happen with asyncHandler wrapping all routes, but third-party
 * libraries or bugs in non-route code can still cause this.
 */
process.on('unhandledRejection', (reason: unknown) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error(err, { context: 'unhandledRejection' });

  // In production, exit so the process manager (PM2, Docker, k8s) can restart
  // in a clean state. In development, just log so the server stays up for debugging.
  if (env.isProd) {
    process.exit(1);
  }
});

/**
 * Uncaught exception — a synchronous throw escaped all try/catch blocks.
 * The process state is undefined at this point — always exit.
 */
process.on('uncaughtException', (err: Error) => {
  logger.error(err, { context: 'uncaughtException' });
  // Give the logger time to flush before exiting
  setTimeout(() => process.exit(1), 500);
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

bootstrap().catch((err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error(error, { context: 'bootstrap' });
  process.exit(1);
});
