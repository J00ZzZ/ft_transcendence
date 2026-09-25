# Frontend — Home Page

## Table of Contents

- [Overview](#overview) — Main landing page for signed-in users
- [Files](#files) — Source file inventory
- [Key Types / Interfaces](#key-types--interfaces) — Data shapes
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagram of home rendering
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for content display
- [Dependencies](#dependencies) — Internal and external dependencies


---
---


## Overview

The Home page is the main landing page after login (`/home`, full-screen). It also acts as the player dashboard, and shows:

1. **Hero header** — the page title, a greeting with the player's display name, and a live online-player count from `GET /api/presence/online-count` (polled every 15 seconds).
2. **Arcade panel** — a 720×400 canvas that draws the sun, the star field, the horizon grid, four army nodes and the marquee, with a "press start" overlay. Clicking it, or pressing Space or Enter, opens `/gamelobby`.
3. **Friends widget** — read from `GET /api/friends` + `GET /api/friends/requests`, refreshed every 12 seconds; shows live presence status.
4. **Notifications** — bell icon and toasts from `useNotifications()`, which uses an SSE (Server-Sent Events) stream.
5. **Footer** — the copyright line and the Privacy Policy and Terms of Service modals.

> The Home page reads all of its data from the API; there is no mock data. It uses the retro/cyber styling (`RetroNavbar`, `retrowave.css`).


---
---


## Files

| File | Role |
|------|------|
| `src/pages/Home.tsx` | Home page — hero header, arcade panel, friends list, footer |
| `src/hooks/useNotifications.tsx` | Notification bell + toasts (SSE) |
| `src/components/UserAvatar.tsx` | Avatar rendering |
| `src/components/RetroNavbar.tsx` | Top navigation bar |
| `src/components/NotificationToast.tsx` | Toast notifications |


---
---


## Key Types / Interfaces

```typescript
type Friend = {
  id: string  // Unique ID
  username: string  // Player's username
  displayName?: string  // Name shown in the game
  avatarStyle?: any  // Avatar style name
  hasAvatarPhoto?: boolean  // Whether a custom photo is uploaded
  rating?: number  // Player's rating (score)
  friendsSince?: string  // When the friendship started
  status?: 'online' | 'playing' | 'offline'  // Online status
}

type PlayerStats = {
  rating: number  // Player's rating (score)
  highestRating: number  // Best rating ever reached
  totalGames: number  // Total games played
  wins: number  // Games won
  losses: number  // Games lost
  totalCaptures: number  // Total pieces captured
  totalPiecesInGoal: number  // Total pieces that reached home
  avgCapturesPerGame: number  // Average captures per game
}
```


---
---


## Core Logic / Flow

### Home Page Render

Sequence of steps when the home page loads.
```mermaid
sequenceDiagram
    participant App as App.tsx
    participant Home as Home.tsx
    participant API as Backend
    participant Notif as useNotifications()

    App->>Home: <Home /> (full-screen route)
    Home->>Notif: useNotifications() → bell + toasts
    Home->>API: getApi('/api/friends') + '/api/friends/requests'
    Home->>API: getApi('/api/presence/online-count')
    alt data loaded
        API-->>Home: friends + online count
        Home->>Home: Render the arcade panel and the friends list
    else error
        Home->>Home: Render empty/loading states
    end
    Note over Home: The friends list refreshes every 12 seconds; the online count every 15
```

### Arcade attract-mode canvas

The arcade panel renders its scene on one 720×400 canvas: the background gradient, the sun, the star field, the horizon grid, the four army nodes and the marquee. The sun's disc and its scanlines are drawn under a single clip path, so a scanline stroke cannot extend past the disc even though each stroke is wider than the disc near its top.


---
---


## Logic Paths Summary

### Home Render Path
```
<Home />
  ├── useNotifications() → notifications, unreadCount, markRead, markAllRead
  ├── Fetch /api/friends + /api/friends/requests + /api/presence/online-count
  │   ├── Friends → render the friends list with presence
  │   └── Online count → render the hero badge
  ├── Draw the arcade canvas (gradient, sun, stars, grid, army nodes, marquee)
  └── Space/Enter or a click on the arcade panel → navigate('/gamelobby')
```


---
---


## Hero Badge Bar

The hero section shows a live site-wide badge with the number of **online players**, read from `GET /api/presence/online-count` and refreshed every 15 seconds.


---
---


## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `api.ts` | `getApi` for `/api/friends`, `/api/friends/requests`, `/api/presence/online-count` |
| `store.tsx` | `useApp` for user, settings, presence |
| `hooks/useNotifications.tsx` | Real-time notification bell + toasts |
| `router.tsx` | `navigate` to `/gamelobby` and `/profile` |
| `utils/audio.ts` | `retroAudio` sound effects |
| `styles/tw.ts` | The hero, window and arcade class constants |
