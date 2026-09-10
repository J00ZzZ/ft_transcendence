# Ludo Engine — Core Engine

## Table of Contents

- [Overview](#overview) — Game state machine, turn logic, and win conditions
- [Files](#files) — Source file inventory
- [Key Types / Interfaces](#key-types--interfaces) — GameState, PlayerColor, Piece, events
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagrams for game flow
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for game operations
- [Dependencies](#dependencies) — Internal services this module relies on
- [Configuration](#configuration) — Environment variables

---

## Overview

The engine core is the game's referee: it runs inside the `ludo-engine` service and is the single source of truth for all game state. The engine:

1. **Manages game state** — moves games through `waiting` → `active` → `finished`.
2. **Validates moves** — uses `MoveValidator` to work out which moves are legal.
3. **Handles dice rolls** — enforces turn order, gives a bonus roll on 6, and forfeits the turn on the third consecutive 6.
4. **Tracks pieces** — each piece has a `step` value (-1=exited, 0=prison, 1-51=track, 52-56=home lane, 57=goal).
5. **Detects wins** — the first player to get all 4 pieces home wins.
6. **Saves state** — writes to Redis via `RedisGameStore` so a restart doesn't lose the game.
7. **Serializes operations** — a per-game lock ensures roll/move never run on top of each other.

---

## Files

| File | Role |
|------|------|
| `engine.ts` | `LudoEngine` class — state machine, turn logic, dice rolling, piece movement, per-game locks |
| `types.ts` | Type definitions: `GameState`, `PlayerMeta`, `Piece`, `LegalMove`, `MoveResult`, `GameEvent` |
| `move-validator.ts` | Legal move computation based on board geometry |
| `board-mapper.ts` | Board geometry — safe zones, track positions, goal entries |
| `redis.ts` | `RedisGameStore` — Redis persistence layer |
| `bot.ts` | Heuristic bot AI |
| `player-handler.ts` | Disconnect/reconnect/exit/ready management and turn advance |
| `lobby.ts` | Lobby management — color selection, ready check |
| `index.ts` | Entry point — starts Socket.IO server on port 3001 |

---

## Key Types / Interfaces

### PlayerColor

```typescript
export type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';
```

### Piece

```typescript
export interface Piece {
  id: PieceId;           // e.g. "red-0"
  color: PlayerColor;    // Owner color
  step: number;          // -1=exited, 0=prison, 1-51=track, 52-56=home lane, 57=goal
  isInGoal?: boolean;    // true when step === 57
  isInBase?: boolean;    // true when step <= 0
}
```

### PlayerMeta

```typescript
export interface PlayerMeta {
  color: PlayerColor;    // Seat color
  status: 'active' | 'exited' | 'inactive' | 'disconnected';  // Player lifecycle state
  username: string;      // Seat/display name
  displayName?: string;  // Optional display name
  isBot: boolean;        // Whether this seat is a bot
  isConnected: boolean;  // Whether the player's socket is connected
  piecesInGoal: number;  // Pieces finished (0-4)
  hasRolled: boolean;    // Whether the player rolled this turn
  consecutiveSixes: number;  // Per-player six streak, resets on turn advance
  bonusRoll: boolean;    // Rolled a 6 → rolls again
  isFinished: boolean;   // true when all 4 pieces in goal
  finishedAt?: string;   // ISO timestamp
  stats: { turns: number; captures: number; piecesInGoal: number };  // Per-game counters
}
```

### GameState

```typescript
export interface GameState {
  id: string;                      // Unique game id
  pieces: Piece[];                 // 16 pieces: 4 per player × 4 players
  players: PlayerMeta[];           // Per-seat player info
  currentTurn: PlayerColor;        // Whose turn it is
  consecutiveSixes: number;        // Current 6-streak (third 6 forfeits the turn)
  moveCounter: number;             // Total moves made in the game
  turnPhase: 'WAITING_FOR_ROLL' | 'WAITING_FOR_MOVE';  // Roll phase or move phase
  firstRollOfTurn: boolean;        // True until the six-bonus has been used once during the current turn-holding streak
  pendingLegalMoves: LegalMove[];  // authoritative legal moves after a roll
  pendingDiceValue?: number;       // Dice value from the most recent roll
  pendingIsFirstRoll?: boolean;    // Whether the pending roll was the first of the turn
  disconnectedPlayers: DisconnectState[];  // Players in their disconnect grace period
  status: 'waiting' | 'active' | 'finished';  // Game lifecycle state
  winner?: PlayerColor;            // Winner color when finished
  resultDetail?: string;           // Human-readable finish reason
  resultSubmitted?: boolean;       // prevents duplicate backend submissions
  botBusy?: boolean;               // prevents overlapping bot turns
  readyPlayers: PlayerColor[];     // Players who clicked "ready"
  paused?: boolean;                // Whether the game is paused
  pauseTurnOwner?: PlayerColor;    // Whose turn it was when paused
}
```

### LegalMove & MoveResult

```typescript
export interface LegalMove {
  pieceId: PieceId;    // Which piece can move
  from: number;        // Starting step
  to: number;          // Landing step
  isCapture: boolean;  // Whether this move captures an opponent piece
  isHomeEntry: boolean; // Whether this move enters the home lane
}

export interface MoveResult {
  ply: number;                 // Move number (increments each move)
  color: PlayerColor;          // Player who moved
  diceValue: number;           // The roll that produced the move
  pieceId: PieceId;            // Which piece moved
  from: number;                // Starting step
  path: number[];              // every intermediate step, for step-by-step animation
  to: number;                  // Landing step
  captured: boolean;           // Whether this move captured a piece
  capturedPieceIds?: PieceId[];  // all opponent pieces sent home from the landing square
  enteredHome: boolean;        // Whether the piece entered the home lane
  bonusRoll: boolean;          // Rolled a 6 → rolls again
}
```

### GameEvent

One source of truth for game lifecycle — the engine emits these, and the socket layer relays them:

```typescript
export type GameEvent =
  | { type: 'dice_rolled'; gameId; value; legalMoves; bonusRoll; currentTurn; forfeited? }      // A roll happened; carries the value + legal moves (+ forfeited on third 6)
  | { type: 'piece_moved'; gameId; result: MoveResult }                                         // A piece moved; full MoveResult payload
  | { type: 'game_ended'; gameId; winner; resultDetail }                                        // Game finished; winner + reason
  | { type: 'game_started'; gameId }                                                            // Game transitioned from waiting → active
  | { type: 'player_exited'; gameId; color }                                                    // A player left / was removed
  | { type: 'player_aborted'; gameId; color; username }                                         // A player aborted the game
  | { type: 'player_disconnected'; gameId; color }                                              // A player's connection dropped
  | { type: 'player_reconnected'; gameId; color }                                               // A player reconnected
  | { type: 'color_selected'; gameId; userId; color }                                           // A player picked a color in the lobby
  | { type: 'lobby_update'; gameId; players };                                                  // Lobby seats changed
```

---

## Core Logic / Flow

### 1. Dice Roll

```mermaid
sequenceDiagram
    participant Player
    participant Engine as LudoEngine

    Player->>Engine: Click the die
    Engine->>Engine: Check it is your turn
    Engine->>Engine: Roll a 1-6 and keep count of 6s in a row
    alt Third 6 in a row
        Engine->>Engine: Lose your turn (rule: three 6s = pass)
        Engine-->>Player: dice_rolled (forfeited)
    else Normal roll
        Engine->>Engine: Work out which pieces can move
        Engine-->>Player: dice_rolled (value + movable pieces)
    end
```

### 2. Move Piece

```mermaid
sequenceDiagram
    participant Player
    participant Engine as LudoEngine

    Player->>Engine: Click a piece to move it
    Engine->>Engine: Check the move is legal
    Engine->>Engine: Move the piece, knock out any enemy on that cell
    Engine->>Engine: Did all 4 pieces reach home?
    alt Yes — player wins
        Engine-->>Player: game_ended (winner)
    else No — still playing
        alt Roll was 6 or a capture
            Engine->>Engine: Same player rolls again
        else Normal roll
            Engine->>Engine: Pass the turn to the next player
        end
        Engine-->>Player: piece_moved
    end
```

---

## Logic Paths Summary

### Dice Roll Path
```
roll_dice()
  ├── Validate game active, turnPhase WAITING_FOR_ROLL, caller is current player
  ├── Roll 1-6
  ├── 6 → consecutiveSixes++ ; otherwise reset to 0
  ├── Third consecutive 6 → forfeit turn (forfeited: true), advance, return
  ├── 6 → bonusRoll = true
  ├── pendingLegalMoves = MoveValidator.getLegalMoves(...)
  ├── turnPhase = WAITING_FOR_MOVE
  └── Emit dice_rolled { value, legalMoves, bonusRoll }
```

### Move Piece Path
```
move_piece(pieceId)
  ├── Validate game active and turnPhase = WAITING_FOR_MOVE
  ├── Verify pieceId is in pendingLegalMoves (server snapshot from the roll)
  ├── executeMove → move the piece; resolve any captures immediately (captured pieces → base)
  ├── recordMove (history) + moveCounter++
  ├── Check win condition (all 4 pieces at step 57)
  │   ├── Win → status='finished', emit game_ended
  │   └── No win → sync piecesInGoal
  │       ├── Roll was 6 OR move captured → same player rolls again (bonus roll)
  │       └── Roll 1-5, no capture → advance turn to next player
  ├── Clear pendingLegalMoves + pendingDiceValue
  └── saveGameState; emit piece_moved (+ game_ended if finished)
```

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `MoveValidator` | Legal move computation |
| `BoardMapper` | Board geometry, safe zones, track positions |
| `RedisGameStore` | Redis persistence for game state |
| `player-handler` | Disconnect/reconnect/exit/ready + `advanceTurnInState` |
| `LobbyManager` | Color selection and ready check |

### Tunable constants

Module-level constants in the engine's support files — edit at the top of each file to tweak:

| Constant | File | Default | What it controls |
|----------|------|---------|------------------|
| `DISCONNECT_GRACE_MS` | `player-handler.ts` | 45 s | PvP reconnect window before a disconnected player is pruned |
| `BOT_DISCONNECT_GRACE_MS` | `player-handler.ts` | 1 h | Bot-mode reconnect window before the game auto-aborts |

> `player-handler.ts` adds a hardcoded `+1000` ms buffer to the PvP grace
> period so the prune timer fires just after the reconnect deadline.

---

## Configuration

| Variable | Default | Used By |
|----------|---------|---------|
| `REDIS_HOST` | `redis` | RedisGameStore |
| `REDIS_PORT` | `6479` | RedisGameStore |
| `REDIS_PASSWORD` | (from secrets) | RedisGameStore |
| `BACKEND_URL` | `http://backend:3000` | ResultSubmitter |
| `ENGINE_API_KEY` | (from secrets) | ResultSubmitter |
