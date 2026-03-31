import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import type { InMemoryStore, User, Conversation, Message } from '../types/index.js';

// ─── Singleton store ──────────────────────────────────────────────────────────

export const store: InMemoryStore = {
  users: new Map(),
  conversations: new Map(),
  messages: new Map(),
  refreshTokens: new Set(),
  onlineUsers: new Set(),
  socketUserMap: new Map(),
};

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_PASSWORD_HASH = bcrypt.hashSync('password123', 10);

const seedUsers: User[] = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    passwordHash: SEED_PASSWORD_HASH,
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=john',
    status: 'online',
    about: 'Hey there! I am using WhatsUp',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    passwordHash: SEED_PASSWORD_HASH,
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',
    status: 'online',
    about: 'Available',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '3',
    name: 'Mike Johnson',
    email: 'mike@example.com',
    passwordHash: SEED_PASSWORD_HASH,
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
    status: 'away',
    about: 'Busy',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '4',
    name: 'Sarah Wilson',
    email: 'sarah@example.com',
    passwordHash: SEED_PASSWORD_HASH,
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
    status: 'offline',
    about: 'At work',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '5',
    name: 'Alex Brown',
    email: 'alex@example.com',
    passwordHash: SEED_PASSWORD_HASH,
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
    status: 'online',
    about: 'Hello!',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '6',
    name: 'Emily Davis',
    email: 'emily@example.com',
    passwordHash: SEED_PASSWORD_HASH,
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily',
    status: 'online',
    about: 'Living life',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '7',
    name: 'Chris Lee',
    email: 'chris@example.com',
    passwordHash: SEED_PASSWORD_HASH,
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chris',
    status: 'offline',
    about: 'Away',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '8',
    name: 'David Miller',
    email: 'david@example.com',
    passwordHash: SEED_PASSWORD_HASH,
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=david',
    status: 'online',
    about: 'Happy to connect!',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

// Seed conversations for user '1' (John Doe) — matching frontend mock data
function buildSeedConversations(): Conversation[] {
  const user1 = seedUsers[0]!;
  const user2 = seedUsers[1]!;
  const user3 = seedUsers[2]!;
  const user4 = seedUsers[3]!;
  const user5 = seedUsers[4]!;
  const user6 = seedUsers[5]!;
  const user7 = seedUsers[6]!;
  const user8 = seedUsers[7]!;

  const toPublic = (u: User) => {
    const { passwordHash: _ph, ...pub } = u;
    return pub;
  };

  return [
    {
      id: 'conv-1',
      name: user2.name,
      picture: user2.picture,
      isGroup: false,
      users: [toPublic(user1), toPublic(user2)],
      unreadCount: 2,
      createdAt: new Date(Date.now() - 86400000 * 7),
      updatedAt: new Date(),
    },
    {
      id: 'conv-2',
      name: user3.name,
      picture: user3.picture,
      isGroup: false,
      users: [toPublic(user1), toPublic(user3)],
      unreadCount: 0,
      createdAt: new Date(Date.now() - 86400000 * 5),
      updatedAt: new Date(),
    },
    {
      id: 'conv-3',
      name: user4.name,
      picture: user4.picture,
      isGroup: false,
      users: [toPublic(user1), toPublic(user4)],
      unreadCount: 1,
      createdAt: new Date(Date.now() - 86400000 * 3),
      updatedAt: new Date(),
    },
    {
      id: 'conv-4',
      name: user5.name,
      picture: user5.picture,
      isGroup: false,
      users: [toPublic(user1), toPublic(user5)],
      unreadCount: 0,
      createdAt: new Date(Date.now() - 86400000 * 2),
      updatedAt: new Date(),
    },
    {
      id: 'group-1',
      name: '🚀 Project Alpha Team',
      picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=project-alpha',
      isGroup: true,
      users: [toPublic(user1), toPublic(user2), toPublic(user3), toPublic(user4)],
      adminId: '1',
      unreadCount: 3,
      createdAt: new Date(Date.now() - 86400000 * 14),
      updatedAt: new Date(),
    },
    {
      id: 'group-2',
      name: '🎮 Gaming Squad',
      picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=gaming-squad',
      isGroup: true,
      users: [toPublic(user1), toPublic(user5), toPublic(user6), toPublic(user7), toPublic(user8)],
      adminId: '5',
      unreadCount: 8,
      createdAt: new Date(Date.now() - 86400000 * 30),
      updatedAt: new Date(),
    },
    {
      id: 'group-3',
      name: '💼 Work Buddies',
      picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=work-buddies',
      isGroup: true,
      users: [toPublic(user1), toPublic(user2), toPublic(user4), toPublic(user6)],
      adminId: '2',
      unreadCount: 0,
      createdAt: new Date(Date.now() - 86400000 * 60),
      updatedAt: new Date(),
    },
    {
      id: 'group-4',
      name: '📚 Book Club',
      picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=book-club',
      isGroup: true,
      users: [toPublic(user1), toPublic(user3), toPublic(user6), toPublic(user7)],
      adminId: '3',
      unreadCount: 2,
      createdAt: new Date(Date.now() - 86400000 * 45),
      updatedAt: new Date(),
    },
  ];
}

function buildSeedMessages(): Map<string, Message[]> {
  const map = new Map<string, Message[]>();

  // conv-1: John ↔ Jane
  map.set('conv-1', [
    {
      id: 'conv1-msg-0',
      conversationId: 'conv-1',
      senderId: '2',
      message: "Hey! How's it going? 👋",
      reactions: [{ emoji: '👋', userId: '1', createdAt: new Date(Date.now() - 3500000) }],
      seenBy: ['1'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 3600000 * 2),
      updatedAt: new Date(Date.now() - 3600000 * 2),
    },
    {
      id: 'conv1-msg-1',
      conversationId: 'conv-1',
      senderId: '1',
      message: "Hey! I'm doing great! Just finished working on the new project.",
      reactions: [
        { emoji: '👍', userId: '2', createdAt: new Date(Date.now() - 3400000) },
        { emoji: '🔥', userId: '2', createdAt: new Date(Date.now() - 3400000) },
      ],
      seenBy: ['2'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 3600000 * 1.9),
      updatedAt: new Date(Date.now() - 3600000 * 1.9),
    },
    {
      id: 'conv1-msg-2',
      conversationId: 'conv-1',
      senderId: '2',
      message: "That's awesome! Is it the chat app?",
      seenBy: ['1'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 3600000 * 1.8),
      updatedAt: new Date(Date.now() - 3600000 * 1.8),
    },
    {
      id: 'conv1-msg-3',
      conversationId: 'conv-1',
      senderId: '1',
      message: 'Yes! Real-time messaging, emoji reactions, file sharing, and group chats. Pretty proud of it! 🚀',
      reactions: [
        { emoji: '🚀', userId: '2', createdAt: new Date(Date.now() - 3000000) },
        { emoji: '❤️', userId: '2', createdAt: new Date(Date.now() - 3000000) },
      ],
      seenBy: ['2'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 3600000 * 1.7),
      updatedAt: new Date(Date.now() - 3600000 * 1.7),
    },
    {
      id: 'conv1-msg-4',
      conversationId: 'conv-1',
      senderId: '2',
      message: 'Absolutely! Count me in. This is going to be great! 🎉',
      seenBy: [],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 300000),
      updatedAt: new Date(Date.now() - 300000),
    },
  ]);

  // group-1: Project Alpha Team
  map.set('group-1', [
    {
      id: 'group1-msg-0',
      conversationId: 'group-1',
      senderId: '2',
      message: 'Hey team! Quick standup reminder for tomorrow at 9 AM 📅',
      reactions: [
        { emoji: '👍', userId: '1', createdAt: new Date(Date.now() - 80000000) },
        { emoji: '✅', userId: '3', createdAt: new Date(Date.now() - 80000000) },
      ],
      seenBy: ['1', '2', '3', '4'],
      isEdited: false,
      isDeleted: false,
      isPinned: true,
      pinnedAt: new Date(Date.now() - 79000000),
      pinnedBy: '1',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
    },
    {
      id: 'group1-msg-1',
      conversationId: 'group-1',
      senderId: '1',
      message: "Got it! I'll have the sprint review ready by then.",
      seenBy: ['2', '3', '4'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 82800000),
      updatedAt: new Date(Date.now() - 82800000),
    },
    {
      id: 'group1-msg-2',
      conversationId: 'group-1',
      senderId: '3',
      message: 'Great progress on the sprint! 🎉',
      seenBy: [],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 1800000),
      updatedAt: new Date(Date.now() - 1800000),
    },
  ]);

  // group-2: Gaming Squad
  map.set('group-2', [
    {
      id: 'group2-msg-0',
      conversationId: 'group-2',
      senderId: '5',
      message: "Who's online for some games tonight? 🎮",
      reactions: [
        { emoji: '🙋', userId: '1', createdAt: new Date(Date.now() - 28000000) },
        { emoji: '🙋', userId: '6', createdAt: new Date(Date.now() - 28000000) },
      ],
      seenBy: ['1', '5', '6', '7', '8'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 28800000),
      updatedAt: new Date(Date.now() - 28800000),
    },
    {
      id: 'group2-msg-1',
      conversationId: 'group-2',
      senderId: '6',
      message: 'Anyone up for ranked tonight? 🎮',
      seenBy: [],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 600000),
      updatedAt: new Date(Date.now() - 600000),
    },
  ]);

  // Minimal seeds for other convs so they have some history
  map.set('conv-2', [
    {
      id: 'conv2-msg-0',
      conversationId: 'conv-2',
      senderId: '3',
      message: 'Did you see the meeting notes?',
      seenBy: ['1'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 7200000),
      updatedAt: new Date(Date.now() - 7200000),
    },
  ]);
  map.set('conv-3', [
    {
      id: 'conv3-msg-0',
      conversationId: 'conv-3',
      senderId: '1',
      message: 'Let me check...',
      seenBy: ['4'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(Date.now() - 3600000),
    },
  ]);
  map.set('conv-4', []);
  map.set('group-3', [
    {
      id: 'group3-msg-0',
      conversationId: 'group-3',
      senderId: '1',
      message: 'Lunch at 12:30? 🍕',
      seenBy: ['2', '4', '6'],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 7200000),
      updatedAt: new Date(Date.now() - 7200000),
    },
  ]);
  map.set('group-4', [
    {
      id: 'group4-msg-0',
      conversationId: 'group-4',
      senderId: '7',
      message: 'Just finished chapter 5, mind-blowing twist! 🤯',
      seenBy: [],
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(Date.now() - 3600000),
    },
  ]);

  return map;
}

// ─── Initialize store ─────────────────────────────────────────────────────────

export function initializeStore(): void {
  seedUsers.forEach((u) => store.users.set(u.id, u));

  const conversations = buildSeedConversations();
  conversations.forEach((c) => store.conversations.set(c.id, c));

  const messages = buildSeedMessages();
  messages.forEach((msgs, convId) => store.messages.set(convId, msgs));

  // Attach latest messages to conversations
  conversations.forEach((conv) => {
    const msgs = store.messages.get(conv.id) ?? [];
    if (msgs.length > 0) {
      const latest = msgs[msgs.length - 1];
      const updated = { ...conv, latestMessage: latest };
      store.conversations.set(conv.id, updated);
    }
  });

  console.log(
    `[Store] Initialized: ${store.users.size} users, ${store.conversations.size} conversations`,
  );
}
