# WhatsApp Clone — Backend (MongoDB)

Express + Socket.IO backend with **MongoDB + Mongoose** for all persistent data.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | MongoDB 6+ via Mongoose 8 |
| Real-time | Socket.IO 4 |
| Auth | JWT (access + refresh tokens) |
| Validation | Zod |
| File uploads | Multer |
| Language | TypeScript 5 |

---

## Quick Start

### 1. Prerequisites

- Node.js ≥ 18
- MongoDB running locally **or** a MongoDB Atlas URI

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
MONGODB_URI=mongodb://localhost:27017/whatsapp_clone
JWT_SECRET=<strong-random-string>
JWT_REFRESH_SECRET=<different-strong-random-string>
CLIENT_URL=http://localhost:5173
```

### 4. Seed demo data (optional)

Creates 8 demo users, conversations, and messages:

```bash
npx tsx src/scripts/seed.ts
```

All demo accounts use password `password123`:

| Email | Name |
|---|---|
| john@example.com | John Doe |
| jane@example.com | Jane Smith |
| mike@example.com | Mike Johnson |
| sarah@example.com | Sarah Wilson |
| alex@example.com | Alex Brown |
| emily@example.com | Emily Davis |
| chris@example.com | Chris Lee |
| david@example.com | David Miller |

### 5. Run in development

```bash
npm run dev
```

### 6. Build for production

```bash
npm run build
npm start
```

---

## Project Structure

```
src/
├── config/
│   ├── database.ts       # MongoDB connection
│   ├── env.ts            # Environment config
│   └── runtimeStore.ts   # In-memory socket/online tracking
├── controllers/          # Route handlers
├── helpers/              # JWT, bcrypt, response, upload utils
├── middleware/
│   ├── auth.ts           # JWT middleware + conversation membership
│   └── error.ts          # Global error + 404 handler
├── models/
│   ├── user.model.ts
│   ├── conversation.model.ts
│   ├── message.model.ts
│   └── refreshToken.model.ts
├── routes/               # Express routers
├── scripts/
│   └── seed.ts           # Demo data seeder
├── services/             # Business logic (DB queries)
├── socket/               # Socket.IO event handlers
├── types/                # Shared TypeScript interfaces
└── index.ts              # Entry point
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

### Users
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users/search?q=` | Search users |
| GET | `/api/users/online` | Online user IDs |
| GET | `/api/users/:userId` | Get user by ID |
| PATCH | `/api/users/me/profile` | Update profile |
| PATCH | `/api/users/me/status` | Update status |

### Conversations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/conversations` | List my conversations |
| POST | `/api/conversations` | Start/get DM |
| POST | `/api/conversations/group` | Create group |
| GET | `/api/conversations/:id` | Get single conversation |
| POST | `/api/conversations/:id/read` | Mark as read |
| POST | `/api/conversations/:id/members` | Add member |
| DELETE | `/api/conversations/:id/members/:userId` | Remove member |

### Messages
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/conversations/:id/messages` | Paginated messages |
| POST | `/api/conversations/:id/messages` | Send message (supports file upload via `multipart/form-data`, field name `files`) |
| PATCH | `/api/conversations/:id/messages/:msgId` | Edit message |
| DELETE | `/api/conversations/:id/messages/:msgId` | Delete message |
| GET | `/api/conversations/:id/messages/search?q=` | Search in conversation |
| GET | `/api/conversations/:id/messages/pinned` | Pinned messages |
| POST | `/api/conversations/:id/messages/:msgId/reactions` | Toggle reaction |
| POST | `/api/conversations/:id/messages/:msgId/pin` | Pin message |
| DELETE | `/api/conversations/:id/messages/:msgId/pin` | Unpin message |
| POST | `/api/conversations/:id/messages/:msgId/forward` | Forward message |
| POST | `/api/conversations/:id/messages/:msgId/seen` | Mark seen |
| GET | `/api/messages/search?q=` | Global message search |

---

## Socket.IO Events

Connect with `{ auth: { token: "<access_token>" } }`.

| Event (client → server) | Payload |
|---|---|
| `typing` | `{ conversationId, userId, userName }` |
| `stop_typing` | `{ conversationId, userId, userName }` |
| `mark_seen` | `{ conversationId, messageId }` |
| `toggle_reaction` | `{ conversationId, messageId, emoji }` |
| `pin_message` | `{ conversationId, messageId }` |
| `unpin_message` | `{ conversationId, messageId }` |
| `initiate_call` | `{ conversationId, callType }` |
| `call_accepted` | `{ callerId, conversationId, signal? }` |
| `call_rejected` | `{ callerId, conversationId }` |
| `call_ended` | `{ conversationId, otherUserId }` |
| `call_signal` | `{ toUserId, signal }` |

| Event (server → client) | Payload |
|---|---|
| `new_message` | `{ message, conversation }` |
| `message_seen` | `{ conversationId, messageId, userId, seenBy }` |
| `reaction_updated` | `{ conversationId, messageId, reactions }` |
| `message_pinned` | `{ conversationId, message }` |
| `message_unpinned` | `{ conversationId, message }` |
| `user_online` | `{ userId }` |
| `user_offline` | `{ userId }` |
| `online_users` | `{ userIds }` |
| `incoming_call` | `{ callerId, caller, conversationId, callType }` |
| `call_accepted` | `{ acceptorId, conversationId, signal? }` |
| `call_rejected` | `{ rejectorId, conversationId }` |
| `call_ended` | `{ enderId, conversationId }` |
| `call_signal` | `{ fromUserId, signal }` |

---

## MongoDB Collections

| Collection | Purpose |
|---|---|
| `users` | User accounts (password hashed) |
| `conversations` | DM and group conversations |
| `messages` | All messages with reactions, files, pins |
| `refreshtokens` | Refresh tokens with TTL auto-expiry |

Refresh tokens are automatically deleted from MongoDB via a TTL index — no cron job needed.
