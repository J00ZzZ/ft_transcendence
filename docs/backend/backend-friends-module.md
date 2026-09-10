# Friends Module

## Table of Contents

- [Overview](#overview) — Friend request lifecycle and relationship management
- [Files](#files) — Every source file in the module and its role
- [Key Types / Interfaces](#key-types--interfaces) — Friendship status enum and response shapes
- [API Endpoints](#api-endpoints) — All 7 routes with method, path, auth, and description
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagrams for send, accept, decline, list, requests, remove, and block
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for each operation
- [Dependencies](#dependencies) — Internal services this module relies on

---

## Overview

The Friends module manages the friendship lifecycle between users. It supports:

1. **Friend requests** — send a request to another user.
2. **Accept/Decline** — the recipient can accept or decline a pending request.
3. **Listing** — view all friends with their rating and friendsSince date.
4. **Pending requests** — view sent and received pending requests.
5. **Removal** — remove a friend.
6. **Blocking** — block a user.

Friendships have a status field: `pending`, `accepted`, or `blocked`.

---

## Files

| File | Role |
|------|------|
| `friends.controller.ts` | HTTP routes: send, accept, decline, list, requests, remove, block |
| `friends.service.ts` | Business logic: Prisma queries for friendship CRUD |
| `friends.module.ts` | NestJS module — registers controller, service, and PrismaService |

---

## Key Types / Interfaces

### FriendshipStatus Enum

```prisma
enum FriendshipStatus {
  pending    // Request sent, awaiting response
  accepted   // Both users are friends
  blocked    // User has blocked the other
}
```

### Friendship Model

```typescript
{
  id: string;        // Composite ID (e.g. "userId-friendId")
  userId: string;    // User who initiated
  friendId: string;  // Target user
  status: FriendshipStatus;  // Current status
  createdAt: Date;  // When the record was created
}
```

### Friends List Response Shape

```typescript
{
  id: string;  // Unique ID
  username: string;  // Player's username
  avatarStyle: string | null;  // Avatar style name
  rating: number;  // Player's rating (score)
  friendsSince: Date;  // When the friendship started
}
```

### Friend Requests Response Shape

```typescript
{
  sent: Array<{  // Requests I sent
    id: string;  // Unique ID
    userId: string;  // ID of the user this belongs to
    username: string;  // Player's username
    avatarStyle: string | null;  // Avatar style name
    createdAt: Date;  // When the record was created
  }>;
  received: Array<{  // Requests sent to me
    id: string;  // Unique ID
    userId: string;  // ID of the user this belongs to
    username: string;  // Player's username
    avatarStyle: string | null;  // Avatar style name
    createdAt: Date;  // When the record was created
  }>;
}
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/friends/request/:userId` | JWT | Send friend request to target user |
| `POST` | `/api/friends/accept/:requestId` | JWT | Accept a pending friend request |
| `POST` | `/api/friends/decline/:requestId` | JWT | Decline a pending friend request |
| `DELETE` | `/api/friends/remove/:friendId` | JWT | Remove a friend by friend's user ID |
| `GET` | `/api/friends` | JWT | List all friends (optional `?username=` filter) |
| `GET` | `/api/friends/requests` | JWT | List pending sent and received requests |
| `GET` | `/api/friends/blocked` | JWT | List users I have blocked |
| `POST` | `/api/friends/block/:userId` | JWT | Block a user |
| `POST` | `/api/friends/unblock/:userId` | JWT | Unblock a user |
| `POST` | `/api/friends/:friendId/invite` | JWT | Invite a friend to a PvP game (creates a room + seats them) |
| `GET` | `/api/friends/invites/pending` | JWT | Get my pending game invite |
| `POST` | `/api/friends/invites/dismiss` | JWT | Dismiss a pending game invite |

> **Real-time touches:** friend requests and accepted friendships fire a `NotificationService.notify()` push (bell + SSE), and friend lists show live presence status via `PresenceService.getStatuses()`. Game invites create a room and send a `game_invite` notification.

---

## Core Logic / Flow

### 1. Send Friend Request

Sequence of steps when a user sends a friend request to another user.
```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend
    participant DB as Database

    User->>Site: Click "Add friend" on another player
    Site->>Server: POST /api/friends/request/{userId}
    Server->>DB: Look up that player and check your current relationship
    alt Invalid target (yourself / unknown / already friends / already pending / blocked)
        Server-->>Site: Error message
        Site-->>User: Show why it didn't work
    else All checks pass
        Server->>DB: Save a "pending" friend request
        Server-->>Site: Request created
        Site-->>User: Show "friend request sent"
    end
```

### 2. Accept Friend Request

Sequence of steps when a user accepts a pending friend request.
```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend
    participant DB as Database

    User->>Site: Click "Accept" on a friend request
    Site->>Server: POST /api/friends/accept/{requestId}
    Server->>DB: Find the pending request sent to you
    alt Request not found
        Server-->>Site: Error message
        Site-->>User: Show the error
    else Found
        Server->>DB: Mark the request as "accepted"
        Server-->>Site: Friendship created
        Site-->>User: Show the new friend
    end
```

### 3. Decline Friend Request

Sequence of steps when a user declines a pending friend request.
```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend
    participant DB as Database

    User->>Site: Click "Decline" on a friend request
    Site->>Server: POST /api/friends/decline/{requestId}
    Server->>DB: Find the pending request sent to you
    alt Request not found
        Server-->>Site: Error message
        Site-->>User: Show the error
    else Found
        Server->>DB: Delete the request
        Server-->>Site: "Friend request declined"
        Site-->>User: Show "request declined"
    end
```

### 4. List Friends

Sequence of steps when a user lists their friends.
```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend
    participant DB as Database

    User->>Site: Open the Friends page
    Site->>Server: GET /api/friends
    Server->>DB: Load every friendship with status "accepted"
    DB-->>Server: Friends list
    Server-->>Site: For each friend: id, username, avatar style, rating, friendsSince
    Site-->>User: Show the friends list
```

### 5. Remove Friend

Sequence of steps when a user removes a friend.
```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend
    participant DB as Database

    User->>Site: Click "Remove" next to a friend
    Site->>Server: DELETE /api/friends/remove/{friendId}
    Server->>DB: Delete the friendship link between you two
    DB-->>Server: Deleted
    Server-->>Site: "Friend removed"
    Site-->>User: Show the updated friends list
```

### 6. Block User

Sequence of steps when a user blocks another user.
```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend
    participant DB as Database

    User->>Site: Click "Block" on a player
    Site->>Server: POST /api/friends/block/{userId}
    Server->>DB: Save a "blocked" relationship
    alt User is already your friend
        Server->>DB: Also remove the friendship
    end
    Server-->>Site: Blocked
    Site-->>User: Show "user blocked"
```

---

## Logic Paths Summary

### Send Friend Request Path
```
POST /api/friends/request/{userId} (JWT required)
  ├── Check target is self → 400 Bad Request
  ├── Check target exists → 404 Not Found
  ├── Check existing friendship:
  │   ├── Accepted → 400 Already friends
  │   ├── Pending → 400 Request already pending
  │   └── Blocked → 403 Cannot send
  ├── friendship.create({ userId, friendId, status: 'pending' })
  └── 201 (friendship object)
```

### Accept Friend Request Path
```
POST /api/friends/accept/{requestId} (JWT required)
  ├── friendship.findFirst({ id, friendId: userId, status: 'pending' }) → 404 Not Found
  ├── friendship.update({ status: 'accepted' })
  └── 200 (friendship object)
```

### Decline Friend Request Path
```
POST /api/friends/decline/{requestId} (JWT required)
  ├── friendship.findFirst({ id, friendId: userId, status: 'pending' }) → 404 Not Found
  ├── friendship.delete({ id })
  └── 200 { message: 'Friend request declined' }
```

### List Friends Path
```
GET /api/friends (JWT required)
  ├── Find friendships where userId or friendId matches, status = 'accepted'
  ├── Map to { id, username, avatarStyle, rating, friendsSince }
  └── 200 [{ id, username, avatarStyle, rating, friendsSince }]
```

### Remove Friend Path
```
DELETE /api/friends/remove/{friendId} (JWT required)
  ├── Find friendship by (userId, friendId) or (friendId, userId), status = 'accepted' → 404 Not Found
  ├── friendship.delete()
  └── 200 { message: 'Friend removed' }
```

### Block User Path
```
POST /api/friends/block/{userId} (JWT required)
  ├── Check target is self → 400 Bad Request
  ├── Find existing friendship:
  │   ├── Found → update status to 'blocked'
  │   └── Not found → create new with status 'blocked'
  └── 200 (friendship object)
```

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `PrismaService` | Database access (Friendship, User models) |
| `PresenceService` | Live status in friend lists |
| `MatchService` | Create/join rooms for game invites |
| `NotificationService` | Push `friend_request` / `friend_accepted` / `game_invite` notifications |
| `Redis` (ioredis) | Pending game-invite records (`invite:<userId>`) |
| `JwtAuthGuard` | Protects all friend endpoints |