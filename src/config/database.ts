import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB(): Promise<void> {
  try {
    mongoose.set('strictQuery', false);

    await mongoose.connect(env.mongodb.uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`[MongoDB] Connected: ${mongoose.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Reconnected');
    });
  } catch (err) {
    console.error('[MongoDB] Initial connection failed:', err);
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  console.log('[MongoDB] Disconnected gracefully');
}
