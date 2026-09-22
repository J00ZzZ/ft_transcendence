# Frontend — Results

## Table of Contents

- [Overview](#overview) — Results summary shown after a match ends
- [Files](#files) — Source file inventory
- [Key Types / Interfaces](#key-types--interfaces) — LastResult shape
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagram for results display
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for post-game actions
- [Dependencies](#dependencies) — Internal and external dependencies


---
---


## Overview

The results screen appears **inside the Game page** after a match ends, as a
modal overlay (`ResultsModal`). It shows:

1. **Match summary** — winner, final ranks, podium, per-player pieces in goal.
2. **Outcome handling** — the right label for a victory, a defeat or an abandoned match.
3. **Exit** — returns to the lobby or the home page after the game.

Results render through `src/components/ResultsModal.tsx`, which `Game.tsx` opens when the engine emits `game_ended`.


---
---


## Files

| File | Role |
|------|------|
| `src/components/ResultsModal.tsx` | Results overlay — podium, summary, rank badges, outcome title |
| `src/pages/Game.tsx` | Opens the modal on `game_ended`; holds the socket connection and the `lastResult` state |
| `src/store.tsx` | `setLastResult` / `lastResult` state |


---
---


## Key Types / Interfaces

### LastResult (from store)

```typescript
type LastResult = {
  winner: PlayerColor  // Winning color
  resultDetail: string  // How the game ended
  mode: 'pvp' | 'pve' | 'hotseat'  // Game mode
  playerCount: number  // How many players
  players: Array<{  // List of players
    color: PlayerColor  // Seat color
    username: string  // Player's username
    isBot: boolean  // Whether it is a bot
    piecesInGoal: number  // Pieces finished (0-4)
  }>
  abandoned?: boolean   // abandoned/expired match → no winner/podium
} | null
```


---
---


## Core Logic / Flow

### Results Rendering

Sequence of steps when the engine reports that the game has ended.
```mermaid
sequenceDiagram
    participant Engine as ludo-engine
    participant Game as Game.tsx
    participant Store as useApp()
    participant Modal as ResultsModal

    Engine-->>Game: game_ended { winner, resultDetail }
    Game->>Game: Build endedPlayers (from current view, filter inactive)
    Game->>Store: setLastResult({ winner, resultDetail, mode, playerCount, players })
    Game->>Modal: Open results modal (showResultsModal = true)
    Modal->>Modal: Sort players, find my color, compute the outcome title
    alt abandoned or no real winner
        Modal->>Modal: Show abandoned card (no podium)
    else real winner
        Modal->>Modal: Show podium + rank badges (1st/2nd/3rd/4th)
    end
    User->>Modal: Click "Return to Lobby"
    Modal->>Modal: Close modal
```


---
---


## Logic Paths Summary

### Results Render Path
```
Game.tsx receives 'game_ended'
  ├── Build endedPlayers: view.players (status !== 'inactive')
  │   └── PvP: trim to activeMatch.playerCount if the list is longer
  ├── setLastResult({ winner, resultDetail, mode, playerCount, players })
  └── setShowResultsModal(true)

ResultsModal renders
  ├── result.abandoned OR no player reached 4 pieces in goal
  │   └── Abandoned card — outcome title "abandoned", no podium
  ├── Else podium by rank + rank badges (1st/2nd/3rd/4th)
  ├── outcome title: victory (my color = winner) / defeat / match complete (hotseat)
  └── Return to Lobby button → onReturnToLobby (closes modal)
```


---
---


## Avatar Flags

`LastResult.players` is built from client-side game state and never includes `hasAvatarPhoto`, so `ResultsModal` passes `false` for opponents and bots, and `user?.hasAvatarPhoto ?? false` for the viewer. Passing `undefined` would make `UserAvatar` request the photo URL (Uniform Resource Locator) and log a 404 for every opponent without a photo. See [frontend-components-system.md](frontend-components-system.md) → Implementation Notes.


---
---


## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `store.tsx` | `useApp` → lastResult, setLastResult |
| `components/UserAvatar.tsx` | Player avatars on the podium |
| `utils/audio.ts` | `retroAudio` end-of-game chimes |
| `utils/ranks.ts` | `getRankTier` for rank display |
