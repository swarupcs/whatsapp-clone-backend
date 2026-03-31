import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import {
  addSocket,
  removeSocket,
  getSocketsForUser,
  isUserOnline,
  getOnlineUserIds,
} from '../config/runtimeStore.js';
import { verifyAccessToken } from '../helpers/index.js';
import { userService } from '../services/user.service.js';
import { messageService } from '../services/message.service.js';
import { Conversation } from '../models/conversation.model.js';
import type { SocketTypingPayload, SocketCallPayload } from '../types/index.js';

export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  JOIN: 'join',
  JOINED: 'joined',
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',
  EDIT_MESSAGE: 'edit_message',
  MESSAGE_EDITED: 'message_edited',
  DELETE_MESSAGE: 'delete_message',
  MESSAGE_DELETED: 'message_deleted',
  TOGGLE_REACTION: 'toggle_reaction',
  REACTION_UPDATED: 'reaction_updated',
  MARK_SEEN: 'mark_seen',
  MESSAGE_SEEN: 'message_seen',
  TYPING_START: 'typing',
  TYPING_STOP: 'stop_typing',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  ONLINE_USERS: 'online_users',
  INITIATE_CALL: 'initiate_call',
  INCOMING_CALL: 'incoming_call',
  CALL_ACCEPTED: 'call_accepted',
  CALL_REJECTED: 'call_rejected',
  CALL_ENDED: 'call_ended',
  CALL_SIGNAL: 'call_signal',
  PIN_MESSAGE: 'pin_message',
  MESSAGE_PINNED: 'message_pinned',
  UNPIN_MESSAGE: 'unpin_message',
  MESSAGE_UNPINNED: 'message_unpinned',
} as const;

interface AuthenticatedSocket extends Socket {
  userId: string;
  userEmail: string;
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.cors.clientUrl,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.['token'] as string | undefined) ??
      (socket.handshake.headers.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice(7)
        : undefined);

    if (!token) return next(new Error('Authentication token required'));

    try {
      const payload = verifyAccessToken(token);
      (socket as AuthenticatedSocket).userId = payload.userId;
      (socket as AuthenticatedSocket).userEmail = payload.email;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const authedSocket = socket as AuthenticatedSocket;
    const userId = authedSocket.userId;

    console.log(`[Socket] Connected: ${userId} (${socket.id})`);
    addSocket(socket.id, userId);

    // BUG FIX 8: handleUserOnline is async — wrap in .catch() so a failure
    // (e.g. DB error looking up conversations) results in an error log instead
    // of a silent unhandled promise rejection. The connection stays alive but
    // we log the failure so it can be investigated.
    handleUserOnline(io, socket, userId).catch((err) => {
      console.error(`[Socket] handleUserOnline failed for ${userId}:`, err);
    });

    socket.on(SOCKET_EVENTS.TYPING_START, (data: SocketTypingPayload) => {
      handleTyping(socket, data, true);
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, (data: SocketTypingPayload) => {
      handleTyping(socket, data, false);
    });

    socket.on(
      SOCKET_EVENTS.MARK_SEEN,
      (data: { conversationId: string; messageId: string }) => {
        void handleMarkSeen(io, userId, data);
      },
    );

    socket.on(
      SOCKET_EVENTS.TOGGLE_REACTION,
      (data: { conversationId: string; messageId: string; emoji: string }) => {
        void handleToggleReaction(io, userId, data);
      },
    );

    socket.on(
      SOCKET_EVENTS.PIN_MESSAGE,
      (data: { conversationId: string; messageId: string }) => {
        void handlePin(io, userId, data, true);
      },
    );

    socket.on(
      SOCKET_EVENTS.UNPIN_MESSAGE,
      (data: { conversationId: string; messageId: string }) => {
        void handlePin(io, userId, data, false);
      },
    );

    socket.on(SOCKET_EVENTS.INITIATE_CALL, (data: SocketCallPayload) => {
      void handleInitiateCall(io, socket, userId, data);
    });

    socket.on(
      SOCKET_EVENTS.CALL_ACCEPTED,
      (data: {
        callerId: string;
        conversationId: string;
        signal?: unknown;
      }) => {
        handleCallAccepted(io, userId, data);
      },
    );

    socket.on(
      SOCKET_EVENTS.CALL_REJECTED,
      (data: { callerId: string; conversationId: string }) => {
        handleCallRejected(io, userId, data);
      },
    );

    socket.on(
      SOCKET_EVENTS.CALL_ENDED,
      (data: { conversationId: string; otherUserId: string }) => {
        handleCallEnded(io, userId, data);
      },
    );

    socket.on(
      SOCKET_EVENTS.CALL_SIGNAL,
      (data: { toUserId: string; signal: unknown }) => {
        handleCallSignal(io, userId, data);
      },
    );

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${userId} (${socket.id})`);
      const uid = removeSocket(socket.id);
      if (uid) {
        handleUserOffline(io, uid).catch((err) => {
          console.error(`[Socket] handleUserOffline failed for ${uid}:`, err);
        });
      }
    });
  });

  return io;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleUserOnline(
  io: SocketIOServer,
  socket: Socket,
  userId: string,
): Promise<void> {
  await userService.updateStatus(userId, 'online');

  const convs = await Conversation.find({ members: userId }, '_id');
  convs.forEach((c) => {
    const roomId = c._id.toString();
    socket.join(roomId);
  });

  socket.broadcast.emit(SOCKET_EVENTS.USER_ONLINE, { userId });
  socket.emit(SOCKET_EVENTS.ONLINE_USERS, { userIds: getOnlineUserIds() });
}

async function handleUserOffline(
  io: SocketIOServer,
  userId: string,
): Promise<void> {
  if (!isUserOnline(userId)) {
    await userService.updateStatus(userId, 'offline');
    io.emit(SOCKET_EVENTS.USER_OFFLINE, { userId });
  }
}

function handleTyping(
  socket: Socket,
  data: SocketTypingPayload,
  isTyping: boolean,
): void {
  if (!data.conversationId) return;
  const event = isTyping
    ? SOCKET_EVENTS.TYPING_START
    : SOCKET_EVENTS.TYPING_STOP;
  socket.to(data.conversationId).emit(event, {
    conversationId: data.conversationId,
    userId: data.userId,
    userName: data.userName,
  });
}

async function handleMarkSeen(
  io: SocketIOServer,
  userId: string,
  data: { conversationId: string; messageId: string },
): Promise<void> {
  const { conversationId, messageId } = data;
  if (!conversationId || !messageId) return;

  const updated = await messageService.markMessageSeen(
    conversationId,
    messageId,
    userId,
  );
  if (!updated) return;

  io.to(conversationId).emit(SOCKET_EVENTS.MESSAGE_SEEN, {
    conversationId,
    messageId,
    userId,
    seenBy: updated.seenBy,
  });
}

async function handleToggleReaction(
  io: SocketIOServer,
  userId: string,
  data: { conversationId: string; messageId: string; emoji: string },
): Promise<void> {
  const { conversationId, messageId, emoji } = data;
  if (!conversationId || !messageId || !emoji) return;

  const updated = await messageService.toggleReaction(
    conversationId,
    messageId,
    userId,
    emoji,
  );
  if (typeof updated === 'string') return;

  io.to(conversationId).emit(SOCKET_EVENTS.REACTION_UPDATED, {
    conversationId,
    messageId,
    reactions: updated.reactions,
  });
}

async function handlePin(
  io: SocketIOServer,
  userId: string,
  data: { conversationId: string; messageId: string },
  pin: boolean,
): Promise<void> {
  const { conversationId, messageId } = data;
  if (!conversationId || !messageId) return;

  const result = pin
    ? await messageService.pinMessage(conversationId, messageId, userId)
    : await messageService.unpinMessage(conversationId, messageId);

  if (typeof result === 'string') return;

  const event = pin
    ? SOCKET_EVENTS.MESSAGE_PINNED
    : SOCKET_EVENTS.MESSAGE_UNPINNED;
  io.to(conversationId).emit(event, { conversationId, message: result });
}

async function handleInitiateCall(
  io: SocketIOServer,
  socket: Socket,
  callerId: string,
  data: SocketCallPayload,
): Promise<void> {
  const { conversationId, callType } = data;
  if (!conversationId) return;

  const caller = await userService.getUserById(callerId);
  if (!caller) return;

  socket.to(conversationId).emit(SOCKET_EVENTS.INCOMING_CALL, {
    callerId,
    caller,
    conversationId,
    callType,
  });
}

function handleCallAccepted(
  io: SocketIOServer,
  acceptorId: string,
  data: { callerId: string; conversationId: string; signal?: unknown },
): void {
  getSocketsForUser(data.callerId).forEach((socketId) => {
    io.to(socketId).emit(SOCKET_EVENTS.CALL_ACCEPTED, {
      acceptorId,
      conversationId: data.conversationId,
      signal: data.signal,
    });
  });
}

function handleCallRejected(
  io: SocketIOServer,
  rejectorId: string,
  data: { callerId: string; conversationId: string },
): void {
  getSocketsForUser(data.callerId).forEach((socketId) => {
    io.to(socketId).emit(SOCKET_EVENTS.CALL_REJECTED, {
      rejectorId,
      conversationId: data.conversationId,
    });
  });
}

function handleCallEnded(
  io: SocketIOServer,
  enderId: string,
  data: { conversationId: string; otherUserId: string },
): void {
  getSocketsForUser(data.otherUserId).forEach((socketId) => {
    io.to(socketId).emit(SOCKET_EVENTS.CALL_ENDED, {
      enderId,
      conversationId: data.conversationId,
    });
  });
}

function handleCallSignal(
  io: SocketIOServer,
  fromUserId: string,
  data: { toUserId: string; signal: unknown },
): void {
  getSocketsForUser(data.toUserId).forEach((socketId) => {
    io.to(socketId).emit(SOCKET_EVENTS.CALL_SIGNAL, {
      fromUserId,
      signal: data.signal,
    });
  });
}

export function emitNewMessage(
  io: SocketIOServer,
  conversationId: string,
  message: unknown,
  conversation: unknown,
): void {
  io.to(conversationId).emit(SOCKET_EVENTS.NEW_MESSAGE, {
    message,
    conversation,
  });
}

export function emitMessageEdited(
  io: SocketIOServer,
  conversationId: string,
  message: unknown,
): void {
  io.to(conversationId).emit(SOCKET_EVENTS.MESSAGE_EDITED, { message });
}

export function emitMessageDeleted(
  io: SocketIOServer,
  conversationId: string,
  messageId: string,
): void {
  io.to(conversationId).emit(SOCKET_EVENTS.MESSAGE_DELETED, {
    messageId,
    conversationId,
  });
}
