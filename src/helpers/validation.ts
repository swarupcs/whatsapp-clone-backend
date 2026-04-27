/**
 * validation.ts — Zod schemas + a helper that THROWS instead of returning
 * success/failure objects.
 *
 * WHY THROW?  Because validation failure is an exceptional control-flow event.
 * With asyncHandler wrapping every route, a thrown ValidationError is caught
 * automatically and forwarded to the global error handler — no manual `if
 * (!parsed.success)` blocks needed in every controller.
 *
 * TWO HELPERS:
 *
 *   parseBody(schema, data)  — throws ValidationError on failure
 *   safeParseBody(schema, data) — returns { success, data } | { success, error }
 *                                 for cases where you want to handle errors manually
 */

import { z } from 'zod';
import { ValidationError } from '../errors/AppError.js';

// ─── Reusable field schemas ───────────────────────────────────────────────────

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .email('Invalid email address')
  .toLowerCase()
  .trim();

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password is too long');

const nameSchema = z
  .string({ required_error: 'Name is required' })
  .min(2, 'Name must be at least 2 characters')
  .max(60, 'Name is too long')
  .trim();

const messageTextSchema = z.string().max(4000, 'Message is too long').default('');
const emojiSchema = z.string({ required_error: 'Emoji is required' }).min(1).max(8);
const uuidSchema = z.string().min(1, 'ID is required');

// ─── Auth schemas ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'Password is required' }).min(1),
});

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string({ required_error: 'Refresh token is required' }).min(1),
});

// ─── Conversation schemas ─────────────────────────────────────────────────────

export const createConversationSchema = z.object({ userId: uuidSchema });

export const createGroupSchema = z.object({
  name: z
    .string({ required_error: 'Group name is required' })
    .min(1, 'Group name cannot be empty')
    .max(80, 'Group name is too long')
    .trim(),
  userIds: z
    .array(uuidSchema)
    .min(2, 'A group needs at least 2 other members')
    .max(50, 'Group cannot exceed 50 members'),
  picture: z.string().url('Invalid picture URL').optional(),
});

export const updateGroupSchema = z.object({
  name: z
    .string()
    .min(1, 'Group name cannot be empty')
    .max(80, 'Group name is too long')
    .trim()
    .optional(),
  picture: z.string().url('Invalid picture URL').optional(),
});

// ─── Message schemas ──────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  message: messageTextSchema,
  replyTo: z
    .object({
      messageId: uuidSchema,
      senderId: uuidSchema,
      senderName: z.string().min(1),
      message: z.string().max(200),
    })
    .optional(),
});

export const editMessageSchema = z.object({
  message: z
    .string({ required_error: 'Message content is required' })
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message is too long')
    .trim(),
});

export const addReactionSchema = z.object({ emoji: emojiSchema });
export const forwardMessageSchema = z.object({ toConversationId: uuidSchema });

// ─── Profile schemas ──────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  about: z.string().max(200, 'About text is too long').trim().optional(),
  picture: z.string().url('Invalid picture URL').optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['online', 'offline', 'away'], {
    required_error: 'Status is required',
    invalid_type_error: 'Status must be online, offline, or away',
  }),
});

// ─── Query schemas ────────────────────────────────────────────────────────────

export const searchUsersSchema = z.object({
  q: z
    .string({ required_error: 'Search query is required' })
    .min(1, 'Search query cannot be empty')
    .max(100)
    .trim(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * parseBody — Parse and validate `data` against `schema`.
 * THROWS a ValidationError (→ caught by asyncHandler → global error handler)
 * with human-readable field-level details on failure.
 *
 * Prefer this in controllers so there is NO error-branch boilerplate.
 */
export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (result.success) return result.data;

  const details = result.error.errors.map((e) => ({
    field: e.path.join('.') || 'root',
    message: e.message,
    code: e.code,
  }));

  // The first error message is used as the top-level message for brevity
  const message = result.error.errors[0]?.message ?? 'Validation failed';

  throw new ValidationError(message, details);
}

/**
 * safeParseBody — Non-throwing variant for the rare cases where validation
 * failure needs custom handling (e.g., branching on optional fields).
 */
export function safeParseBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string; details: unknown[] } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };

  const details = result.error.errors.map((e) => ({
    field: e.path.join('.') || 'root',
    message: e.message,
    code: e.code,
  }));

  return {
    success: false,
    error: result.error.errors[0]?.message ?? 'Validation failed',
    details,
  };
}
