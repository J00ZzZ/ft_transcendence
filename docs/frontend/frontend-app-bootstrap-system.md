# Frontend — App Bootstrap

## Table of Contents

- [Overview](#overview) — Root app component, route categories, and auth guard logic
- [Files](#files) — Source file inventory
- [Key Types / Interfaces](#key-types--interfaces) — Route categories and AppProvider shape
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagram of bootstrap and routing flow
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for route rendering and redirects
- [Dependencies](#dependencies) — Internal and external dependencies

---

## Overview

The app bootstrap layer is responsible for:

1. **Route categories** — splits pages into `SHELL_ROUTES` (wrapped in sidebar + header) and `FULL_ROUTES` (no shell).
2. **Auth guard** — redirects unauthenticated users to `/login`, authenticated users away from public routes, with special handling for account-action routes (verification, password reset, 2FA) that must be reachable even when another account is logged in.
3. **Session bootstrap** — `AppProvider` calls `/api/auth/me` on page load to see if the user is already logged in.
4. **Shell rendering** — wraps shell routes in `Shell` component; currently `SHELL_ROUTES` is empty, so every page renders full-bleed.

---

## Files

| File | Role |
|------|------|
| `src/App.tsx` | Root component — route maps, auth guard, AppProvider wrapper |
| `src/store.tsx` | `AppProvider` context — auth session, login/register/logout/2FA/password-reset actions, game state |

---

## Key Types / Interfaces

### Route Categories

```typescript
/** Screens that render inside the app shell (rail + header). Currently none —
 * every screen renders full-bleed. Kept as a map for future shell-wrapped pages. */
const SHELL_ROUTES: Record<string, () => ReactNode> = {}

/** Full-bleed screens (no shell). */
const FULL_ROUTES: Record<string, () => ReactNode> = {
  '/home': () => <Home />,
  '/leaderboard': () => <Leaderboard />,
  '/friends': () => <Friends />,
  '/profile': () => <Profile />,
  '/login': () => <Login />,
  '/signup': () => <Signup />,
  '/2fa': () => <TwoFactor />,
  '/forgot-password': () => <ForgotPassword />,
  '/reset-password': () => <ResetPassword />,
  '/gamelobby': () => <LudoLobby />,
  '/gamelobby/table': () => <Lobby />,
  '/game': () => <Game />,
}

/** Public routes, can be reached without a session */
const PUBLIC_ROUTES = new Set([
  '/login', '/signup', '/2fa',
  '/forgot-password', '/reset-password'
])
```

### AppProvider State

```typescript
type AppState = {
  user: AuthUser | null  // The logged-in user
  authReady: boolean  // Whether login state is loaded
  // Auth actions
  login: (identifier: string, password: string) => Promise<{ error?: string; pendingToken?: string }>  // Logs the user in
  register: (username: string, password: string, email: string) => Promise<string | null>  // Creates a new account
  verify2fa: (pendingToken: string, code: string) => Promise<string | null>  // Checks the 2FA code
  forgotPassword: (email: string) => Promise<string | null>  // Requests a password reset
  resetPassword: (token: string, password: string) => Promise<string | null>  // Sets a new password
  logout: () => Promise<void>  // Logs the user out
  // 2FA preference
  twoFactor: boolean  // Whether 2FA is on
  toggleTwoFactor: () => void  // Turns 2FA on/off
  // Game setup state
  playerCount: 1 | 2 | 3 | 4  // How many players
  seats: Seat[]          // { you | bot | player | empty }
  dice: number  // Current dice value
  rolling: boolean  // Whether the dice is animating
  turn: number  // Whose turn (index)
  settings: Record<string, boolean>  // Game settings (sound, music, etc.)
  setPlayerCount: (n: PlayerCount) => void  // Changes the player count
  addBot: (i: number) => void  // Adds a bot to a seat
  removeBot: (i: number) => void  // Removes a bot from a seat
  addPlayer: (i: number) => void  // Adds a human player to a seat
  removePlayer: (i: number) => void  // Removes a player from a seat
  startGame: () => boolean  // Starts the game
  roll: () => void  // Rolls the dice
  endTurn: () => void  // Passes the turn
  settingOn: (key: string) => boolean  // Checks if a setting is on
  toggleSetting: (key: string) => void  // Flips a setting
  // Real-time match
  activeMatch: ActiveMatch | null   // from POST /api/match/create
  setActiveMatch: (m: ActiveMatch | null) => void  // Updates the current match
  lastResult: LastResult | null     // finished match snapshot for Results page
  setLastResult: (r: LastResult | null) => void  // Saves finished match results
  // Language
  lang: Lang  // Selected language
  setLang: (l: Lang) => void  // Changes the language
  // Presence
  setPlaying: (playing: boolean) => void  // Marks the user as in-game
}
```

---

## Core Logic / Flow

### Bootstrap and Routing

Sequence of steps from page load to rendered route.
```mermaid
sequenceDiagram
    participant Browser
    participant App as App.tsx
    participant Store as App state
    participant API as Backend

    Browser->>App: Load the page
    App->>Store: Start loading
    Store->>API: Ask "who is logged in?"
    API-->>Store: user or nobody
    Store->>Store: Save it, mark ready
    App->>App: Show login page or home page
```

---

## Logic Paths Summary

### Initial Load Path
```
Browser load
  └── App mounts AppProvider
       └── fetch('/api/auth/me')
            ├── 200 → setUser(user), setAuthReady(true)
            └── 401 → setUser(null), setAuthReady(true)
```

### Route Guard Path
```
useEffect([authReady, known, user, isPublic, hasNotice])
  ├── authReady = false → return null
  ├── !known → navigate(user ? '/home' : '/login')
  ├── !user && !isPublic → navigate('/login')
  ├── user && isPublic && !hasNotice → navigate('/home')
  └── else → render route component
```

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `store.tsx` | `AppProvider`, `useApp`, `AuthUser`, all auth and game actions |
| `router.tsx` | `useRoute`, `navigate` |
| Full-bleed pages | `Home`, `Leaderboard`, `Friends`, `Profile`, `Login`, `Signup`, `TwoFactor`, `ForgotPassword`, `ResetPassword`, `LudoLobby`, `Lobby`, `Game`, `Results` |