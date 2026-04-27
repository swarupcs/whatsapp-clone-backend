/**
 * Runtime-only store.
 * Socket session data is ephemeral — it lives only while the server is running.
 * All persistent data (users, conversations, messages) lives in MongoDB.
 */
export const runtimeStore = {
  /** socketId → userId */
  socketUserMap: new Map<string, string>(),
  /** userId → Set of socketIds (a user can have multiple tabs open) */
  onlineSockets: new Map<string, Set<string>>(),
  /** userId → { otherUserId, conversationId } */
  activeCalls: new Map<string, { otherUserId: string; conversationId: string }>(),
};

export function addSocket(socketId: string, userId: string): void {
  runtimeStore.socketUserMap.set(socketId, userId);
  if (!runtimeStore.onlineSockets.has(userId)) {
    runtimeStore.onlineSockets.set(userId, new Set());
  }
  runtimeStore.onlineSockets.get(userId)!.add(socketId);
}

export function removeSocket(socketId: string): string | undefined {
  const userId = runtimeStore.socketUserMap.get(socketId);
  if (!userId) return undefined;

  runtimeStore.socketUserMap.delete(socketId);
  const sockets = runtimeStore.onlineSockets.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      runtimeStore.onlineSockets.delete(userId);
    }
  }
  return userId;
}

export function getSocketsForUser(userId: string): string[] {
  return Array.from(runtimeStore.onlineSockets.get(userId) ?? []);
}

export function isUserOnline(userId: string): boolean {
  const sockets = runtimeStore.onlineSockets.get(userId);
  return !!(sockets && sockets.size > 0);
}

export function getOnlineUserIds(): string[] {
  return Array.from(runtimeStore.onlineSockets.keys());
}

export function setCallSession(userId: string, otherUserId: string, conversationId: string): void {
  runtimeStore.activeCalls.set(userId, { otherUserId, conversationId });
  runtimeStore.activeCalls.set(otherUserId, { otherUserId: userId, conversationId });
}

export function getCallSession(userId: string) {
  return runtimeStore.activeCalls.get(userId);
}

export function clearCallSession(userId: string): void {
  const session = runtimeStore.activeCalls.get(userId);
  if (session) {
    runtimeStore.activeCalls.delete(userId);
    runtimeStore.activeCalls.delete(session.otherUserId);
  }
}
