import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  port: parseInt(optionalEnv('PORT', '5000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  isDev: optionalEnv('NODE_ENV', 'development') === 'development',
  isProd: optionalEnv('NODE_ENV', 'development') === 'production',

  mongodb: {
    uri: optionalEnv('MONGODB_URI', 'mongodb://localhost:27017/whatsapp_clone'),
  },

  jwt: {
    secret: optionalEnv('JWT_SECRET', 'dev-secret-change-in-prod'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '7d'),
    refreshSecret: optionalEnv('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    refreshExpiresIn: optionalEnv('JWT_REFRESH_EXPIRES_IN', '30d'),
  },

  cors: {
    clientUrl: optionalEnv('CLIENT_URL', 'http://localhost:5173'),
  },

  upload: {
    maxFileSizeMb: parseInt(optionalEnv('MAX_FILE_SIZE_MB', '50'), 10),
    uploadDir: optionalEnv('UPLOAD_DIR', 'uploads'),
  },

  rateLimit: {
    windowMs: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    maxRequests: parseInt(optionalEnv('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  },
} as const;
