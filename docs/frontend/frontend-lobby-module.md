# Frontend — Lobby

## Table of Contents

- [Overview](#overview) — Pre-game lobby for seat setup, bot setup and mode selection
- [Files](#files) — Source file inventory
- [Key Types / Interfaces](#key-types--interfaces) — Seat, PlayerCount and BOT_POOL types
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagrams for lobby setup and game start
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for seat management and game start
- [Dependencies](#dependencies) — Internal and external dependencies


---
---


## Overview

The lobby is at `/gamelobby` (`LudoLobby.tsx`), with a separate table/room screen at `/gamelobby/table` (`Lobby.tsx`). Players set up and start a game here. It has:

1. **Seat setup** — player count (2-4, read from the `?mode=` query param) and seat assignment (`you`, `player`, `bot`, or empty).
2. **Bot setup** — add or remove bots.
3. **Mode selection** — PvP (player versus player), PvE (player versus environment) or hotseat.
4. **Match creation** — `LudoLobby.tsx` lists the rooms the caller may enter (`GET /api/games/rooms`; each row carries `mySeat`, where `true` means "you hold a seat here, so this is a REJOIN row" — including a room whose game already started, as long as your seat is still inside its 45 s grace window) and the games they are seated in (`GET /api/games/mine`), and joins them (`POST /api/match/join/:code`, `POST /api/game/:id/rejoin`) or creates a PvP (player versus player) invite (`POST /api/match/pvp/invite`); for local PvE/hotseat play it hands off to the table screen (`/gamelobby/table?mode=…`). The table screen (`Lobby.tsx`) is the one that calls `POST /api/match/create` with the exact `seatColors`, stores the returned `activeMatch` (gameId and engine token) in the store, then navigates to `/game`, where the Socket.IO connection starts.

> **Note:** The lobby communicates with the real backend. Creating a match returns engine credentials (`gameId`, `token`, `engineUrl`), which the Game page uses to connect through Socket.IO.


---
---


## Files

| File | Role |
|------|------|
| `src/pages/LudoLobby.tsx` | Main lobby page (`/gamelobby`) — mode/seat setup, match creation |
| `src/pages/Lobby.tsx` | Table view (`/gamelobby/table`) — room state, ready, invites |


---
---


## Key Types / Interfaces

### Seat

```typescript
export type Seat =
  | { type: 'you' }
  | { type: 'bot'; name: string }
  | { type: 'player'; name: string }
  | { type: 'empty' }
```

### PlayerCount

```typescript
export type PlayerCount = 2 | 3 | 4
```

### BOT_POOL

```typescript
// From theme.ts
export const BOT_POOL = ['Rook', 'Bishop', 'Knight', 'Castle', 'Duke', 'Marla', 'Otto', 'Vex']
```


---
---


## Core Logic / Flow

### 1. Lobby Rendering

Sequence of steps when the lobby page loads.
```mermaid
sequenceDiagram
    participant App as App.tsx
    participant Lobby as LudoLobby.tsx
    participant Router as useRoute()
    participant Store as useApp()

    App->>Lobby: <LudoLobby /> (route /gamelobby)
    Lobby->>Router: useRoute() → { query }
    Lobby->>Store: useApp() → playerCount, seats, settings, user
    Lobby->>Lobby: Render mode/seat setup, bot controls, start button
```

### 2. Start Game Flow

The lobby (`/gamelobby`) sets up the seats and then hands off to the table screen
(`/gamelobby/table`); the table screen creates the match.

```mermaid
sequenceDiagram
    participant User
    participant Lobby as LudoLobby.tsx
    participant Table as Lobby.tsx (table)
    participant API as Backend
    participant Store as AppProvider
    participant Router as navigate

    User->>Lobby: Choose a mode / seats, click start
    Lobby->>Router: navigate('/gamelobby/table?mode=…&bots=…&local=…')
    Note over Lobby: Or join directly — POST /api/match/join/:code, POST /api/game/:id/rejoin, POST /api/match/pvp/invite
    Table->>API: POST /api/match/create { mode, playerCount, botCount, seatColors }
    API-->>Table: { gameId, token, engineUrl, color, inviteCode? }
    Table->>Store: setActiveMatch({ gameId, token, color, mode, playerCount, inviteCode })
    Table->>Router: navigate('/game?gameId=…') → Game connects via Socket.IO
```
```


---
---


## Logic Paths Summary

### Lobby Render Path
```
<LudoLobby /> (/gamelobby)
  ├── useRoute() → query (mode preselect)
  ├── useApp() → playerCount, seats, settings, user
  ├── Render seat grid for seats[0..playerCount)
  │   ├── type = 'you' → host seat
  │   ├── type = 'bot' → bot name + remove button
  │   ├── type = 'player' → named player seat
  │   └── type = 'empty' → "+ Add" card
  └── Render Start button (enabled when a valid setup is chosen)
```

### Match Creation Path
```
LudoLobby.tsx (/gamelobby)
  ├── Local setup → navigate('/gamelobby/table?mode=…&bots=…&local=…')
  ├── Create room → POST /api/match/pvp/invite
  │   └── Refused while GET /api/games/mine is non-empty (you are already seated somewhere)
  ├── Room row → room.mySeat → POST /api/game/:id/rejoin (REJOIN row, own seat)
  │              otherwise → POST /api/match/join/:code (JOIN row)
  ├── Invite-code box → a code matching one of your own row → rejoin
  │                     any other code → POST /api/match/join/:code
  └── Success → setActiveMatch(result) → navigate('/game?gameId=…')

Lobby.tsx (table, /gamelobby/table)
  ├── POST /api/match/create { mode, playerCount, botCount, seatColors }
  │   ├── Error (bad mode / bots in non-pve) → show message
  │   └── Success → setActiveMatch(result)
  └── navigate('/game?gameId=…') → Game connects via Socket.IO
```

### Seat Management Path
```
addBot(i)
  └── Find unused bot name from BOT_POOL → seats[i] = { type: 'bot', name }

removeBot(i) / removePlayer(i)
  └── seats[i] = { type: 'empty' }

addPlayer(i)
  └── seats[i] = { type: 'player', name }
```


---
---


## How Seat Colours Are Sent

For hotseat and PvE, the created game is exactly the occupied seats (the host is always seat 0 / blue, then each added local player or bot in seat order). `Lobby.tsx` therefore sends the **exact** `seatColors` list rather than a count. Without it, the engine's `playerCount`-based default fills the gaps again and brings back seats the user deliberately skipped.


---
---


## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `store.tsx` | `useApp` for mode, seats and game actions |
| `router.tsx` | `navigate('/game')` on start |
| `theme.ts` | `BOT_POOL` constant, inline styles |