import { z } from 'zod';

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

export const createConversationSchema = z.object({
  userId: uuidSchema,
});

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

export const addReactionSchema = z.object({
  emoji: emojiSchema,
});

export const forwardMessageSchema = z.object({
  toConversationId: uuidSchema,
});

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

// ─── Utility ──────────────────────────────────────────────────────────────────

export function safeParseBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const messages = result.error.errors.map((e) => e.message).join(', ');
  return { success: false, error: messages };
}
