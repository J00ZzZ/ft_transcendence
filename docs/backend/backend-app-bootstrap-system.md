# App Bootstrap Module

## Table of Contents

- [Overview](#overview) — Application entry point, module wiring, and shared infrastructure
- [Files](#files) — Every source file in the module and its role
- [Key Types / Interfaces](#key-types--interfaces) — Configuration and service interfaces
- [API Endpoints](#api-endpoints) — Health check endpoint
- [Core Logic / Flow](#core-logic--flow) — Bootstrap sequence, health check flow, secret resolution
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for bootstrap and health check
- [Dependencies](#dependencies) — npm packages and internal services this module relies on
- [Configuration / Environment](#configuration--environment) — Environment variables and secrets

---

## Overview

The App Bootstrap module is the root of the NestJS application. It does three things:

1. **Starts the server** via `main.ts` — turns on cookie reading, request validation, CORS rules, and a health check endpoint.
2. **Loads every feature module** via `app.module.ts` — imports all 9 feature modules and makes `PrismaService` available to the whole app:
   - `AuthModule` — registration, login, OAuth, 2FA, sessions
   - `UserModule` — user profiles, avatars, game history
   - `FriendsModule` — friends list, requests, presence integration
   - `LeaderboardModule` — ratings and rankings
   - `AchievementsModule` — achievement rules and evaluation
   - `StatsModule` — player statistics
   - `MatchModule` — matchmaking, rooms, ludo-engine callbacks
   - `PresenceModule` — online/offline presence
   - `NotificationModule` — notifications
3. **Handles secrets** via `secrets.ts` — reads config values from small text files (one value per file) with an environment-variable fallback.

---

## Files

| File | Role |
|------|------|
| `main.ts` | Application entry point — creates NestJS app, configures middleware, starts HTTP server on port 3000 |
| `app.module.ts` | Root module — imports all feature modules, registers PrismaService |
| `prisma.service.ts` | Injectable PrismaClient wrapper with `onModuleInit`/`onModuleDestroy` lifecycle hooks |
| `secrets.ts` | Utility functions `secret()` and `requireSecret()` for reading secrets from files or env vars |

---

## Key Types / Interfaces

### PrismaService

```typescript
class PrismaService implements OnModuleInit, OnModuleDestroy {
  db: PrismaClient;  // Exposes the PrismaClient instance
}
```

### Secret Functions

```typescript
function secret(key: string): string | undefined;       // Returns undefined if missing
function requireSecret(key: string): string;             // Throws if missing
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Database connectivity health check |

---

## Core Logic / Flow

### 1. Application Bootstrap Flow

Sequence of steps when the NestJS application starts up — middleware registration, module wiring, and server listen.
```mermaid
sequenceDiagram
    participant Command as Start command (npm run start)
    participant App as App.ts

    Command->>App: Start the backend
    App->>App: Turn on cookie reading
    App->>App: Turn on request validation
    App->>App: Allow the frontend to call the API
    App->>App: Add the /health check endpoint
    App->>App: Listen on port 3000
    App-->>Command: Backend is up and ready
```

### 2. Health Check Flow

Sequence of steps when a client hits `GET /health` — verifies database connectivity and returns status.
```mermaid
sequenceDiagram
    participant User
    participant App as App.ts
    participant DB as Database

    User->>App: Ask for /health
    App->>DB: Run a tiny "is the database alive?" query
    alt Database OK
        DB-->>App: yes
        App-->>User: 200 { status: "ok" }
    else Database down
        DB-->>App: error
        App-->>User: 500 { status: "error" }
    end
```

### 3. Secret Resolution Flow

Sequence of steps when any module requests a secret — tries file system first, falls back to environment variables.
```mermaid
sequenceDiagram
    participant App as App.ts
    participant Secrets as secrets.ts
    participant Files as Secret files (docker)

    App->>Secrets: Ask for a secret, e.g. JWT_SECRET
    Secrets->>Files: Read the secret from the file
    alt File has the secret
        Files-->>Secrets: the value
        Secrets-->>App: the value
    else File missing
        Secrets->>Secrets: Fall back to an environment variable
        alt Env var has it
            Secrets-->>App: the value
        else Both missing
            Secrets-->>App: Throw an error: "Missing secret"
        end
    end
```

### 4. PrismaService Lifecycle

Sequence of steps during PrismaService construction, database connection (`onModuleInit`), and disconnection (`onModuleDestroy`).
```mermaid
sequenceDiagram
    participant App as App.ts
    participant DB as Database

    Note over App,DB: When the app starts
    App->>DB: Open a connection to the database
    DB-->>App: Connected

    Note over App,DB: When the app shuts down
    App->>DB: Close the connection
    DB-->>App: Disconnected
```

---

## Logic Paths Summary

### Bootstrap Path
```
npm run start:dev (or node main.js)
  ├── NestFactory.create(AppModule)
    │   ├── Import AuthModule, UserModule, FriendsModule, LeaderboardModule,
    │   │       AchievementsModule, StatsModule, MatchModule, PresenceModule,
    │   │       NotificationModule
  │   └── Register PrismaService as provider + export
  ├── app.use(cookieParser())
  ├── app.useGlobalPipes(ValidationPipe { whitelist, transform })
  ├── app.enableCors({ origin, credentials })
  ├── Register GET /health handler
  └── app.listen(3000)
```

### Health Check Path
```
GET /health
  ├── prisma.db.$queryRaw`SELECT 1`
  │   ├── Success → 200 { status: 'ok', timestamp }
  │   └── Error   → 500 { status: 'error', timestamp }
```

### Secret Resolution Path
```
requireSecret(key) / secret(key)
  ├── Read /secrets/{key}.txt
  │   ├── File exists → return value
  │   └── File missing → fallback to process.env[key]
  │       ├── Env var exists → return value
  │       └── Env var missing
  │           ├── requireSecret() → throw Error
  │           └── secret() → return undefined
```

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `@nestjs/core` | NestJS framework core |
| `@nestjs/common` | Decorators, pipes, guards |
| `@nestjs/platform-express` | Express adapter |
| `cookie-parser` | Parse cookies from HTTP requests |
| `@prisma/client` | Prisma ORM client |
| `@prisma/adapter-pg` | Prisma PostgreSQL adapter (Prisma 7) |
| `reflect-metadata` | TypeScript decorator support |
| `rxjs` | Reactive extensions for NestJS |

---

## Configuration / Environment

| Variable | Default | Used By |
|----------|---------|---------|
| `NODE_ENV` | `development` | CORS origin selection, cookie `secure` flag |
| `DATABASE_URL` | (from secrets) | PrismaService database connection |
| `SECRETS_DIR` | `/secrets` → `../secrets` → `./secrets` | secrets.ts file lookup path |
| `PORT` | 3000 | HTTP server listen port (hardcoded in main.ts) |