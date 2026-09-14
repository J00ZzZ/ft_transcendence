_This project has been created as part of the 42 curriculum by bleow, liyu-her, hang, jow._

# ft_transcendence

## Description

A browser-based multiplayer Ludo platform. Players register or sign in through an external
provider, join a lobby, and play server-authoritative matches against remote opponents, a
local hotseat partner, or an AI. Results feed a persistent profile, a leaderboard, and an
achievement system, and the whole interface is available in multiple languages.

### Key features

- **Server-authoritative Ludo** — dice rolls, turn order, captures, safe squares and home
  entry are all resolved on the server; the client renders, it does not decide
- **Match formats** — Hotseat mode, vs Bot/AI (PVE) mode, vs Multiplayer (PVP) mode
- **Real-time play** — WebSocket transport with live board updates, presence, and reconnect
- **User management** — profiles, avatars, friends, live online status
- **Authentication** — local accounts, OAuth 2.0 sign-in (Google, GitHub, 42), email verification, and two-factor authentication (email code)
- **Progression** — match history, statistics, leaderboard, and achievements
- **Multilingual UI** — English, Malay, and French
- **Notifications, game customization, and extended browser support**

## Instructions

### Prerequisites

- **Docker** and **Docker Compose** (the only runtime requirement).
- **make** (to use the provided build commands).
- A `.env` file at the repo root (see [Configuration (.env)](#configuration-env) below). The stack refuses to start if required values are missing.
- OAuth client IDs and secrets for Google, GitHub, and 42 — **optional**. Local sign-up and login work without them.
- At least one free port: `8443` (HTTPS) was chosen for our project.

### Running

```bash
git clone https://github.com/J00ZzZ/ft_transcendence.git
cd ft_transcendence
make
```

`make` builds the images and starts the stack (the `make env` step it runs first validates the `.env` values). Then open https://localhost:8443 in your browser — accept the self-signed certificate warning on first visit.

### Development mode (hot reload)

```bash
make dev
# App:   http://localhost:8080   (Vite dev server, auto-reloads on save)
# Prod:  https://localhost:8443  (still running alongside, via nginx)
```

### Commands

| Command                           | Effect                                                   |
| --------------------------------- | -------------------------------------------------------- |
| `make env`                        | Validate required `.env` values                          |
| `make` or `make all`              | Build images and start the stack                         |
| `make build`                      | Build images only (runs `make env` first)                |
| `make start`                      | Start the stack (detached)                               |
| `make dev`                        | Vite HMR dev + prod SPA (`compose watch`). ⚠️ Running `make dev` will stop any running prod containers. |
| `make stop` / `make down`         | Stop services / remove containers                        |
| `make logs`                       | Tail service logs                                        |
| `make clean` / `make prune`       | Remove all Docker data / `docker system prune`           |
| `make fclean` / `make re`         | `prune` + `clean` / full rebuild from scratch            |
| `make ngrok-auth`                 | One-time: register `NGROK_AUTHTOKEN` with the ngrok CLI  |
| `make tunnel` / `make tunnel-url` | Start the ngrok tunnel / print its public URL            |
| `make dev-tunnel`                 | Open `make dev` + `make tunnel` in two tabs (macOS only) |
| `make stop-tunnel`                | Kill ngrok and stop the dev containers                   |
| `make lan`                        | LAN mode: start the stack and print your LAN URL         |
| `make tunnel_up`                  | One-shot: build + start + open the tunnel                |

### Access

| URL                       | What it is                                                      | Profile | Exposure                                                                                                                    |
| ------------------------- | --------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `https://localhost:8443`  | The app (via nginx)                                             | default | Public entry — TLS 1.2/1.3, security headers/CSP, nginx rate limits, proxies to JWT-guarded backend & token-verified engine |
| `http://localhost:8080`   | Vite dev server with hot reload                                 | dev     | Dev only — no TLS; keep off untrusted/shared hosts                                                                          |
| `http://localhost:3000`   | Backend API (direct, host-only)                                 | default | Loopback-only publish; JWT/2FA/bcrypt, throttling, no CORS headers (same-origin via nginx only)                             |
| `http://localhost:5555`   | Prisma Studio (database browser)                                | default | Loopback-only publish; no app-level auth — interactive host use only                                                        |
| `wss://<host>/socket.io/` | Game engine connection (same-origin through nginx / Vite proxy) | default | Same-origin `wss` only; engine verifies the Socket.IO handshake JWT before joining rooms                                    |
| `https://derived-sassy-amniotic.ngrok-free.dev` | Ngrok tunnel (online multiplayer) | tunnel | Public entry exposed via ngrok — same nginx TLS/security setup as `localhost:8443`. Fixed URL provided by ngrok |

**Security Hardening measures taken**

- **`8443` (nginx)** is the only intentionally public-facing port (published on all host interfaces). It runs **TLS 1.2/1.3 only** with a self-signed cert and **no plain-HTTP listener**, sets HSTS + security headers + a CSP, disables `server_tokens`, denies hidden-file access, and applies per-IP rate limits (login `5r/m`, auth `60r/m`, refresh `30r/m`, leaderboard `30r/m`) in front of the API.
- **`8080` (Vite)** is active only under the `dev` compose profile (`make dev`). It serves the SPA and proxies `/api` and `/socket.io` without TLS. Disabled in production.
- **`3000` (backend)** is published loopback-only; clients reach it exclusively through nginx's `/api` proxy. Backend hardening: JWT auth in httpOnly cookies, bcrypt password hashes, class-validator on DTOs, and NestJS rate throttling. CORS is intentionally not enabled — every call the SPA makes is same-origin through nginx, so the backend emits no cross-origin headers.
- **Avatar uploads** are screened twice: a MIME whitelist (PNG, JPEG, GIF, WebP, 2 MB cap) checks the client's claim, then a magic-byte check verifies the actual file signature (e.g. `89 50 4E 47` for PNG, `FF D8 FF` for JPEG, `52 49 46 46…57 45 42 50` for WebP) so a mislabelled or truncated upload is rejected before anything is written. The bytes are stored in Postgres as a `Bytes` column via Prisma — the ORM loads them as an opaque buffer and streams them back with the stored `Content-Type`, so the database never interprets or executes the data.
- **`5555` (Prisma Studio)** is a raw database browser with no application-level authentication — its protection is the loopback-only binding plus the Postgres credentials. Used on the host only.
- **`/socket.io/`** is reachable only same-origin: over TLS via nginx (`wss://`) or through the Vite dev proxy — never on a raw `ws://` port. The engine validates the Socket.IO handshake JWT (game-scoped, with role/color) before the socket can join a room.
- **Infrastructure ports not listed** — all published loopback-only; cross-container traffic rides the private `transcendence_network`:
  - **Postgres** (`127.0.0.1:5432`) — requires credentials.
  - **Redis** (`127.0.0.1:6479`) — requires a password.
  - **Engine** (`127.0.0.1:3001`) — additionally gated by JWT token verification: the Socket.IO handshake JWT (game-scoped, with role/color, signed with `JWT_SECRET` and verified in constant time) must be valid before a socket can join a room, so a loopback connection alone is not enough to interact with any game.

### Configuration (.env)

All config lives in the root `.env` (`KEY=VALUE` per line), loaded into containers via compose's `env_file:`. It is gitignored and shared between the team only (via Discord) — `.env.example` is a template we used. `make` validates it and **fails early** if `.env` is missing or any required field is empty. OAuth credentials are added manually from the provider consoles (Google, GitHub, 42).

## Team Information

| Login      | Role(s)                                   | Responsibilities                                                                                                                                                                                 |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `liyu-her` | Product Owner, Project Manager, Developer | Planning sessions, progress and deadline tracking, risk and blocker management, backlog and feature priorities, validating completed work, stakeholder communication — plus feature development. |
| `bleow`    | Tech Lead, Developer                      | Technical architecture, product vision, documentation, stack decisions, code quality and review of critical changes — plus feature development                                                   |
| `hang`     | Developer                                 | Feature implementation, code review, testing, documentation                                                                                                                                      |
| `jow`      | Project Manager, Developer                | Planning sessions, progress and deadline tracking, risk and blocker management — plus feature development                                                                                        |

## Project Management

- **Tools** — Discord and Lark for coordination and task tracking
- **Communication** — Discord for day-to-day, plus in-person working sessions on campus

## Technical Stack

### Frontend

| Technology            | Purpose                                   |
| --------------------- | ----------------------------------------- |
| React 19 + TypeScript | Component model, routing, client state    |
| Vite                  | Build tooling and dev server (hot reload) |
| Tailwind CSS          | Styling                                   |
| i18next               | Localization (English, Malay, French)     |
| Socket.IO client      | Real-time transport                       |

### Backend

| Technology                                 | Purpose                                                    |
| ------------------------------------------ | ---------------------------------------------------------- |
| NestJS                                     | HTTP API, dependency injection, module structure           |
| Socket.IO                                  | WebSocket gateway and room fan-out                         |
| Passport + JWT (httpOnly cookies) + bcrypt | OAuth 2.0 (Google, GitHub, 42), sessions, password hashing |
| Prisma                                     | ORM, schema and migrations                                 |
| nginx                                      | Reverse proxy and TLS termination                          |
| Docker Compose                             | One-command reproducible stack, service isolation          |

### Data

| Technology | Purpose                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| PostgreSQL | Durable data — users, friendships, match history, achievements           |
| Redis      | Live game state — board, dice, turn pointer, matchmaking queue, presence |

### Justification for major technical choices

**Why React + NestJS + PostgreSQL.** The stack the team is most comfortable with, and
explicitly allowed by the subject (unlike Django or Spring), so the team could move fast
and defend every choice in review.

**Why Redis alongside it.** A running match is high-frequency, short-lived state — board
position, current dice value, whose turn it is, who is queued for matchmaking. Writing that
to Postgres on every move would put transactional write load on the database for data that
becomes worthless the moment the game ends. Redis holds it in memory; only the durable
outcome — result, opponents, duration, rating delta — is written to Postgres. Redis also
backs the Socket.IO adapter so broadcasts reach every client regardless of which backend
instance holds the socket.

**Why a server-authoritative game loop.** The client never decides a dice value or validates
a move. Every action is a request the server accepts or rejects against its own copy of the
board, which is what makes the multiplayer and remote-player modules defensible rather than
merely functional.

**Why Socket.IO over plain WebSockets.** It provides automatic reconnection, rooms, and
broadcasting out of the box, which the live board, presence, and reconnect flows build on.

**Why SSE and client-to-server heartbeats.** The notification system uses Server-Sent
Events (SSE), not WebSockets. SSE was chosen specifically to work around an ngrok quirk:
ngrok terminates tunnels that carry no traffic for a short idle window, which would
silently kill a long-lived WebSocket. SSE's persistent HTTP stream, combined with a
client-to-server heartbeat, keeps the connection alive across the tunnel while still
delivering real-time server→client pushes. The heartbeat gives the server a regular
liveness signal; if it stops, the client can reconnect before the user notices a stale
notification feed.

**Why Passport + JWT in httpOnly cookies + bcrypt.** Passport handles OAuth 2.0 callbacks
for Google, GitHub, and 42 — a well-known library, no custom flow. Sessions use a
short-lived JWT (15 minutes) in an httpOnly cookie, so page scripts cannot read it and XSS
cannot steal it. Refresh tokens (7 days) are stored hashed in Redis and rotated on every use
— a leaked token stops working once reused, and can be revoked on logout. Passwords are
hashed with bcrypt, so a database leak does not expose usable credentials.

**Why Prisma.** Prisma keeps the database schema in one place and generates a type-safe
client from it, so queries are checked at compile time and no SQL is written by hand. Schema
changes are kept as committed migrations, so the database can be recreated or upgraded
consistently on any machine.

## Database Schema

![Database schema](frontend/public/Schema_Team-Submit.png)

## Modules

### Major modules

| #   | Module                             | Owner      | How it was implemented                                                                                                                      |
| --- | ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Framework for frontend and backend | `liyu-her` | React on the client, NestJS on the server — framework routing, state and dependency injection rather than developing functions from scratch |
| 2   | Real-time features                 | `bleow`    | Socket.IO gateway with a Redis adapter for cross-instance broadcast; live board updates, presence, and reconnect                            |
| 3   | Standard user management           | `hang`     | Profiles, avatar upload, friend requests, live online status                                                                                |
| 4   | AI opponent                        | `bleow`    | Heuristic move selection — no external model, no black-box library                                                                          |
| 5   | Web-based game                     | `bleow`    | Server-authoritative Ludo: dice RNG, turn order, captures, safe squares and exact-count home entry all resolved server-side                 |
| 6   | Remote players                     | `liyu-her` | Two players on separate machines over the network, with reconnect inside a grace window                                                     |
| 7   | Multiplayer, more than two players | `bleow`    | Four concurrent seats with server-enforced turn order and seat identity derived from the session                                            |

### Minor modules

| #   | Module                            | Owner      | How it was implemented                                                 |
| --- | --------------------------------- | ---------- | ---------------------------------------------------------------------- |
| 1   | ORM                               | `jow`      | Prisma — schema, relations and committed migration history             |
| 2   | Multiple languages                | `liyu-her` | Session-based language switching across English, Malay and French      |
| 3   | Game statistics and match history | `bleow`    | Wins, losses, rating and leaderboard, reconciled against match records |
| 4   | Remote authentication             | `jow`      | OAuth 2.0 sign-in via Google, GitHub, and 42 Intra                     |
| 5   | Two-factor authentication         | `jow`      | Email code verification                                                |
| 6   | Gamification                      | `bleow`    | Achievements, badges and leaderboards                                  |
| 7   | User activity analytics           | `liyu-her` | Insights dashboard                                                     |
| 8   | Notification system               | `hang`     | Notifications on create, update and delete actions                     |
| 9   | Custom minor module               | `jow`      | Ngrok tunneling for exposing the local stack for remote testing        |

### Points calculation

| Module type   | Count | Points each | Total  |
| ------------- | ----- | ----------- | ------ |
| Major modules | 7     | 2           | 14     |
| Minor modules | 9     | 1           | 9      |
| **Total**     |       |             | **23** |

## Individual Contributions

### `liyu-her`

- **Built:** Frontend/backend framework setup (React + NestJS); remote players module (cross-machine play with reconnect); multiple languages module (session-based language switching across English, Malay and French); frontend design and the revamp to frontend v2; user activity analytics dashboard;
- **Challenges:** As team lead, the main challenge was team management — balancing everyone's workload and morale while making sure each member could still learn from the project rather than just clearing tickets. Extracting all user-facing text and data out of the frontend so it could be translated, without breaking the pages being redesigned at the same time

### `bleow`

- **Built:** Real-time features (Socket.IO gateway with Redis adapter for cross-instance broadcast, live board updates, presence, reconnect); AI opponent (heuristic move selection, no external model); web-based game (server-authoritative Ludo — dice RNG, turn order, captures, safe squares, exact-count home entry); game statistics and match history (wins/losses, rating, leaderboard); gamification (achievements, badges, leaderboards); multiplayer module (four-seat, server-enforced turn order);
- **Challenges:** Debugging and smoothly integrating backend with frontend. Learning new web development languages in a short period of time since no prior background (Typescript and basic CSS). Timely and clear communication with team.

### `hang`

- **Built:** Standard user management module (profiles, avatar upload, friend requests, live online status); notification system module (real-time notifications on create, update and delete actions); frontend implementation
- **Challenges:** Balancing deadlines against wanting the frontend to be pixel-perfect

### `jow`

- **Built:** ORM setup (Prisma — schema, relations and committed migration history); remote authentication module (OAuth 2.0 sign-in via Google, GitHub, and 42 Intra); two-factor authentication module (email code verification); Ngrok tunneling for exposing the local stack, including a new auth setup to secure the tunnel.
- **Challenges:** Day-to-day database management and debugging OAuth provider integrations — tedious but constant work

## Resources

### Documentation

All project documentation lives under `docs/`, grouped by category. Each file is listed with the responsibility it covers.

#### Overview

| Document                                       | Responsibility                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)   | System topology, services, request paths, data layer, secrets, make targets, file structure |
| [docs/API-list.md](docs/API-list.md)           | Complete HTTP + WebSocket API reference                                                     |
| [docs/avatar-system.md](docs/avatar-system.md) | Avatar storage, Redis metadata, caching and freshness, seat rendering                       |

#### Deployment

| Document                                       | Responsibility                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [docs/deploy/nginx.md](docs/deploy/nginx.md)   | How nginx fronts every mode (local, LAN, tunnel) without the frontend or backend knowing which one is active |
| [docs/deploy/lan.md](docs/deploy/lan.md)       | LAN mode — reach the app from another device on the same WiFi                                                |
| [docs/deploy/tunnel.md](docs/deploy/tunnel.md) | Reaching the app from the internet via an ngrok tunnel                                                       |

#### Backend (NestJS API)

| Document                                                                                         | Responsibility                                               |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [docs/backend/backend-app-bootstrap-system.md](docs/backend/backend-app-bootstrap-system.md)     | App bootstrap, module wiring, secrets, health check          |
| [docs/backend/backend-auth-module.md](docs/backend/backend-auth-module.md)                       | Registration, login, OAuth, 2FA, sessions, password reset    |
| [docs/backend/backend-user-module.md](docs/backend/backend-user-module.md)                       | Public profiles, game history, avatars                       |
| [docs/backend/backend-friends-module.md](docs/backend/backend-friends-module.md)                 | Friend requests, accept/decline, block/unblock, game invites |
| [docs/backend/backend-match-module.md](docs/backend/backend-match-module.md)                     | Matchmaking (PvP/PvE/hotseat) and game lifecycle             |
| [docs/backend/backend-leaderboard-module.md](docs/backend/backend-leaderboard-module.md)         | Rankings with Redis cache + PostgreSQL fallback              |
| [docs/backend/backend-achievements-module.md](docs/backend/backend-achievements-module.md)       | 13 achievement badges and their evaluation                   |
| [docs/backend/backend-player-stats-module.md](docs/backend/backend-player-stats-module.md)       | Per-player lifetime statistics                               |
| [docs/backend/backend-presence-module.md](docs/backend/backend-presence-module.md)               | Online / in-game / offline presence tracking                 |
| [docs/backend/backend-notification-module.md](docs/backend/backend-notification-module.md)       | Real-time notifications (SSE + Redis pub/sub)                |
| [docs/backend/backend-database-schema-system.md](docs/backend/backend-database-schema-system.md) | PostgreSQL schema — models, enums, relationships, indexes    |
| [docs/backend/backend-seeding-system(Dev).md](<docs/backend/backend-seeding-system(Dev).md>)     | Development/test seed data                                   |

#### Frontend (React SPA)

| Document                                                                                         | Responsibility                                             |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [docs/frontend/frontend-app-bootstrap-system.md](docs/frontend/frontend-app-bootstrap-system.md) | App bootstrap, route categories, auth guard                |
| [docs/frontend/frontend-router-system.md](docs/frontend/frontend-router-system.md)               | Custom client-side router                                  |
| [docs/frontend/frontend-store-system.md](docs/frontend/frontend-store-system.md)                 | Global state (auth, game setup, settings, real-time match) |
| [docs/frontend/frontend-shell-system.md](docs/frontend/frontend-shell-system.md)                 | Shell layout wrapper (side rail + header)                  |
| [docs/frontend/frontend-auth-pages-module.md](docs/frontend/frontend-auth-pages-module.md)       | Login and signup pages                                     |
| [docs/frontend/frontend-auth-extras-module.md](docs/frontend/frontend-auth-extras-module.md)     | 2FA, forgot/reset password pages                           |
| [docs/frontend/frontend-home-module.md](docs/frontend/frontend-home-module.md)                   | Home page — stats, rank, friends, notifications            |
| [docs/frontend/frontend-dashboard-module.md](docs/frontend/frontend-dashboard-module.md)         | Dashboard (superseded by Home)                             |
| [docs/frontend/frontend-lobby-module.md](docs/frontend/frontend-lobby-module.md)                 | Game lobby — mode/seat setup, match creation               |
| [docs/frontend/frontend-game-module.md](docs/frontend/frontend-game-module.md)                   | Real-time gameplay page (Socket.IO)                        |
| [docs/frontend/frontend-results-module.md](docs/frontend/frontend-results-module.md)             | Post-game results card                                     |
| [docs/frontend/frontend-friends-module.md](docs/frontend/frontend-friends-module.md)             | Friends page — list, requests, blocked, invites            |
| [docs/frontend/frontend-leaderboard-module.md](docs/frontend/frontend-leaderboard-module.md)     | Leaderboard page                                           |
| [docs/frontend/frontend-settings-module.md](docs/frontend/frontend-settings-module.md)           | Settings (AccountMenu, game preferences)                   |
| [docs/frontend/frontend-profile-module.md](docs/frontend/frontend-profile-module.md)             | Profile page — stats, history, friends                     |
| [docs/frontend/frontend-components-system.md](docs/frontend/frontend-components-system.md)       | Shared UI components                                       |

#### Ludo Engine (real-time game engine)

| Document                                                                                       | Responsibility                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [docs/ludo-engine/ludo-engine-core-system.md](docs/ludo-engine/ludo-engine-core-system.md)     | Game state machine, turn logic, win conditions     |
| [docs/ludo-engine/ludo-engine-bot-module.md](docs/ludo-engine/ludo-engine-bot-module.md)       | Bot AI decision logic                              |
| [docs/ludo-engine/ludo-engine-lobby-module.md](docs/ludo-engine/ludo-engine-lobby-module.md)   | Lobby management — colors, ready check, game start |
| [docs/ludo-engine/ludo-engine-socket-system.md](docs/ludo-engine/ludo-engine-socket-system.md) | Socket.IO connection and event protocol            |
| [docs/ludo-engine/ludo-engine-redis-system.md](docs/ludo-engine/ludo-engine-redis-system.md)   | Redis persistence + pub/sub                        |

### Linting and Formatting

The codebase uses **ESLint** and **Prettier** to enforce code quality and consistent
formatting. Both are configured to be as compliant with industry standards as possible —
lint failures are meant to signal genuine code-quality issues, not style noise.

#### ESLint

ESLint 10 with a `typescript-eslint` flat config (`eslint.config.mjs`). It extends
`eslint:recommended` and `typescript-eslint:recommended`, plus a curated set of strict
rules chosen to flag real issues without the noise.

- **Plugins:** `typescript-eslint` (type-aware TS rules) and `eslint-plugin-react-hooks`
  (`rules-of-hooks` as error, `exhaustive-deps` as warn — frontend only).
- **Key rules:**
  - `eqeqeq: ['error', 'smart']` — require `===`/`!==`, allow `x != null`.
  - `consistent-type-imports` — enforce `import type` for type-only imports.
  - `no-explicit-any: warn` — flag `any` without blocking legacy code.
  - `no-floating-promises`, `require-await` — catch unawaited promises.
  - `no-non-null-assertion`, `no-unnecessary-type-assertion`,
    `no-redundant-type-constituents`, `no-unnecessary-type-arguments` — reject
    unnecessary type assertions.
  - `prefer-optional-chain`, `no-unnecessary-template-expression` — prefer cleaner
    modern syntax.
  - `prefer-nullish-coalescing`, `no-unnecessary-condition` — null-aware rules, on in
    both frontend and backend (both run strict TS).
- **Profile choices:** omits the noisy `no-unsafe-*` rules in favor of high-signal rules.
  Backend-only and frontend-only blocks handle differences — e.g.
  `no-confusing-void-expression` is off for frontend (React event handlers return
  `setState`), and `prefer-nullish-coalescing` is gated on `strictNullChecks`.

#### Prettier

Prettier 3 via `.prettierrc`, with the `prettier-plugin-tailwindcss` plugin for auto-sorting
Tailwind classes.

| Setting           | Value     | Why                                                        |
| ----------------- | --------- | ---------------------------------------------------------- |
| `semi`            | `true`    | Avoid ASI pitfalls.                                        |
| `singleQuote`     | `true`    | JS/TS industry default.                                    |
| `tabWidth`        | `2`       | Web standard indentation.                                  |
| `useTabs`         | `false`   | Consistent rendering across editors.                       |
| `printWidth`      | `100`     | Readable on modern displays without wrapping too early.    |
| `trailingComma`   | `all`     | Cleaner diffs, safer reordering.                           |
| `bracketSpacing`  | `true`    | Spaces inside `{ foo: bar }`.                              |
| `bracketSameLine` | `false`   | JSX brackets on their own line.                            |
| `arrowParens`     | `always`  | Consistent, avoids `a =>` ambiguity.                       |
| `endOfLine`       | `lf`      | Consistent line endings across contributors.               |

### Assorted References

- Ludo rules: [docs/Ludo_Rules.md](docs/Ludo_Rules.md) — the full ruleset the engine enforces (57-step piece journey, star squares, blockades, captures, exact-count home entry)
- Ludo background: [Wikipedia — Ludo](https://en.wikipedia.org/wiki/Ludo)
- React: [react.dev](https://react.dev)
- TypeScript: [typescriptlang.org/docs](https://www.typescriptlang.org/docs/handbook/intro.html)
- Tailwind CSS: [tailwindcss.com/docs](https://tailwindcss.com/docs/installation/using-vite)
- NestJS: [docs.nestjs.com](https://docs.nestjs.com)
- Socket.IO: [socket.io/docs](https://socket.io/docs)
- Prisma: [prisma.io/docs](https://www.prisma.io/docs)
- Docker Compose: [docs.docker.com/compose](https://docs.docker.com/compose)

### Use of AI

The team used **Claude** and **ChatGPT** during development, in the following areas:

- **Test planning** — deriving an evaluation test plan from the module list, then structuring
  it into per-module test cases and tracking execution against it.
- **Debugging** — narrowing down defects.
- **UI and styling**.
- **Documentation generation** — drafting, structuring, and refining project documentation, including
  the architecture overview, API reference, and the per-module docs under `docs/`.

No AI tool was used to generate a complete module or feature end to end; all generated
material was reviewed and adapted by the team member responsible for that area.

## Known Limitations

- The self-signed certificate triggers a browser warning on first visit (expected — it is a local development setup).
- Ngrok's free tier shows an interstitial page for new visitors.

## License

This project is distributed under the **GPL-3.0** license — see [LICENSE](LICENSE) in the repository root.

## File structure

The full directory and file structure is documented in [docs/architecture.md](docs/architecture.md).
