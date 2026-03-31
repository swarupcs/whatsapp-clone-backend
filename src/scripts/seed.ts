/**
 * Seed script — run once to populate MongoDB with demo data.
 * Usage: npx tsx src/scripts/seed.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/user.model.js';
import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';
import { env } from '../config/env.js';

const SEED_PASSWORD_HASH = bcrypt.hashSync('password123', 10);

async function seed(): Promise<void> {
  await mongoose.connect(env.mongodb.uri);
  console.log('[Seed] Connected to MongoDB');

  // ── Wipe existing seed data ──────────────────────────────────────────────
  await User.deleteMany({});
  await Conversation.deleteMany({});
  await Message.deleteMany({});
  console.log('[Seed] Cleared existing data');

  // ── Users ────────────────────────────────────────────────────────────────
  const userData = [
    { name: 'John Doe',     email: 'john@example.com',  picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=john',  about: 'Hey there! I am using WhatsUp', status: 'offline' },
    { name: 'Jane Smith',   email: 'jane@example.com',  picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',  about: 'Available',    status: 'offline' },
    { name: 'Mike Johnson', email: 'mike@example.com',  picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',  about: 'Busy',         status: 'offline' },
    { name: 'Sarah Wilson', email: 'sarah@example.com', picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah', about: 'At work',      status: 'offline' },
    { name: 'Alex Brown',   email: 'alex@example.com',  picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',  about: 'Hello!',       status: 'offline' },
    { name: 'Emily Davis',  email: 'emily@example.com', picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily', about: 'Living life',  status: 'offline' },
    { name: 'Chris Lee',    email: 'chris@example.com', picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chris', about: 'Away',         status: 'offline' },
    { name: 'David Miller', email: 'david@example.com', picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=david', about: 'Happy to connect!', status: 'offline' },
  ] as const;

  const users = await User.insertMany(
    userData.map((u) => ({ ...u, passwordHash: SEED_PASSWORD_HASH })),
  );

  const [john, jane, mike, sarah, alex, emily, chris, david] = users as typeof users & { length: 8 };
  console.log(`[Seed] Created ${users.length} users`);

  // ── Conversations ────────────────────────────────────────────────────────
  const conv1 = await Conversation.create({
    name: jane!.name,
    picture: jane!.picture,
    isGroup: false,
    members: [john!._id, jane!._id],
  });

  const conv2 = await Conversation.create({
    name: mike!.name,
    picture: mike!.picture,
    isGroup: false,
    members: [john!._id, mike!._id],
  });

  const conv3 = await Conversation.create({
    name: sarah!.name,
    picture: sarah!.picture,
    isGroup: false,
    members: [john!._id, sarah!._id],
  });

  const conv4 = await Conversation.create({
    name: alex!.name,
    picture: alex!.picture,
    isGroup: false,
    members: [john!._id, alex!._id],
  });

  const group1 = await Conversation.create({
    name: '🚀 Project Alpha Team',
    picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=project-alpha',
    isGroup: true,
    members: [john!._id, jane!._id, mike!._id, sarah!._id],
    adminId: john!._id,
  });

  const group2 = await Conversation.create({
    name: '🎮 Gaming Squad',
    picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=gaming-squad',
    isGroup: true,
    members: [john!._id, alex!._id, emily!._id, chris!._id, david!._id],
    adminId: alex!._id,
  });

  const group3 = await Conversation.create({
    name: '💼 Work Buddies',
    picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=work-buddies',
    isGroup: true,
    members: [john!._id, jane!._id, sarah!._id, emily!._id],
    adminId: jane!._id,
  });

  const group4 = await Conversation.create({
    name: '📚 Book Club',
    picture: 'https://api.dicebear.com/7.x/shapes/svg?seed=book-club',
    isGroup: true,
    members: [john!._id, mike!._id, emily!._id, chris!._id],
    adminId: mike!._id,
  });

  console.log('[Seed] Created conversations');

  // ── Messages ─────────────────────────────────────────────────────────────
  const now = Date.now();

  // conv1: John ↔ Jane
  const m1 = await Message.create({
    conversationId: conv1._id, senderId: jane!._id,
    message: "Hey! How's it going? 👋",
    seenBy: [john!._id], reactions: [{ emoji: '👋', userId: john!._id, createdAt: new Date(now - 3500000) }],
    createdAt: new Date(now - 3600000 * 2), updatedAt: new Date(now - 3600000 * 2),
  });
  const m2 = await Message.create({
    conversationId: conv1._id, senderId: john!._id,
    message: "Hey! I'm doing great! Just finished working on the new project.",
    seenBy: [jane!._id], reactions: [{ emoji: '👍', userId: jane!._id, createdAt: new Date(now - 3400000) }],
    createdAt: new Date(now - 3600000 * 1.9), updatedAt: new Date(now - 3600000 * 1.9),
  });
  const m3 = await Message.create({
    conversationId: conv1._id, senderId: jane!._id,
    message: "That's awesome! Is it the chat app?",
    seenBy: [john!._id],
    createdAt: new Date(now - 3600000 * 1.8), updatedAt: new Date(now - 3600000 * 1.8),
  });
  const m4 = await Message.create({
    conversationId: conv1._id, senderId: john!._id,
    message: 'Yes! Real-time messaging, emoji reactions, file sharing, and group chats. Pretty proud of it! 🚀',
    seenBy: [jane!._id], reactions: [{ emoji: '🚀', userId: jane!._id, createdAt: new Date(now - 3000000) }],
    createdAt: new Date(now - 3600000 * 1.7), updatedAt: new Date(now - 3600000 * 1.7),
  });
  const m5 = await Message.create({
    conversationId: conv1._id, senderId: jane!._id,
    message: 'Absolutely! Count me in. This is going to be great! 🎉',
    seenBy: [], createdAt: new Date(now - 300000), updatedAt: new Date(now - 300000),
  });
  await Conversation.findByIdAndUpdate(conv1._id, { latestMessage: m5._id, updatedAt: new Date(now - 300000) });

  // group1: Project Alpha
  const gm1 = await Message.create({
    conversationId: group1._id, senderId: jane!._id,
    message: 'Hey team! Quick standup reminder for tomorrow at 9 AM 📅',
    seenBy: [john!._id, jane!._id, mike!._id, sarah!._id], isPinned: true, pinnedBy: john!._id, pinnedAt: new Date(now - 79000000),
    reactions: [{ emoji: '👍', userId: john!._id, createdAt: new Date() }, { emoji: '✅', userId: mike!._id, createdAt: new Date() }],
    createdAt: new Date(now - 86400000), updatedAt: new Date(now - 86400000),
  });
  const gm2 = await Message.create({
    conversationId: group1._id, senderId: john!._id,
    message: "Got it! I'll have the sprint review ready by then.",
    seenBy: [jane!._id, mike!._id, sarah!._id],
    createdAt: new Date(now - 82800000), updatedAt: new Date(now - 82800000),
  });
  const gm3 = await Message.create({
    conversationId: group1._id, senderId: mike!._id,
    message: 'Great progress on the sprint! 🎉', seenBy: [],
    createdAt: new Date(now - 1800000), updatedAt: new Date(now - 1800000),
  });
  await Conversation.findByIdAndUpdate(group1._id, { latestMessage: gm3._id, updatedAt: new Date(now - 1800000) });

  // group2: Gaming Squad
  const gg1 = await Message.create({
    conversationId: group2._id, senderId: alex!._id,
    message: "Who's online for some games tonight? 🎮",
    seenBy: [john!._id, alex!._id, emily!._id, chris!._id, david!._id],
    reactions: [{ emoji: '🙋', userId: john!._id, createdAt: new Date() }, { emoji: '🙋', userId: emily!._id, createdAt: new Date() }],
    createdAt: new Date(now - 28800000), updatedAt: new Date(now - 28800000),
  });
  const gg2 = await Message.create({
    conversationId: group2._id, senderId: emily!._id,
    message: 'Anyone up for ranked tonight? 🎮', seenBy: [],
    createdAt: new Date(now - 600000), updatedAt: new Date(now - 600000),
  });
  await Conversation.findByIdAndUpdate(group2._id, { latestMessage: gg2._id, updatedAt: new Date(now - 600000) });

  // conv2
  const c2m = await Message.create({
    conversationId: conv2._id, senderId: mike!._id,
    message: 'Did you see the meeting notes?', seenBy: [john!._id],
    createdAt: new Date(now - 7200000), updatedAt: new Date(now - 7200000),
  });
  await Conversation.findByIdAndUpdate(conv2._id, { latestMessage: c2m._id, updatedAt: new Date(now - 7200000) });

  // conv3
  const c3m = await Message.create({
    conversationId: conv3._id, senderId: john!._id,
    message: 'Let me check...', seenBy: [sarah!._id],
    createdAt: new Date(now - 3600000), updatedAt: new Date(now - 3600000),
  });
  await Conversation.findByIdAndUpdate(conv3._id, { latestMessage: c3m._id, updatedAt: new Date(now - 3600000) });

  // group3
  const g3m = await Message.create({
    conversationId: group3._id, senderId: john!._id,
    message: 'Lunch at 12:30? 🍕', seenBy: [jane!._id, sarah!._id, emily!._id],
    createdAt: new Date(now - 7200000), updatedAt: new Date(now - 7200000),
  });
  await Conversation.findByIdAndUpdate(group3._id, { latestMessage: g3m._id, updatedAt: new Date(now - 7200000) });

  // group4
  const g4m = await Message.create({
    conversationId: group4._id, senderId: chris!._id,
    message: 'Just finished chapter 5, mind-blowing twist! 🤯', seenBy: [],
    createdAt: new Date(now - 3600000), updatedAt: new Date(now - 3600000),
  });
  await Conversation.findByIdAndUpdate(group4._id, { latestMessage: g4m._id, updatedAt: new Date(now - 3600000) });

  console.log('[Seed] Created messages');
  console.log('\n✅  Seed complete!');
  console.log('\n   Test credentials (all share the same password):');
  users.forEach((u) => console.log(`   ${u.email}  /  password123`));
  console.log('');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
