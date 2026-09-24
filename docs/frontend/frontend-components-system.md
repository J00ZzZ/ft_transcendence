# Frontend — Shared Components

## Table of Contents

- [Overview](#overview) — Reusable UI (user interface) components used across pages
- [Files](#files) — Source file inventory
- [Key Types / Interfaces](#key-types--interfaces) — Component props and shared helpers
- [Core Logic / Flow](#core-logic--flow) — Mermaid sequence diagrams for each component
- [Logic Paths Summary](#logic-paths-summary) — Decision trees for rendering
- [Rank Tiers (`utils/ranks.ts`)](#rank-tiers-utilsranksts) — Rating to tier mapping used by `RankBadge`
- [Theme-aware Tailwind Utilities (`styles/tw.ts`)](#theme-aware-tailwind-utilities-stylestwts) — The shared utility-class constants
- [Implementation Notes](#implementation-notes) — Portals, compact mode, avatar attributes, CJK (Chinese, Japanese and Korean) text sizing
- [Dependencies](#dependencies) — Internal and external dependencies


---
---


## Overview

The shared components are reusable UI (user interface) building blocks used on several pages. They are:

1. **RetroNavbar** — top navigation bar used by the full-screen pages.
2. **RetroNavbar** — top navigation bar used by every page (logo, nav links, language selector, user menu).
4. **RetroAuthLayout** — centered layout for the authentication pages (login, signup, 2FA, forgot/reset password).
5. **Board / Die** — the Ludo board and the animated die.
6. **UserAvatar / RankBadge** — avatar rendering and rank tier badges.
7. **OAuthButtons** — Google, GitHub and 42 provider buttons.
8. **NotificationBell / NotificationToast** — the notification bell and toasts.
9. **JoinByCode** — invite-code input for joining a game.
10. **ProfileEditModal / RulesModal** — edit-profile dialog and rules popup.
11. **CyberModal / ResultsModal** — cyber-styled modal base and the post-game results overlay.


---
---


## Files

| File | Role |
|------|------|
| `src/components/RetroNavbar.tsx` | Top navigation bar — logo, nav links, language selector, user menu, sign out (used by every page) |
| `src/components/railButton.ts` | Shared rail-button styles — `railButtonStyle(active)` and `railHoverHandlers(active, edge)`, used by the navbar rail buttons |
| `src/components/RetroAuthLayout.tsx` | Retro-styled authentication page container (`tag` + `children`), and `NeonCheck` — the terms tick glyph |
| `src/components/Board.tsx` | Ludo board — tracks, bases, pieces, legal-move highlights |
| `src/components/Die.tsx` | Dice component — face rendering with roll animation |
| `src/components/UserAvatar.tsx` | Avatar image — keyed by the immutable `userId`; requests the photo only when the seat is not a bot and a photo is known to exist (payload flag or a live `avatar_changed` override), otherwise renders the DiceBear default. A failed load marks that id broken for the session so it is not retried; an optional `onPhotoError` callback runs when that happens, so a parent component can show a message (the Profile page uses it to show a warning in the user's language) |
| `src/dicebear.ts` | DiceBear helper — generates an avatar data URI (Uniform Resource Identifier) (`avataaars`/`bottts`/`identicon`) |
| `src/components/RankBadge.tsx` | Rank tier badge based on rating |
| `src/components/OAuthButtons.tsx` | OAuth provider buttons (42, GitHub, Google) |
| `src/components/NotificationBell.tsx` | Bell icon, unread badge and dropdown |
| `src/components/NotificationToast.tsx` | Toast notifications |
| `src/components/JoinByCode.tsx` | Invite-code input for joining a game |
| `src/components/ProfileEditModal.tsx` | Edit-profile dialog |
| `src/components/DeleteAccountModal.tsx` | Delete-account dialog (sets a password first for OAuth-only accounts) |
| `src/components/RulesModal.tsx` | "How to Play" rules popup |
| `src/components/LegalModal.tsx` | Privacy Policy / Terms of Service popup, opened from Home's footer and from the Signup terms link |
| `src/components/MarkdownViewer.tsx` | Renders the markdown legal documents |
| `src/components/CyberModal.tsx` | Cyber-styled modal base (`CyberButton`, `CyberModal`) used for confirmations and dialogs |
| `src/components/ResultsModal.tsx` | Post-game results overlay — podium, rank badges, outcome title, return-to-lobby |
| `src/avatarCache.ts` | Avatar state store, keyed by immutable user id — live `avatar_changed` overrides (`{has, style}`), a remount stamp per user, and a `broken` set so a failed photo is not retried |


---
---


## Key Types / Interfaces

### RetroAuthLayout Props

```typescript
type RetroAuthLayoutProps = {
  tag?: string;          // Optional tagline displayed above the form
  children: ReactNode;   // Form content
}
```

### NeonCheck Props

```typescript
type NeonCheckProps = {
  offsetTop?: boolean;   // Nudges the box down 1px to line up with the first text line
  checked?: boolean;     // Draws the tick and the glow; an empty box when false
  className?: string;    // Extra classes, such as the focus ring Signup passes in
}
```

### Board Component

No props of its own; it reads the game state from `useApp()`.

### Die Component

```typescript
type DieProps = {
  value: number;         // 1-6
  rolling?: boolean;     // If true, shows rolling animation
}
```

### OAuthButtons

No props; it renders the three provider buttons.


---
---


## Core Logic / Flow

### 1. RetroAuthLayout

Sequence of steps when an authentication page renders.
```mermaid
sequenceDiagram
    participant Login as Login.tsx
    participant RetroAuthLayout as RetroAuthLayout.tsx

    Login->>RetroAuthLayout: <RetroAuthLayout tag={t('auth.loginTag')}>
    RetroAuthLayout->>RetroAuthLayout: Render centered container
    RetroAuthLayout->>RetroAuthLayout: Render logo mark (gradient ring)
    RetroAuthLayout->>RetroAuthLayout: Render tagline
    RetroAuthLayout->>RetroAuthLayout: Render children (form)
```

### 2. Board

Sequence of steps when the game board renders.
```mermaid
sequenceDiagram
    participant Game as Game.tsx
    participant Board as Board.tsx

    Game->>Board: <Board pieces={pieces} players={players} legalMoves={legalMoves} onPieceClick={onPieceClick} animating={animating} fx={fx} />
    Board->>Board: Map each piece's logical step to a board cell
    Board->>Board: Render base areas for each color
    Board->>Board: Render track paths (colored cells)
    Board->>Board: Render home stretch + goal area
    Board->>Board: Render pieces for each player
    Board->>Board: Highlight legal moves when dice rolled
```

### 3. Die

Sequence of steps when the die renders.
```mermaid
sequenceDiagram
    participant Game as Game.tsx
    participant Die as Die.tsx

    Game->>Die: <Die value={dice} rolling={rolling} />
    alt rolling = true
        Die->>Die: Apply shake animation CSS
        Die->>Die: Cycle through random face values
    else rolling = false
        Die->>Die: Render static face for value
    end
    Die->>Die: Render 3x3 pip grid for face value
```

### 4. OAuthButtons

Sequence of steps when the provider buttons render.
```mermaid
sequenceDiagram
    participant Login as Login.tsx
    participant OAuth as OAuthButtons.tsx
    participant Browser

    Login->>OAuth: <OAuthButtons />
    OAuth->>OAuth: Render three provider buttons
    loop For each provider
        OAuth->>OAuth: Render icon (42, GitHub, Google)
        OAuth->>OAuth: Render label
    end
    OAuth->>Browser: onClick → window.location.href = '/api/auth/{provider}'
```


---
---


## Logic Paths Summary

### RetroAuthLayout Path
```
<RetroAuthLayout tag={tag}>
  └── Render centered container
       ├── Logo mark (CSS gradient ring)
       ├── Tagline text
       └── {children}
```

### Board Path
```
<Board />
  └── useApp() → mode, seats, dice, rolling, turn
       ├── Calculate geometry for mode
       ├── Render base areas (4 corners)
       ├── Render track cells (colored paths)
       ├── Render home stretches
       ├── Render goal area
       ├── Render pieces
       └── Highlight legal moves
```

### Die Path
```
<Die value={dice} rolling={rolling} />
  ├── rolling = true → shake animation, cycle faces
  └── rolling = false → render static face
       └── Render 3x3 pip grid for value
```

### OAuthButtons Path
```
<OAuthButtons />
  ├── Render 42 button → onClick → '/api/auth/42'
  ├── Render GitHub button → onClick → '/api/auth/github'
  └── Render Google button → onClick → '/api/auth/google'
```

### RetroNavbar Account Popover Path
```
<RetroNavbar /> account button
  ├── Render avatar button with initials
  ├── onClick → toggle popover
  ├── Language option → setLang(lang)
  └── Sign out → logout() → POST /api/auth/logout → navigate('/login')
```


---
---


## Rank Tiers (`utils/ranks.ts`)

`getRankTier(rating, boardRank?)` maps a rating (plus an optional leaderboard position) to one of five tier objects that `RankBadge` renders. Home, Leaderboard, Friends and Profile use it.

| Tier | Constant | Requirement |
|------|----------|-------------|
| MAMEE MONSTER | `RANK_MAMEE` | Top 3 on the leaderboard — a *position* rule that takes precedence over rating |
| MILO DINOSAUR | `RANK_MILO` | rating >= 1350 |
| PADDLE POP | `RANK_PADDLE` | rating 1200-1349 |
| HONEY STARS | `RANK_HONEY` | rating 1000-1199 |
| CHOKI CHOKI | `RANK_CHOKI` | rating < 1000 |

The top tier depends on position, not on points: a player is MAMEE only while they hold a podium spot. The mamee and milo aura glows come from the `BADGE_*_AURA` constants in `styles/tw.ts`.


---
---


## Theme-aware Tailwind Utilities (`styles/tw.ts`)

`src/styles/tw.ts` holds Tailwind class strings that several components share, so the same long list of utility classes is not written out at every place it is used.

Rules that apply to the whole file:

- **Themes are handled in CSS, not in JavaScript.** The `[data-theme]` custom properties live in `retrowave.css`. Each theme change here is an arbitrary `&`-selector variant such as `[[data-theme=win95]_&]:...`. No JavaScript checks the theme.
- **`!` (the important modifier) marks a real specificity conflict.** This happens when the code using the class sets its own inline `background`, `border` or `box-shadow`, or when two utilities of the same specificity depend on stylesheet order (Tailwind does not guarantee that its generated order matches the order inside the className). Every `!` marks a place where the utility without it does not take effect.
- **`@keyframes` and custom easing curves** (`--flicker`) cannot be written as utility classes, so they stay in `retrowave.css` and are referenced with `var()` or arbitrary `animation:` values.
- **State controlled by JavaScript** (open/closed, glitching, an active LED) is written as a literal or conditional class, or as a `data-*` attribute read through a `group-data-` variant.

Per-constant notes:

| Constant | Notes |
|---|---|
| `THEME_TRIGGER_BTN_BASE` | The code using this class sets inline background, border and shadow, so the theme variants need `!`. The variants are scoped to `.retro-floating-dock`, the dock that renders this button. `active` is a literal class set by JavaScript, so `&.active` matches it. |
| `THEME_POPOVER_MENU_BASE` | The `--fs-*` custom properties cover the colours, but win95 and terminal also change the radius, shadow and blur, so those need their own variants with `!`. Open/closed/up/down is JavaScript state (`THEME_POPOVER_MENU_HIDDEN` / `_ACTIVE_DOWN` / `_ACTIVE_UP`); `@keyframes popover-slide-*` stay in CSS. |
| `RETRO_FLOATING_DOCK` | RetroNavbar's `#mainNav`. This element has no inline background, border or shadow, so no `!` is needed — the arbitrary variants already have higher specificity. |
| `CRT_SCREEN` | The "page shell" shared by Home, Profile, Leaderboard, Friends, Lobby, Game and LudoLobby. Every value comes from a custom property, so it follows the theme with no theme logic here. The win95/terminal `.retro-window`, `.window-header` and `.window-body` overrides live in the CSS. |
| `GRID_BACKGROUND` | The animated 3D synthwave grid and sun, shared by RetroAuthLayout and the page shells. The theme `display:none` rules are `&` variants; `@keyframes grid-scroll` stays in CSS. |
| `WINDOW_HEADER` | The theme reskin applies to every page. `!` is required to break the tie with `GAME_WINDOW_HEADER_EXTRA` on Game.tsx. |
| `GAME_WINDOW_HEADER_EXTRA` | The Game.tsx-only header look, identical in every theme until a theme reskin replaces parts of it. `!bg-[#140a35]` beats `WINDOW_HEADER`'s plain default, while `WINDOW_HEADER`'s `!`-marked theme variants (higher specificity) win on win95 and terminal. |
| `RETRO_TICKET_PASS` | LudoLobby's quick-deploy tickets. The win95/terminal overrides apply one property at a time; where two of them set the same property, the later one wins. |
| `ARCADE_START_TITLE` | `whitespace-nowrap` is required: at 1.5px letter-spacing the heading and its spaced arrows are wider than the overlay, so the arrows would wrap onto their own lines. |
| `CYBER_CASSETTE_CHASSIS` | Home's "CYBERSOUND DECK" widget. The theme overrides are `&` variants; the `.lit-*` LED classes are utility strings chosen in JavaScript; `.cyber-deck-key-play.active` is a conditional class. |
| `CYBER_MODAL_OVERLAY` | The most involved conversion. CyberModal's state has to reach many descendants, so the overlay includes `data-modal-state` and `data-glitching`, and the constants read them with `group-data-` variants. The overlay's group is **named** (`group/modal`) because `CyberButton`, which renders inside it, has its own unnamed `group`/`group-hover:` for a separate hover glitch, and an unnamed group matches *any* ancestor. While it was unnamed, hovering anywhere over the modal triggered the button's glitch and the label became garbled; this was confirmed by taking a screenshot, not assumed. `:root { --flicker }` and the three `@keyframes` stay in CSS. The `:not(:disabled)` guard on the hover rules was dropped because no call site passes `disabled`. |
| `CYBER_BTN_PINK` / `_YELLOW` / `_DANGER` | Need `!` on their `--btn-accent`/`--btn-shadow` overrides: `CYBER_BTN_BASE` sets defaults of the same specificity, and those defaults otherwise win no matter what order the classes are joined in. |
| `CYBER_BTN_BACKDROP_SHARED` | `before:!mask-clip-*` / `before:!mask-composite-*` need `!` because the `mask` shorthand utility resets its longhand properties, and Tailwind placed the shorthand after them. Without `!` the bevel cut turned back into a solid fill and the label became unreadable. |
| `TICKET_CONTAINER` / `RESULTS_INVOICE` / `INVOICE_VALUE` | ResultsModal's "vending machine ticket". The values were read with `getComputedStyle()` on the live modal in all three themes: `top-6`, `z-5`, Share Tech Mono, VT323, and the win95/terminal title colour plus the terminal value's text-shadow and font-size. |
| `PAY_TAG_BASE` | win95 and terminal override the border, background and colour regardless of rank, so the order relative to the rank modifiers does not matter (the theme selector has higher specificity than the rank modifier). |
| `BADGE_*_AURA` | RankBadge's fire/plasma glow for the mamee and milo tiers: static `::before`/`::after` layers with their own always-running animation. Because the Tailwind JIT scanner can silently drop rules for a very long combined class string, this constant is checked against the compiled CSS. mamee's `before:` has no `pointer-events-none` and the other three do. |


---
---


## Implementation Notes

- **Overlays rendered through a portal.** `NotificationBell`'s dropdown and `RetroNavbar`'s account popover both render into `<body>`. A high `z-index` cannot escape an ancestor's stacking context (the sticky sidebar's `position: sticky` creates one, which traps even very large z-indices), so the overlays render outside it. Their position comes from the trigger's current `getBoundingClientRect()` instead of CSS anchoring.
- **Avatars are keyed by the immutable user id, and a version marker is appended when the URL changes.** `UserAvatar` takes `userId` (the photo key) and keeps `username` only as the DiceBear seed and alt text, so a display-name rename can never invalidate an avatar URL. It requests `/api/user/id/<userId>/avatar` only when the seat is not a bot **and** a photo is known to exist — from the payload's `hasAvatarPhoto` or from a live `avatar_changed` override in `avatarCache.ts`. Anything else renders the DiceBear default, so a user without a photo never causes a 404 request. **A change also appends `?v=<stamp>`**, because React re-rendering is not enough on its own: a byte-identical image URL can be served from the browser's in-memory image cache without any request, so `no-cache` never gets the chance to revalidate. The stamp value comes from the SSE event (or `Date.now()` for the uploader's own client, so its own view needs no SSE). A failed load records that id in the store's `broken` set, so the session stops retrying it. `ResultsModal` passes no id for opponents (the client-side `LastResult` does not include one), so they render the generated avatar. The full pipeline — storage, the shared Redis record, caching and freshness — is described in [`avatar-system.md`](../avatar-system.md).
- **`DeleteAccountModal` is a two-step dialog.** Accounts created through a provider have no password, so they set one first, because deletion always requires the password. They then confirm with that password and an acknowledgement checkbox. On success the store's `logout()` clears the session and the user lands on `/login`.
- **CJK label sizing (`RetroNavbar` account popover).** CJK (Chinese, Japanese and Korean) glyphs fill the em box, while Latin letters take up roughly half of it, so Latin labels use a smaller px value and look the same size.
- **RetroNavbar compact mode.** Below Tailwind's `xl` breakpoint (1280px) the sidebar collapses to an icon-only rail. The labels are hidden from JavaScript rather than by CSS, because parts of the bar are plain inline styles. Every page that renders the bar uses the same threshold with `w-[88px] xl:w-[270px]`.
- **RetroNavbar track layout.** The nav track uses `overflow-y: auto` only as a fallback. The track is not shifted vertically, because at short window heights a shift pushes the last item over the theme button.


---
---


## Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `RetroAuthLayout` | `theme.ts` | `goldText`, inline styles |
| `Board` | `store.tsx` | `useApp` for game state |
| `Board` | `theme.ts` | `COL`, inline styles |
| `Die` | `theme.ts` | Keyframe CSS for the shake animation, gradient backgrounds |
| `OAuthButtons` | `theme.ts` | `btnOutline` style |
| `RetroNavbar` | `store.tsx` | `useApp` for `user`, `lang`, `setLang`, `logout` |
