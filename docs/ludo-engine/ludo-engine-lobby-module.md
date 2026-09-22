# Ludo Engine — Lobby

## Table of Contents

- [Overview](#overview) — Lobby management
- [Files](#files) — Every source file and its role
- [Key Types / Interfaces](#key-types--interfaces) — Lobby state types
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagrams for the lobby lifecycle and seat reservation
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for each operation
- [Dependencies](#dependencies) — Internal dependencies


---
---


## Overview

The Lobby module handles the pre-game setup: players join and leave, pick
colors, mark ready, and trigger the start.


---
---


## Files

| File | Role |
|------|------|
| `lobby.ts` | `LobbyManager` — color selection (with swap); readiness is part of the engine GameState |


---
---


## Key Types / Interfaces

### Lobby data

The **match metadata hash** (`match:{gameId}`) tracks seats — `player1_id`,
`player1_color`, `status`, `gameType`, etc. Readiness is NOT stored there: the
roster and ready flags live in the engine GameState (`state.players` +
`state.readyPlayers`), which `emitLobbyUpdate` broadcasts to clients.


---
---


## Core Logic / Flow

### 1. Lobby Lifecycle

```mermaid
sequenceDiagram
    participant Player
    participant Lobby as LobbyManager
    participant Engine as LudoEngine (player-handler)

    Player->>Lobby: Pick a color
    alt That color is already taken
        Lobby->>Lobby: Swap the two players' seats
        Lobby->>Lobby: Clear Ready on both colors
    else Color free
        Lobby->>Lobby: Assign the color
        Lobby->>Lobby: Clear Ready on old + new color
    end
    Lobby-->>Player: color_selected / lobby_update

    Player->>Engine: Press "Ready" (player_ready)
    Engine->>Engine: Mark the seat's color ready
    Engine->>Engine: ≥2 active seats and all of them ready?
    alt Yes
        Engine->>Engine: Start the game (WAITING → ACTIVE)
    else Not yet
        Engine-->>Player: lobby_update (keep waiting)
    end
```

### 2. Seat reserve and free

Leaving a waiting room does not delete the seat. The seat keeps its id and colour,
so the player returns to the same colour on rejoin; the slot is only flagged as
left.

| Event | Redis `match:{gameId}` | Engine GameState | Client roster |
|-------|------------------------|------------------|---------------|
| Player leaves without aborting | `reserveMatchSeat()` sets `player<N>_left`; the id and colour stay | seat parked as `inactive` | seat hidden |
| Player presses End Game / abort | `clearMatchSeat()` deletes `player<N>_id`, `player<N>_color`, `player<N>_left` | seat removed | seat free for another player |
| Player rejoins | the backend's `joinMatch` userId lookup finds the reserved slot and returns the same colour | seat back to `active` | seat returns |
| Idle-abort timer fires | the room is gone | — | room closed |

Both methods skip the host's seat (`player1_color`), so the room stays
rejoinable, and both write `idleSince` to restart the room's idle-abort timer.
The `player<N>_left` flag is what keeps the seated count correct, so a reserved
seat cannot hold a room open. See also
[`ludo-engine-core-system.md`](ludo-engine-core-system.md) → Seat statuses.


---
---


## Logic Paths Summary

### Color Selection Path
```
select_color(color)
  ├── Game must be WAITING
  ├── Color out of seat count → error
  ├── Color taken by someone else → swap the two players' seats
  ├── Color free → assign
  ├── Mirror swap into engine GameState (seat identity only, pre-game)
  ├── Clear the Ready flag on both colors involved (re-confirm after a change)
  └── Emit color_selected / lobby_update
```

### Ready Check Path
```
player_ready
  ├── Mark the seat's color ready in engine GameState (state.readyPlayers)
  ├── ≥2 active seats AND every active seat's color is ready?
  │   ├── Yes → start the game (WAITING → ACTIVE)
  │   └── No → keep waiting (lobby_update)
```


---
---


## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `RedisGameStore` | Match seats/colors/status + GameState persistence |
| `EventPublisher` | Publishes lobby events to Redis pub/sub |
| `LudoEngine` | Game state and the ready/start gate (player-handler, join-manager) |
