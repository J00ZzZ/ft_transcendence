# Frontend — Leaderboard

## Table of Contents

- [Overview](#overview) — Global rankings table fed by the leaderboard API
- [Files](#files) — Source file inventory
- [Key Types / Interfaces](#key-types--interfaces) — Data shapes
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagrams for leaderboard rendering
- [Logic Paths Summary](#logic-paths-summary) — Decision trees
- [Dependencies](#dependencies) — Internal and external dependencies

---

## Overview

The Leaderboard page (`/leaderboard`, full-bleed) displays ranked player listings. It provides:

1. **Rankings table** — rank, player (avatar + username), rating, matches, win rate.
2. **Top-3 podium** — highlighted champion/second/third cards.
3. **Current user highlight** — "you" badge on the logged-in user's row.
4. **Counts** — total entries, telemetry/empty states.

> **Note:** The Leaderboard fetches live data from `GET /api/leaderboard?mode=global&limit=50` — no mock data. i18n strings come from `locales/*` under the `leaderboard` namespace.

---

## Files

| File | Role |
|------|------|
| `src/pages/Leaderboard.tsx` | Leaderboard page — podium, rankings table, you-badge |
| `src/components/UserAvatar.tsx` | Player avatars |
| `src/components/RankBadge.tsx` | Rank tier badges |
| `src/utils/ranks.ts` | `getRankTier` rating → tier mapping |

---

## Key Types / Interfaces

### LeaderboardEntry

```typescript
type LeaderboardEntry = {
  rank: number  // Position in the ranking
  username: string  // Player's username
  displayName?: string  // Name shown in the game
  rating: number  // Player's rating (score)
  gamesPlayed: number  // Games played
  wins: number  // Games won
  losses: number  // Games lost
  winRate: number  // Win percentage (0-100)
  avatarStyle?: string  // Avatar style name
}
```

---

## Core Logic / Flow

### Leaderboard Rendering

Sequence of steps when the leaderboard loads.
```mermaid
sequenceDiagram
    participant Page as Leaderboard.tsx
    participant API as Backend

    Page->>API: fetch('/api/leaderboard?mode=global&limit=50', { credentials: 'include' })
    API-->>Page: { entries, total, myRank? }
    Page->>Page: Derive top-3 podium + table rows
    Page->>Page: Highlight current user (myRank)
```

---

## Logic Paths Summary

### Leaderboard Render Path
```
<Leaderboard />
  ├── GET /api/leaderboard?mode=global&limit=50
  │   ├── Success → render podium + table + you-badge
  │   └── Failure → render telemetry/empty state
  └── getRankTier(rating) → tier badge per row
```

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `api.ts` | Typed fetchers |
| `store.tsx` | `useApp` for current user |
| `utils/ranks.ts` | Rank tier badges |
| `i18n.ts` | `useTranslation` (`leaderboard.*` keys) |
