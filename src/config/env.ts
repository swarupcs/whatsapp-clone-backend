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

const nodeEnv = optionalEnv('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

// BUG FIX 2: In production, JWT secrets MUST be provided via environment variables.
// Using fallback dev secrets in production is a critical security vulnerability —
// anyone who knows the default secret can forge valid JWTs for any user.
// We use requireEnv in production and emit a loud warning in development.
function getJwtSecret(key: string, devFallback: string): string {
  if (isProd) {
    return requireEnv(key);
  }
  const value = process.env[key];
  if (!value) {
    console.warn(
      `[Security] WARNING: ${key} is not set. Using insecure dev fallback. ` +
        `Never deploy to production without setting this variable.`,
    );
    return devFallback;
  }
  return value;
}

export const env = {
  port: parseInt(optionalEnv('PORT', '5000'), 10),
  nodeEnv,
  isDev: nodeEnv === 'development',
  isProd,

  mongodb: {
    uri: isProd
      ? requireEnv('MONGODB_URI')
      : optionalEnv('MONGODB_URI', 'mongodb://localhost:27017'),
    dbName: optionalEnv('MONGODB_DB_NAME', 'whatsapp'),
  },

  jwt: {
    secret: getJwtSecret('JWT_SECRET', 'dev-secret-change-in-prod'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '7d'),
    refreshSecret: getJwtSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    refreshExpiresIn: optionalEnv('JWT_REFRESH_EXPIRES_IN', '30d'),
  },

  cors: {
    clientUrl: optionalEnv('CLIENT_URL', 'http://localhost:5173'),
  },

  upload: {
    maxFileSizeMb: parseInt(optionalEnv('MAX_FILE_SIZE_MB', '50'), 10),
    uploadDir: optionalEnv('UPLOAD_DIR', 'uploads'),
  },

  imagekit: {
    publicKey: isProd
      ? requireEnv('IMAGEKIT_PUBLIC_KEY')
      : optionalEnv('IMAGEKIT_PUBLIC_KEY', ''),
    privateKey: isProd
      ? requireEnv('IMAGEKIT_PRIVATE_KEY')
      : optionalEnv('IMAGEKIT_PRIVATE_KEY', ''),
    urlEndpoint: isProd
      ? requireEnv('IMAGEKIT_URL_ENDPOINT')
      : optionalEnv('IMAGEKIT_URL_ENDPOINT', ''),
  },

  rateLimit: {
    windowMs: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    maxRequests: parseInt(optionalEnv('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
  },
} as const;
