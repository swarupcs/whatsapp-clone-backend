/**
 * AppError — the single source of truth for all operational errors.
 *
 * Every error thrown intentionally by the application should be an AppError
 * (or a subclass). This lets the global error handler distinguish between
 * "expected" errors (wrong password, not found, etc.) and truly unexpected
 * ones (programming bugs, DB crashes, etc.) without any ad-hoc instanceof
 * checks scattered through the codebase.
 *
 * The `isOperational` flag is the critical distinction:
 *   - true  → safe to expose to the client; log at "warn" level
 *   - false → internal bug; log at "error" level; generic 500 to client
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    details?: unknown,
  ) {
    super(message);

    // Restores the correct prototype chain (needed when targeting ES5)
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    // Capture a clean stack trace that starts at the call site, not here
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }
}

// ─── 400 Bad Request ──────────────────────────────────────────────────────────

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', true, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class InvalidIdError extends AppError {
  constructor(message = 'Invalid ID format') {
    super(message, 400, 'INVALID_ID', true);
  }
}

// ─── 401 Unauthorized ────────────────────────────────────────────────────────

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED', true);
  }
}

export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid or expired token') {
    super(message, 401, 'INVALID_TOKEN', true);
  }
}

// ─── 403 Forbidden ───────────────────────────────────────────────────────────

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

// ─── 404 Not Found ───────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND', true);
  }
}

// ─── 405 Method Not Allowed ──────────────────────────────────────────────────

export class MethodNotAllowedError extends AppError {
  constructor(method: string, path: string) {
    super(
      `Method ${method} is not allowed on ${path}`,
      405,
      'METHOD_NOT_ALLOWED',
      true,
    );
  }
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT', true);
  }
}

// ─── 413 Payload Too Large ───────────────────────────────────────────────────

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload too large') {
    super(message, 413, 'PAYLOAD_TOO_LARGE', true);
  }
}

// ─── 415 Unsupported Media Type ──────────────────────────────────────────────

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Content-Type must be application/json') {
    super(message, 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  }
}

// ─── 422 Unprocessable Entity ────────────────────────────────────────────────

export class UnprocessableEntityError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', true, details);
  }
}

// ─── 429 Too Many Requests ───────────────────────────────────────────────────

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'TOO_MANY_REQUESTS', true);
  }
}

// ─── 500 Internal Server Error ───────────────────────────────────────────────

export class InternalServerError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    // isOperational = false → will NOT expose the real message to the client
    super(message, 500, 'INTERNAL_SERVER_ERROR', false);
  }
}

// ─── 503 Service Unavailable ─────────────────────────────────────────────────

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE', false);
  }
}
