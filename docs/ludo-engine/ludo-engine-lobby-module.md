# Ludo Engine — Lobby

## Table of Contents

- [Overview](#overview) — Lobby management
- [Files](#files) — Every source file and its role
- [Key Types / Interfaces](#key-types--interfaces) — Lobby state types
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagram for the lobby lifecycle
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for each operation
- [Dependencies](#dependencies) — Internal dependencies

---

## Overview

The Lobby module handles the pre-game setup: players join and leave, pick
colors, mark ready, and trigger the start.

---

## Files

| File | Role |
|------|------|
| `lobby.ts` | `LobbyManager` — color selection (with swap), ready check |

---

## Key Types / Interfaces

### Lobby data

The lobby is backed by the Redis **match metadata hash** (`match:{gameId}`),
with fields like `player1_id`, `player1_color`, `readyPlayers`, and `status`.
`LobbyManager.getLobbyState()` reads it and returns the player list with
`{ userId, color, ready }`.

---

## Core Logic / Flow

### 1. Lobby Lifecycle

```mermaid
sequenceDiagram
    participant Player
    participant Lobby as LobbyManager

    Player->>Lobby: Pick a color
    alt That color is already taken
        Lobby->>Lobby: Swap you with the player on that color
    else Color free
        Lobby->>Lobby: Reserve the color for you
    end
    Lobby-->>Player: color_selected

    Player->>Lobby: Press "Ready"
    Lobby->>Lobby: Are all seated players ready with a color?
    alt Yes
        Lobby->>Lobby: Start the game
    else Not yet
        Lobby-->>Player: lobby_update (keep waiting)
    end
```

---

## Logic Paths Summary

### Color Selection Path
```
select_color(color)
  ├── Game must be WAITING
  ├── Color out of seat count → error
  ├── Color taken by someone else → swap colors between the two players
  ├── Color free → assign
  ├── Mirror swap into engine GameState (seat identity only, pre-game)
  └── Emit color_selected / lobby_update
```

### Ready Check Path
```
player_ready
  ├── Mark color ready in match hash
  ├── All seated players have a color AND are ready?
  │   ├── Yes → start the game (WAITING → ACTIVE)
  │   └── No → keep waiting
```

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `RedisGameStore` | Match data (seats, colors, ready flags, status) |
| `EventPublisher` | Publishes lobby events to Redis pub/sub |
| `LudoEngine` | Game state and ready-check integration |
