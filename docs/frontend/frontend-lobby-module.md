# Frontend — Lobby

## Table of Contents

- [Overview](#overview) — Pre-game lobby for seat setup, bot configuration, and mode selection
- [Files](#files) — Source file inventory
- [Key Types / Interfaces](#key-types--interfaces) — Seat, Mode, Difficulty types
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagrams for lobby setup and game start
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for seat management and game start
- [Dependencies](#dependencies) — Internal and external dependencies

---

## Overview

The lobby lives at `/gamelobby` (`LudoLobby.tsx`), with a separate `/gamelobby/table` screen (`Lobby.tsx`) for the table/room view. The lobby is where players configure and launch a game. It provides:

1. **Seat setup** — player count (1-4) and seat assignment (`you`, `player`, `bot`, or empty).
2. **Bot configuration** — add/remove bots.
3. **Mode selection** — PvP, PvE, or hotseat.
4. **Match creation** — calls the backend matchmaking API (`POST /api/match/create`, or the PvP/PvE shortcuts), stores the returned `activeMatch` (gameId + engine token) in the store, then navigates to `/game` where the Socket.IO connection is made.

> **Note:** The lobby is fully wired to the backend. Creating a match returns engine credentials (`gameId`, `token`, `engineUrl`) which the Game page uses to connect via Socket.IO.

---

## Files

| File | Role |
|------|------|
| `src/pages/LudoLobby.tsx` | Main lobby page (`/gamelobby`) — mode/seat setup, match creation |
| `src/pages/Lobby.tsx` | Table view (`/gamelobby/table`) — room state, ready, invites |

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
export type PlayerCount = 1 | 2 | 3 | 4
```

### BOT_POOL

```typescript
// From theme.ts
export const BOT_POOL = ['Rook', 'Bishop', 'Knight', 'Castle', 'Duke', 'Marla', 'Otto', 'Vex']
```

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

Sequence of steps when the user clicks "Start Game".
```mermaid
sequenceDiagram
    participant User
    participant Lobby as LudoLobby.tsx
    participant API as POST /api/match/create
    participant Store as AppProvider
    participant Router as navigate

    User->>Lobby: Click "Start game" (mode = pve/pvp/hotseat)
    Lobby->>API: POST /api/match/create { mode, playerCount, botCount }
    API-->>Lobby: { gameId, token, engineUrl, color, inviteCode? }
    Lobby->>Store: setActiveMatch({ gameId, token, color, mode, playerCount, inviteCode })
    alt mode = pvp
        Lobby->>Router: navigate('/gamelobby/table') (wait for opponent)
    else pve / hotseat
        Lobby->>Router: navigate('/game')
    end
```

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
Start game (pvp / pve / hotseat)
  ├── POST /api/match/create { mode, playerCount, botCount, botColors?, seatColors? }
  │   ├── Error (bad mode / bots in non-pve) → show message
  │   └── Success → setActiveMatch(result)
  ├── pvp → navigate('/gamelobby/table')
  └── pve / hotseat → navigate('/game') → Game connects via Socket.IO
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

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `store.tsx` | `useApp` for mode, seats, and game actions |
| `router.tsx` | `navigate('/game')` on start |
| `theme.ts` | `BOT_POOL` constant, inline styles |