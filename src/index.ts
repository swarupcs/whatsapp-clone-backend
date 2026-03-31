import { createServer } from 'http';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';
import { connectDB, disconnectDB } from './config/database.js';
import { env } from './config/env.js';

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
  httpServer.listen(env.port, () => {
    console.log('');
    console.log('  ██╗    ██╗██╗  ██╗ █████╗ ████████╗███████╗██╗   ██╗██████╗ ');
    console.log('  ██║    ██║██║  ██║██╔══██╗╚══██╔══╝██╔════╝██║   ██║██╔══██╗');
    console.log('  ██║ █╗ ██║███████║███████║   ██║   ███████╗██║   ██║██████╔╝');
    console.log('  ██║███╗██║██╔══██║██╔══██║   ██║   ╚════██║██║   ██║██╔═══╝ ');
    console.log('  ╚███╔███╔╝██║  ██║██║  ██║   ██║   ███████║╚██████╔╝██║     ');
    console.log('   ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═╝     ');
    console.log('');
    console.log(`  🚀 Server running  : http://localhost:${env.port}`);
    console.log(`  🌍 Environment     : ${env.nodeEnv}`);
    console.log(`  🍃 Database        : MongoDB`);
    console.log(`  📡 Socket.IO       : enabled`);
    console.log(`  🔗 CORS origin     : ${env.cors.clientUrl}`);
    console.log('');
  });

  // 6. Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
    httpServer.close(async () => {
      await disconnectDB();
      console.log('[Server] HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception:', err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('[Server] Bootstrap failed:', err);
  process.exit(1);
});
