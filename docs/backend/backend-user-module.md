# User Module

## Table of Contents

- [Overview](#overview) — User profiles, game history, and avatar management
- [Files](#files) — Every source file in the module and its role
- [Key Types / Interfaces](#key-types--interfaces) — Response shapes
- [API Endpoints](#api-endpoints) — Profile, games, avatar CRUD
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagrams
- [Logic Paths Summary](#logic-paths-summary) — Decision trees
- [Dependencies](#dependencies) — Internal services this module relies on

---

## Overview

The User module manages public user profiles, game history, and avatar images.

1. **Public profile** — `GET /api/user/:username` returns profile stats.
2. **Game history** — `GET /api/user/:username/games` returns paginated past games.
3. **Avatar upload** — `POST /api/user/avatar` accepts a multipart image (max 2 MB, PNG/JPEG/GIF/WebP).
4. **Avatar retrieval** — `GET /api/user/:username/avatar` returns the binary image.
5. **Avatar deletion** — `DELETE /api/user/avatar` removes the custom avatar.

---

## Files

| File | Role |
|------|------|
| `user.controller.ts` | HTTP routes: profile, games, avatar CRUD |
| `user.service.ts` | Business logic: Prisma queries for user data |
| `user.module.ts` | NestJS module — registers controller and service |

---

## Key Types / Interfaces

### PublicProfileResponse

```typescript
{
  id: string;  // Unique ID
  username: string;  // Player's username
  displayName: string;  // Name shown in the game
  avatarStyle: string;      // Avatar style (from User)
  rating: number;           // Rating (from User)
  highestRating: number;    // Peak rating (from User)
  wins: number;  // Games won
  losses: number;  // Games lost
  winStreak: number;  // Wins in a row right now
  bestWinStreak: number;  // Longest winning streak ever
  botWins: number;  // Wins against bots
  humanWins: number;  // Wins against humans
  hasAvatarPhoto: boolean;  // Whether a custom photo is set (from avatarPhotoContentType)
  createdAt: string;  // When the record was created
  status: 'online' | 'playing' | 'offline';  // From PresenceService (Redis)
}
```

### GameHistoryItem

```typescript
{
  gameId: string;  // ID of the game
  status: 'COMPLETED' | 'ABANDONED';  // Current status
  gameType: 'PVP' | 'PVE';  // Game mode
  color: 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';  // Seat color
  rank: number;  // Position in the ranking
  piecesCaptured: number;  // Pieces knocked off
  piecesInGoal: number;  // Pieces finished (0-4)
  ratingDelta: number;  // Rating earned for this game (never negative)
  startedAt: string;  // When the game started
  endedAt: string | null;  // When the game ended
  participants: Array<{  // Everyone who played
    username: string;  // Player's username
    displayName: string;  // Player's display name
    avatarStyle: string;  // Avatar style name
    hasAvatarPhoto: boolean;  // Whether the player has a custom avatar photo
    color: string;  // Seat color
    rank: number;  // Position in the ranking
    piecesInGoal: number;  // Pieces finished (0-4)
  }>;
}
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/user/:username` | None | Get public profile by username |
| `GET` | `/api/user/:username/games` | None | Get paginated game history |
| `POST` | `/api/user/avatar` | JWT | Upload avatar image |
| `GET` | `/api/user/:username/avatar` | None | Retrieve avatar image |
| `DELETE` | `/api/user/avatar` | JWT | Delete current user's avatar |

---

## Core Logic / Flow

### 1. Get Public Profile

```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend
    participant DB as Database

    User->>Site: Open someone's profile page
    Site->>Server: GET /api/user/{username}
    Server->>DB: Look up that player
    alt Player not found
        Server-->>Site: 404 Not found
        Site-->>User: Show "player not found"
    else Found
        Server-->>Site: Public profile (rating, stats, no password)
        Site-->>User: Show the profile page
    end
```

### 2. Get Game History

```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend
    participant DB as Database

    User->>Site: Scroll to the match history section
    Site->>Server: GET /api/user/{username}/games?page=1&limit=20
    Server->>DB: Load that player's finished games
    DB-->>Server: Game history
    Server-->>Site: One page of games + page info
    Site-->>User: Show the game history list
```

### 3. Upload Avatar

```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend

    User->>Site: Pick a new avatar picture
    Site->>Server: POST /api/user/avatar (upload the image)
    Server->>Server: Check the file is under 2 MB and an allowed image type
    Server->>Server: Save the picture on the profile
    Server-->>Site: "Avatar uploaded"
    Site-->>User: Show the new avatar
```

### 4. Get Avatar

```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend

    User->>Site: Open a page that shows avatars
    Site->>Server: GET /api/user/{username}/avatar
    alt Player has no avatar
        Server-->>Site: 404 Not found
        Site-->>User: Show the default avatar
    else Has an avatar
        Server-->>Site: The image file
        Site-->>User: Show the picture
    end
```

### 5. Delete Avatar

```mermaid
sequenceDiagram
    participant User
    participant Site as Your App
    participant Server as Backend

    User->>Site: Click "Remove my avatar"
    Site->>Server: DELETE /api/user/avatar
    Server->>Server: Delete the saved picture
    Server-->>Site: "Avatar deleted"
    Site-->>User: Show the default avatar again
```

---

## Logic Paths Summary

### Get Public Profile Path
```
GET /api/user/:username
  ├── user.findUnique({ username })
  │   ├── null → 404
  │   └── found → return profile (exclude password_hash)
```

### Get Game History Path
```
GET /api/user/:username/games?page=&limit=
  ├── gameParticipant.findMany({ where: { user: { username } }, include: [game, user] })
  ├── Map to GameHistoryItem[] (each includes gameType, rank, piecesCaptured,
  │   piecesInGoal, ratingDelta, participants with avatarStyle from user)
  └── Return { games, pagination: { page, limit, total, totalPages } }
```

### Upload Avatar Path
```
POST /api/user/avatar (JWT)
  ├── FileInterceptor('avatar') — max 2MB, allowed: png/jpeg/gif/webp
  ├── user.update({ avatarPhoto: buffer, avatarPhotoContentType: mime })
  └── 200 { message: 'Avatar uploaded', contentType }
```

### Get Avatar Path
```
GET /api/user/:username/avatar
  ├── getAvatar(username) via User.avatarPhoto
  │   ├── null → 404
  │   └── found → res.set(Content-Type), send binary (Cache-Control: 1 day)
```

### Delete Avatar Path
```
DELETE /api/user/avatar (JWT)
  ├── user.update({ avatarPhoto: null, avatarPhotoContentType: null })
  └── 200 { message: 'Avatar deleted' }
```

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `PrismaService` | Database access (User, GameParticipant, Game models) |
| `JwtAuthGuard` | Protects avatar write/delete endpoints |