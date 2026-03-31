import type mongoose from 'mongoose';

// ─── User ────────────────────────────────────────────────────────────────────

export type UserStatus = 'online' | 'offline' | 'away';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  picture: string;
  status: UserStatus;
  about: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthTokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

// ─── Reaction ─────────────────────────────────────────────────────────────────

export interface Reaction {
  emoji: string;
  userId: string;
  createdAt: Date;
}

// ─── File Attachment ──────────────────────────────────────────────────────────

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
}

// ─── Reply context ────────────────────────────────────────────────────────────

export interface ReplyTo {
  messageId: string;
  senderId: string;
  senderName: string;
  message: string;
}

// ─── Message ──────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  message: string;
  files?: FileAttachment[];
  reactions: Reaction[];
  replyTo?: ReplyTo;
  seenBy: string[];
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  isPinned: boolean;
  pinnedAt?: Date;
  pinnedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  name: string;
  picture: string;
  isGroup: boolean;
  users: PublicUser[];
  adminId?: string;
  latestMessage?: Message;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Request payloads ─────────────────────────────────────────────────────────

export interface CreateConversationRequest {
  userId: string;
}

export interface CreateGroupRequest {
  name: string;
  userIds: string[];
  picture?: string;
}

export interface SendMessageRequest {
  message: string;
  replyTo?: ReplyTo;
}

export interface EditMessageRequest {
  message: string;
}

export interface UpdateProfileRequest {
  name?: string;
  about?: string;
  picture?: string;
}

export interface UpdateStatusRequest {
  status: UserStatus;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
}

// ─── API Response Wrappers ───────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Socket Events ────────────────────────────────────────────────────────────

export interface SocketTypingPayload {
  conversationId: string;
  userId: string;
  userName: string;
}

export interface SocketCallPayload {
  callerId: string;
  caller: PublicUser;
  conversationId: string;
  callType: 'audio' | 'video';
  signal?: unknown;
}
