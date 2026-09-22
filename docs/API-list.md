# **API List**

Complete reference of all HTTP and WebSocket APIs in the project. Updated 14 Sep 2026


---
---


## **Legend**

| Icon | Meaning |
|---|---|
| 🔒 | Requires JWT in `token` cookie (set by login/register) |
| 🌐 | WebSocket event (Socket.IO) |
| 🤖 | Called by ludo-engine (backend-to-backend) |

> **Auth note:** All 🔒 endpoints authenticate via the `token` httpOnly cookie. No `Authorization: Bearer` header is used.


---
---


## **Error responses**

An error response has one of two shapes:

| Shape | When | Body |
|---|---|---|
| **Default** | NestJS's own exceptions (anything not listed below) | `{ "statusCode": 400, "message": "…", "error": "Bad Request" }` |
| **With a code** | An error or notice that the user reads in their own language | `{ "code": "SOME_CODE", "message": "…" }` |

- **`code`** is a fixed identifier. The frontend uses it to find a translation named `errors.<CODE>` (in `frontend/src/locales/*`) and shows that text in the user's language. If a code has no translation yet, the English `message` is shown instead. `translateErrorCode()` in `api.ts` does the translation, and both the `apiFetch` helpers and the auth store call it.
- **`message`** is always plain English, so a code with no translation never shows a technical identifier to the user.
- **Validation errors** are built by the `ValidationPipe` `exceptionFactory` in `main.ts`. For the fields listed in that file it adds a `VALIDATION_*` code; for every other field it returns the default NestJS body.

**Error codes:**

*Auth*

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_USERNAME_TAKEN` | 409 | Username already registered |
| `AUTH_EMAIL_TAKEN` | 409 | Email already registered |
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong username/email or password |
| `AUTH_RESET_LINK_INVALID` | 401 | Reset link invalid or expired |
| `AUTH_CODE_INVALID` | 401 | 2FA code invalid or expired |
| `AUTH_NOT_AUTHENTICATED` | 401 | No valid session |
| `AUTH_SESSION_EXPIRED` | 401 | Session expired — log in again |
| `AUTH_DISPLAY_NAME_TAKEN` | 409 | Display name already taken |
| `AUTH_CURRENT_PASSWORD_INCORRECT` | 401 | Current password wrong |
| `AUTH_DELETE_CONFIRM_REQUIRED` | 400 | Deletion not confirmed |
| `AUTH_DELETE_SET_PASSWORD` | 403 | Set a password before deleting |
| `AUTH_PROVIDER_LINKED` | 409 | Provider linked to another user |
| `AUTH_PROVIDER_NOT_LINKED` | 404 | Provider not linked to this account |
| `AUTH_KEEP_ONE_SIGNIN` | 403 | Must keep at least one sign-in method |
| `AUTH_PASSWORD_UPDATED` | 200 | Notice: password changed, other devices signed out |

*Validation (400)*

| Code | Field |
|---|---|
| `VALIDATION_USERNAME_FORMAT` | `username` — 3-20 chars, letters/numbers/underscore |
| `VALIDATION_CODE_FORMAT` | `code` — 6 digits |
| `VALIDATION_DISPLAY_NAME_LENGTH` | `displayName` — 1-30 characters |
| `VALIDATION_DISPLAY_NAME_CHARS` | `displayName` — contains a character that is not allowed |

*User / Avatar*

| Code | HTTP | Meaning |
|---|---|---|
| `USER_NOT_FOUND` | 404 | User does not exist |
| `AVATAR_FILE_REQUIRED` | 400 | No file in the upload |
| `AVATAR_INVALID_TYPE` | 400 | File is not a valid image (mapped to `profile.fileTypeError`) |

*Friends*

| Code | HTTP | Meaning |
|---|---|---|
| `FRIEND_INVITE_SELF` | 400 | Cannot invite yourself |
| `NOT_FRIENDS_WITH_USER` | 403 | Not friends with that user |
| `FRIEND_REQUEST_SELF` | 400 | Cannot send a request to yourself |
| `FRIEND_ALREADY` | 400 | Already friends |
| `FRIEND_REQUEST_PENDING` | 400 | Request already pending |
| `FRIEND_BLOCKED` | 403 | Cannot send — user is blocked |
| `FRIEND_REQUEST_NOT_FOUND` | 404 | Friend request not found |
| `FRIEND_NOT_FOUND` | 404 | Friendship not found |
| `FRIEND_BLOCK_SELF` | 400 | Cannot block yourself |
| `FRIEND_BLOCK_NOT_FOUND` | 404 | Blocked record not found |

*Match / Lobby*

| Code | HTTP | Meaning |
|---|---|---|
| `MATCH_MODE_REQUIRED` | 400 | `mode` must be pvp, pve, or hotseat |
| `MATCH_BOTS_PVE_ONLY` | 400 | Bots only in PvE games |
| `MATCH_PLAYER_COUNT_RANGE` | 400 | Player count must be 2, 3 or 4 |
| `MATCH_BOT_COUNT_RANGE` | 400 | Bot count must be from 0 to playerCount - 1 |
| `MATCH_PVP_NO_BOTS` | 400 | PvP mode cannot have bots |
| `MATCH_PVE_NEEDS_BOT` | 400 | PvE mode needs at least 1 bot |
| `MATCH_HOTSEAT_NO_BOTS` | 400 | Hot seat mode cannot have bots |
| `MATCH_PVP_MIN_PLAYERS` | 400 | PvP mode needs at least 2 players |
| `MATCH_SEAT_COLORS_LENGTH` | 400 | `seatColors` has the wrong number of items |
| `MATCH_HOST_BLUE` | 400 | Host (first seat) must be blue |
| `MATCH_BOT_COLORS` | 400 | `botColors` must match `botCount` |
| `MATCH_PLAYER_COUNT_2_4` | 400 | Player count must be 2 or 4 |
| `MATCH_OWN_INVITE` | 400 | Cannot join your own invite |
| `MATCH_INVITE_INVALID` | 404 | Invite code not found or expired |
| `MATCH_GAME_NOT_FOUND` | 404 | Game not found |
| `MATCH_ALREADY_STARTED` | 403 | Game already started |
| `MATCH_PVP_ONLY_JOIN` | 403 | Only PvP rooms can be joined |
| `MATCH_ROOM_FULL` | 403 | Room is full |
| `MATCH_NOT_PLAYER` | 403 | You are not a player in this game |
| `MATCH_SEAT_EXPIRED` | 403 | The seat is finalized (grace expired / End Game) — the player can never rejoin it |
| `MATCH_PVP_ONLY_INVITE` | 403 | Only PvP rooms can be invited to |

> Not every backend error has a code yet. When an error has no `code`, the frontend shows its English `message` instead.


---
---


## **Table of Contents**

### **HTTP APIs — Backend (NestJS)**

1. **[Auth — Account & Sessions](#1-auth--account--sessions)** — Registration, email verification, login, 2FA verify, refresh, logout, who am I
   - [`POST /api/auth/register`](#post-apiauthregister) — Create a new account (an email-verification link is sent)
   - [`GET /api/auth/verify-email`](#get-apiauthverify-email) — Confirm your email address via the emailed link
   - [`POST /api/auth/login`](#post-apiauthlogin) — Log in with username/email + password (returns a 2FA prompt if enabled)
   - [`POST /api/auth/2fa/verify`](#post-apiauth2faverify) — Enter the 6-digit code emailed to you to finish logging in
   - [`POST /api/auth/refresh`](#post-apiauthrefresh) — Silently get a new access token when the current one expires
   - [`POST /api/auth/logout`](#post-apiauthlogout) — Log out and clear your session cookies
   - [`GET /api/auth/me`](#get-apiauthme) — See who the current session belongs to

2. **[Auth — Profile & Password](#2-auth--profile--password)** — Password reset, profile read/update, change password, delete account
   - [`POST /api/auth/forgot-password`](#post-apiauthforgot-password) — Request a password-reset link by email
   - [`POST /api/auth/reset-password`](#post-apiauthresetpassword) — Set a new password using the token from the reset email
   - [`GET /api/auth/profile`](#get-apiauthprofile) — Get your full profile (email, linked OAuth providers, has password)
   - [`PATCH /api/auth/profile`](#patch-apiauthprofile) — Update your username, display name, or email
   - [`PATCH /api/auth/profile/password`](#patch-apiauthprofilepassword) — Change your password while logged in
   - [`DELETE /api/auth/profile`](#delete-apiauthprofile) — Permanently delete your account (password-verified)

3. **[Auth — 2FA](#3-auth--2fa)** — Read and toggle two-factor authentication
   - [`GET /api/auth/2fa`](#get-apiauth2fa) — Check whether 2FA is enabled on your account
   - [`PATCH /api/auth/2fa`](#patch-apiauth2fa) — Turn two-factor authentication on or off

4. **[Auth — OAuth (Google / GitHub / 42)](#4-auth--oauth-google--github--42)** — Sign in with a third-party provider
   - [`GET /api/auth/google`](#get-apiauthgoogle) — Log in with Google
   - [`GET /api/auth/google/callback`](#get-apiauthgooglecallback) — Google OAuth redirect target (browser only)
   - [`GET /api/auth/github`](#get-apiauthgithub) — Log in with GitHub
   - [`GET /api/auth/github/callback`](#get-apiauthgithubcallback) — GitHub OAuth redirect target (browser only)
   - [`GET /api/auth/42`](#get-apiauth42) — Log in with your 42 (intra) account
   - [`GET /api/auth/42/callback`](#get-apiauth42callback) — 42 OAuth redirect target (browser only)

5. **[User](#5-user)** — Public profiles, game history, avatar management
   - [`GET /api/user/:username`](#get-apiuserusername) — Look up a player's public profile
   - [`GET /api/user/:username/games`](#get-apiuserusernamegames) — View a player's past game history
   - [`POST /api/user/avatar`](#post-apiuseravatar) — Upload a custom avatar image
   - [`GET /api/user/id/:userId/avatar`](#get-apiuseriduseridavatar) — Fetch a player's avatar image
   - [`DELETE /api/user/avatar`](#delete-apiuseravatar) — Remove your custom avatar

6. **[Match — Matchmaking](#6-match--matchmaking)** — Create/join PvP, PvE, hotseat games
   - [`POST /api/match/pvp/invite`](#post-apimatchpvpinvite) — Create a private PvP room with an invite code to share
   - [`POST /api/match/join/:code`](#post-apimatchjoincode) — Join a private PvP room using an invite code
   - [`POST /api/match/pve`](#post-apimatchpve) — Start a single-player game against bots
   - [`POST /api/match/create`](#post-apimatchcreate) — Create any game (PvP / PvE / hotseat) with full options

7. **[Game Actions — Room](#7-game-actions--room)** — Ready, exit, abort, rejoin, invite
   - [`POST /api/game/:id/ready`](#post-apigameidready) — Mark yourself ready in a room so the game can start
   - [`POST /api/game/:id/exit`](#post-apigameidexit) — Leave the post-game lobby
   - [`POST /api/game/:id/abort`](#post-apigameidabort) — Cancel a game that hasn't started yet
   - [`POST /api/game/:id/rejoin`](#post-apigameidrejoin) — Reconnect to a room you're seated in (e.g. after a page refresh)
   - [`POST /api/game/:id/invite`](#post-apigameidinvite) — Invite a friend into your waiting PvP room

8. **[Game Actions — Browse](#8-game-actions--browse)** — List games/rooms, find your rooms
   - [`GET /api/games/rooms`](#get-apigamesrooms) — Browse open (joinable) PvP rooms
   - [`GET /api/games/mine`](#get-apigamesmine) — List rooms you are seated in

9. **[Game End (engine callback)](#9-game-end-engine-callback)** — Engine reports game start/end
   - [`POST /api/game/end`](#post-apigameend) — (engine) Report a finished game; triggers scoring, ratings, achievements
   - [`POST /api/game/:id/started`](#post-apigameidstarted) — (engine) Mark a game as started once the ready check passes

10. **[Leaderboard](#10-leaderboard)** — Global rankings
   - [`GET /api/leaderboard`](#get-apileaderboard) — View the global rankings (optionally highlight your own rank)

11. **[Achievements](#11-achievements)** — Achievement progress and re-check
   - [`GET /api/achievements`](#get-apiachievements) — View your achievement progress and unlock targets
   - [`POST /api/achievements/check`](#post-apiachievementscheck) — Re-evaluate your achievements (silent backfill after rule changes)

12. **[Stats](#12-stats)** — Lifetime player statistics
   - [`GET /api/stats`](#get-apistats) — View your lifetime stats (rating, wins, losses, captures, …)

13. **[Friends — Requests](#13-friends--requests)** — Send/accept/decline friend requests
   - [`POST /api/friends/request/:userId`](#post-apifriendsrequestuserid) — Send a friend request to another user
   - [`POST /api/friends/accept/:requestId`](#post-apifriendsacceptrequestid) — Accept a pending friend request
   - [`POST /api/friends/decline/:requestId`](#post-apifriendsdeclinerequestid) — Decline a pending friend request
   - [`GET /api/friends/requests`](#get-apifriendsrequests) — View pending sent/received friend requests

14. **[Friends — Manage](#14-friends--manage)** — List, remove, block, unblock friends
   - [`DELETE /api/friends/remove/:friendId`](#delete-apifriendsremovefriendid) — Remove a friend
   - [`GET /api/friends`](#get-apifriends) — List your friends (optional `?username=` filter)
   - [`POST /api/friends/block/:userId`](#post-apifriendsblockuserid) — Block a user
   - [`GET /api/friends/blocked`](#get-apifriendsblocked) — List users you have blocked
   - [`POST /api/friends/unblock/:userId`](#post-apifriendsunblockuserid) — Unblock a user

15. **[Friends — Game Invites](#15-friends--game-invites)** — Invite friends to games, pending/dismiss
   - [`POST /api/friends/:friendId/invite`](#post-apifriendsfriendidinvite) — Invite a friend to a PvP game
   - [`GET /api/friends/invites/pending`](#get-apifriendsinvitespending) — Check whether you have a pending game invite
   - [`POST /api/friends/invites/dismiss`](#post-apifriendsinvitesdismiss) — Dismiss your pending game invite

16. **[Presence](#16-presence)** — Online/offline heartbeat
   - [`POST /api/presence/heartbeat`](#post-apipresenceheartbeat) — Tell the server you're online (sent ~every 20s while the app is open)
   - [`DELETE /api/presence/heartbeat`](#delete-apipresenceheartbeat) — Mark yourself offline (on logout)

17. **[Notifications](#17-notifications)** — Live stream + unread list + read state
   - [`GET /api/notifications/stream`](#get-apinotificationsstream) — Open a live stream of new notifications (SSE)
   - [`GET /api/notifications`](#get-apinotifications) — List your unread notifications (bell dropdown on load)
   - [`PATCH /api/notifications/:id/read`](#patch-apinotificationsidread) — Mark a single notification as read
   - [`POST /api/notifications/read-all`](#post-apinotificationsread-all) — Mark all notifications as read

18. **[Health](#18-health)** — Backend/database health check
   - [`GET /health`](#get-health) — Check the backend is up (verifies database connectivity)

### WebSocket APIs — Ludo Engine

19. **[Connection](#19-connection)** — Connect to the game engine with a match token
20. **[Client → Server Events](#20-client--server-events-emit)** — What the client sends: join, roll dice, move pieces, ready, end game
21. **[Server → Client Events](#21-server--client-events-on)** — What the client receives: state updates, dice/move results, game end
22. **[End-to-End Flow](#22-end-to-end-flow)** — A complete walkthrough from login to a finished game


---
---


## HTTP APIs — Backend (NestJS)

Base URL: `http://localhost:3000` (or `http://backend:3000` from Docker)

All endpoints return JSON. The backend runs on port 3000.

Auth is handled via **httpOnly cookies**:
- `token` — short-lived access token (15 min), set by login/register/refresh
- `refresh_token` — long-lived refresh token (7 days), path-scoped to `/api/auth`

No manual `Authorization` header is needed for cookie-authenticated requests.


---
---


### 1. Auth — Account & Sessions


---
---


#### `POST /api/auth/register`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Create a new user account. Sends a verification email; no session is set until the email is verified.

**Headers:** None  
**Body:**

```json
{
  "username": "string (required, 3-20 chars, alphanumeric + underscore)",
  "email": "string (required, valid email)",
  "password": "string (required, 12-72 chars, must contain uppercase, lowercase, number, and special character)"
}

```

**Response:**

```json
{
  "message": "Account created — check your email to verify your address."
}

```

**Errors:** 409 `AUTH_USERNAME_TAKEN` / `AUTH_EMAIL_TAKEN` if the username or email exists; 400 with a `VALIDATION_*` code if the body fails validation. See [Error responses](#error-responses).


---
---


#### `GET /api/auth/verify-email`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Redeem an emailed verification link. Redirects to the SPA with a query param on success.

**Headers:** None  
**Query:** `token` — the 64-char hex token from the email link  
**Response:** 302 redirect to `{FRONTEND_URL}/login?verified=1` or `?error=invalid-verification-link`


---
---


#### `POST /api/auth/login`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Authenticate. With 2FA enabled, returns a `pendingToken` and emails a code; with 2FA disabled, sets the session cookies.

**Headers:** None  
**Body:**

```json
{
  "identifier": "string (required — username or email)",
  "password": "string (required)"
}

```

**Response (2FA disabled):**

```json
{
  "twoFactorRequired": false,
  "user": { "id": "uuid", "username": "string" }
}

```

**Response (2FA enabled):**

```json
{
  "twoFactorRequired": true,
  "pendingToken": "hex-string"
}

```

**Errors:** 401 if invalid credentials, 403 if email not verified.


---
---


#### `POST /api/auth/2fa/verify`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Redeem a 2FA code emailed during login. Sets session cookies on success.

**Headers:** None  
**Body:**

```json
{
  "pendingToken": "string (64-char hex)",
  "code": "string (6 digits)"
}

```

**Response:**

```json
{
  "user": { "id": "uuid", "username": "string" }
}

```

**Errors:** 401 `AUTH_CODE_INVALID` if the code is invalid/expired or there were too many attempts; 400 `VALIDATION_CODE_FORMAT` if the code is not 6 digits.


---
---


#### `POST /api/auth/refresh`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Silent re-authentication. Trade a valid refresh token for a fresh access token + rotated refresh token.

**Headers:** None (refresh_token cookie is sent automatically)  
**Body:** None  
**Response:**

```json
{
  "user": { "id": "uuid", "username": "string" }
}

```

**Errors:** 401 if refresh token is missing, expired, or revoked.


---
---


#### `POST /api/auth/logout`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Revoke the refresh token and clear both cookies.

**Headers:** None  
**Body:** None  
**Response:**

```json
{
  "ok": true
}

```


---
---


#### `GET /api/auth/me`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Return the current user from the access token cookie.

**Headers:** 🔒 (requires `token` cookie)  
**Response:** the same shape as `GET /api/auth/profile`'s `user` (the handler delegates to the same service method):

```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "displayName": "string",
    "email": "string | null",
    "hasPassword": true,
    "avatarStyle": "bottts",
    "hasAvatarPhoto": false,
    "providers": ["google"]
  }
}

```


---
---


### 2. Auth — Profile & Password


---
---


#### `POST /api/auth/forgot-password`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Email a password-reset link. Response is identical whether or not the email is registered (no account enumeration).

**Headers:** None  
**Body:**

```json
{
  "email": "string (valid email)"
}

```

**Response:**

```json
{
  "message": "If that email is registered, a reset link is on its way."
}

```


---
---


#### `POST /api/auth/reset-password`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Redeem a reset token and set a new password.

**Headers:** None  
**Body:**

```json
{
  "token": "string (64-char hex)",
  "password": "string (12-72 chars, same policy as registration)"
}

```

**Response:**

```json
{
  "message": "Password updated — you can log in with it now."
}

```

**Errors:** 401 if token is invalid or expired.


---
---


#### `GET /api/auth/profile`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Return the full profile for the logged-in user (used by the Edit-Profile card).

**Headers:** 🔒 (requires `token` cookie)  
**Response:**

```json
{
  "user": {
    "id": "uuid",
    "username": "username",
    "displayName": "Display Name",
    "email": "user@example.com",
    "hasPassword": true,
    "providers": ["google", "github", "42"]
  }
}

```


---
---


#### `PATCH /api/auth/profile`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Update the logged-in user's profile (display name / username, email, etc.).

**Headers:** 🔒 (requires `token` cookie)  
**Body:** (any subset of the editable fields, validated by `UpdateProfileDto`)

```json
{
  "username": "new_username",
  "displayName": "New Display Name",
  "email": "new@example.com"
}

```

**Response:** the updated profile / success message. A bad `displayName` returns 400 with `VALIDATION_DISPLAY_NAME_LENGTH` or `VALIDATION_DISPLAY_NAME_CHARS`.


---
---


#### `PATCH /api/auth/profile/password`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Change the password while logged in (requires the current password).

**Headers:** 🔒 (requires `token` cookie)  
**Body:**

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}

```

**Response:** a localized notice; changing the password also signs out every other device.

```json
{
  "code": "AUTH_PASSWORD_UPDATED",
  "message": "Password updated — other devices were signed out."
}

```


---
---


#### `DELETE /api/auth/profile`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Permanently delete the current account. Requires explicit confirmation plus the
account password (OAuth-only accounts must set a password first via the
change-password flow).

**Headers:** 🔒 (requires `token` cookie)  
**Body:**

```json
{
  "currentPassword": "current-password",
  "confirm": true
}

```

**Response:** clears both session cookies, so the browser ends logged out.

```json
{ "message": "Account permanently deleted" }

```

**Errors:** 400 if `confirm` is not `true`; 403 if the account has no password set; 401 if the password is wrong.


---
---


### 3. Auth — 2FA


---
---


#### `GET /api/auth/2fa`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Get the current user's 2FA preference.

**Headers:** 🔒 (requires `token` cookie)  
**Response:**

```json
{
  "twoFactorEnabled": true
}

```


---
---


#### `PATCH /api/auth/2fa`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Toggle the user's 2FA preference.

**Headers:** 🔒 (requires `token` cookie)  
**Body:**

```json
{
  "enabled": true
}

```

**Response:**

```json
{
  "twoFactorEnabled": true
}

```


---
---


### 4. Auth — OAuth (Google / GitHub / 42)


---
---


#### `GET /api/auth/google`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Redirect to Google OAuth consent screen.

**Headers:** None  
**Response:** 302 redirect.


---
---


#### `GET /api/auth/google/callback`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Google OAuth callback. Do not call directly.

**Headers:** None  
**Response:** 302 redirect to `FRONTEND_URL`.


---
---


#### `GET /api/auth/github`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Redirect to GitHub OAuth consent screen.

**Headers:** None  
**Response:** 302 redirect.


---
---


#### `GET /api/auth/github/callback`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

GitHub OAuth callback. Do not call directly.

**Headers:** None  
**Response:** 302 redirect to `FRONTEND_URL`.


---
---


#### `GET /api/auth/42`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

Redirect to 42 (intra) OAuth consent screen.

**Headers:** None  
**Response:** 302 redirect.


---
---


#### `GET /api/auth/42/callback`

**Source:** `backend/src/auth/auth.controller.ts` — AuthModule

42 OAuth callback. Do not call directly.

**Headers:** None  
**Response:** 302 redirect to `FRONTEND_URL`.


---
---


### 5. User


---
---


#### `GET /api/user/:username`

**Source:** `backend/src/user/user.controller.ts` — UserModule

Get a user's public profile.

**Headers:** None  
**Path:** `:username` = username string  
**Response:**

```json
{
  "id": "uuid",
  "username": "string",
  "displayName": "string",
  "createdAt": "ISO-date-string",
  "avatarStyle": "string",
  "rating": 0,
  "highestRating": 0,
  "wins": 0,
  "losses": 0,
  "winStreak": 0,
  "bestWinStreak": 0,
  "botWins": 0,
  "humanWins": 0,
  "hasAvatarPhoto": false,
  "status": "online | playing | offline"
}

```

**Errors:** 404 if user not found.


---
---


#### `GET /api/user/:username/games`

**Source:** `backend/src/user/user.controller.ts` — UserModule

Get a user's game history.

**Headers:** None  
**Path:** `:username` = username string  
**Query Params:**
| Param | Type | Default | Max |
|---|---|---|---|
| `page` | integer | `1` | — |
| `limit` | integer | `20` | `100` |

**Response:**

```json
{
  "games": [
    {
      "gameId": "uuid",
      "status": "COMPLETED | ABANDONED",
      "gameType": "PVP | PVE",
      "color": "RED | GREEN | YELLOW | BLUE",
      "rank": 1,
      "piecesCaptured": 3,
      "piecesInGoal": 4,
      "ratingDelta": 5,
      "startedAt": "ISO-date-string",
      "endedAt": "ISO-date-string",
      "participants": [
        {
          "username": "string",
          "displayName": "string",
          "avatarStyle": "bottts",
          "hasAvatarPhoto": false,
          "color": "RED",
          "rank": 1,
          "piecesInGoal": 4
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}

```

**Errors:** 404 if user not found.


---
---


#### `POST /api/user/avatar`

**Source:** `backend/src/user/user.controller.ts` — UserModule

Upload an avatar image (max 2 MB, PNG/JPEG/GIF/WebP).

**Headers:** 🔒 (requires `token` cookie)  
**Content-Type:** `multipart/form-data`  
**Body:** `avatar` file field  
**Response:**

```json
{
  "message": "Avatar uploaded"
}

```

**Errors:** 400 `AVATAR_FILE_REQUIRED` (no file) or `AVATAR_INVALID_TYPE` (not a PNG/JPEG/GIF/WebP); 400 if the file exceeds 2 MB.


---
---


#### `GET /api/user/id/:userId/avatar`

**Source:** `backend/src/user/user.controller.ts` — UserModule

Retrieve a user's custom avatar image, keyed by the **immutable user id** — a display-name rename can therefore never invalidate an avatar URL.

**Headers:** None  
**Path:** `:userId` = user id  
**Response:** Binary image data with `Content-Type` set to the stored MIME type, served with `Cache-Control: public, no-cache, no-transform` plus an `ETag`. The base URL is stable, so an unchanged photo is answered `304` on revalidation. When a change is announced (the SSE `avatar_changed` event, or the uploader's own client) the client appends `?v=<stamp>`, which forces a real fetch — a byte-identical URL can otherwise be served from the browser's in-memory image cache without any request, so `no-cache` alone would never revalidate.

**Errors:** `404` when no custom avatar is set, sent with `Cache-Control: no-store` so a "no photo" answer is never cached and replayed.

> Full pipeline — storage layers, the shared Redis record, caching and freshness rules, seat
> rendering: [`avatar-system.md`](avatar-system.md).


---
---


#### `DELETE /api/user/avatar`

**Source:** `backend/src/user/user.controller.ts` — UserModule

Delete the current user's custom avatar.

**Headers:** 🔒 (requires `token` cookie)  
**Response:**

```json
{
  "message": "Avatar deleted"
}

```


---
---


### 6. Match — Matchmaking

All match endpoints return `{ gameId, token, engineUrl }` (plus `inviteCode` for invite games).

- `gameId`: UUID of the new/pending match
- `token`: JWT to use when connecting to ludo-engine via Socket.IO
- `engineUrl`: Same-origin WebSocket URL (derived from `FRONTEND_URL`, e.g. `ws://localhost:8443`) — the browser connects to its own origin and nginx/Vite forwards `/socket.io/` to the engine
- `inviteCode`: 6-char shareable code (invite games only)

To connect to the engine:

```js
const io = require('socket.io-client');
const socket = io(window.location.origin, { // same-origin → nginx → ludo-engine
  auth: { token: '<token-from-response>' },
  transports: ['websocket'],
});

```


---
---


#### `POST /api/match/pvp/invite`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Create a PvP invite game with a shareable code.

**Headers:** 🔒 (requires `token` cookie)  
**Body:** None (all fields optional)

**Response:**

```json
{
  "gameId": "uuid",
  "inviteCode": "ABCD12",
  "token": "jwt-string",
  "engineUrl": "ws://localhost:8443",
  "color": "blue",
  "mode": "pvp",
  "playerCount": 4
}

```

**Notes:**
- Share `inviteCode` via chat/friend list.
- Recipient joins via `POST /api/match/join/:code`.


---
---


#### `POST /api/match/join/:code`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Join a PvP game by invite code.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:code` = 6-char invite code  
**Body:** None

**Response:**

```json
{
  "gameId": "uuid",
  "token": "jwt-string",
  "engineUrl": "ws://localhost:8443",
  "color": "red",
  "mode": "pvp",
  "playerCount": 4
}

```

**Errors:** 404 `MATCH_INVITE_INVALID` if the code is not found/expired; 403 `MATCH_ALREADY_STARTED` if the game started; 400 `MATCH_OWN_INVITE` if joining your own invite.


---
---


#### `POST /api/match/pve`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Start a PvE (vs bot) game.

**Headers:** 🔒 (requires `token` cookie)  
**Body:**

```json
{
  "playerCount": 2
}

```

**Response:**

```json
{
  "gameId": "uuid",
  "token": "jwt-string",
  "engineUrl": "ws://localhost:8443",
  "color": "blue",
  "mode": "pve",
  "playerCount": 2
}

```

**Notes:**
- Game is `ACTIVE` immediately.
- Bots fill remaining slots automatically.
- `playerCount` must be 2 or 4.


---
---


#### `POST /api/match/create`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Unified match creation — supports PvP, PvE, and hotseat modes.

**Headers:** 🔒 (requires `token` cookie)  
**Body:**

```json
{
  "mode": "pvp",
  "playerCount": 2,
  "botCount": 0,
  "botColors": ["red", "green"],
  "seatColors": ["yellow", "blue"]
}

```

**Response:**

```json
{
  "gameId": "uuid",
  "token": "jwt-string",
  "engineUrl": "ws://localhost:8443",
  "color": "blue",
  "mode": "pvp",
  "playerCount": 2,
  "inviteCode": "ABCD12"
}

```

**Notes:**
- `mode` is **required** and must be `pvp`, `pve`, or `hotseat` (no silent fallback).
- `playerCount` accepts 2-4; `botCount` must be 0 to `playerCount-1`. Bots are only allowed in PvE games.
- `botColors` / `seatColors` (optional string arrays) can override the default slot colors. Seat `color` is otherwise assigned by the server.


---
---


### 7. Game Actions — Room


---
---


#### `POST /api/game/:id/ready`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Signal that the current player is ready.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:id` = gameId  
**Body:** None  
**Response:**

```json
{
  "message": "Player ready",
  "gameId": "uuid"
}

```


---
---


#### `POST /api/game/:id/exit`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Acknowledge leaving the game (after game has ended).

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:id` = gameId  
**Body:** None  
**Response:**

```json
{
  "message": "Exited game",
  "gameId": "uuid"
}

```


---
---


#### `POST /api/game/:id/abort`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Cancel an unstarted game (while still in WAITING state).

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:id` = gameId  
**Body:** None  
**Response:**

```json
{
  "message": "Game cancelled",
  "gameId": "uuid"
}

```

**Errors:** 404 if game not found, 403 if user is not a player.


---
---


#### `POST /api/game/:id/invite`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Invite a friend into a WAITING PvP room.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:id` = gameId  
**Body:**

```json
{ "friendId": "user-id" }

```


---
---


### 8. Game Actions — Browse


---
---


#### `GET /api/games/rooms`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

List open (WAITING PvP) rooms that can be joined.

**Headers:** 🔒 (requires `token` cookie)  
**Response:** Array of joinable room summaries.


---
---


#### `GET /api/games/mine`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

List rooms (WAITING/ACTIVE) the current user is seated in — used to rejoin after a refresh. An
ACTIVE room whose seat the engine has **finalized** (grace expired / End Game — `PlayerMeta.status`
is `exited`) is filtered out via `isSeatFinalized()`, so a departed player is not offered a REJOIN
MATCH button they can no longer use.

**Headers:** 🔒 (requires `token` cookie)  
**Response:** Array of the user's room summaries.


---
---


#### `POST /api/game/:id/rejoin`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Rejoin a room the user is seated in (after a refresh).

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:id` = gameId  
**Body:** None  
**Response:**

```json
{
  "gameId": "uuid",
  "token": "jwt-string",
  "engineUrl": "ws://localhost:8443"
}
```

**Errors:** 404 if game not found, 403 `MATCH_NOT_PLAYER` if the caller holds no seat, and 403
`MATCH_SEAT_EXPIRED` when the seat has been finalized (the engine parked every piece at `step = -1`),
so no fresh token is minted for a seat that can never move again.


---
---


### 9. Game End (engine callback)


---
---


#### `POST /api/game/end`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Called by ludo-engine when a game finishes. 🤖 Does not require JWT — authenticated via `x-engine-key` header.

**Headers:** `x-engine-key: <ENGINE_API_KEY>`  
**Body:**

```json
{
  "gameId": "uuid",
  "participants": [
    {
      "userId": "string (or 'ludo-bot')",
      "color": "'RED'|'GREEN'|'YELLOW'|'BLUE'",
      "rank": 1,
      "piecesCaptured": 3,
      "piecesInGoal": 4
    }
  ]
}

```

**Response:**

```json
{
  "message": "Game processed",
  "gameId": "uuid"
}

```

**Errors:** 400 if `gameId` missing, or `participants` missing / < 2 entries. Re-sending the same `gameId` is safe (idempotent — returns `"Game already processed"` without double-awarding points).

**Side effects:**
- Writes `game` + `game_participant` rows to Postgres
- Updates the player's `User` row: `rating`, `winStreak`, `bestWinStreak`, `wins`, `losses`, `botWins`, `humanWins`, etc. (scoring via `ratingDeltaFor()`)
- Evaluates achievements for all participants (fires unlock notifications)
- Updates Redis `leaderboard:global` sorted set


---
---


#### `POST /api/game/:id/started`

**Source:** `backend/src/match/match.controller.ts` — MatchModule

Called by ludo-engine once the ready-check passes and the game transitions to ACTIVE. 🤖 Authenticated via `x-engine-key` header.

**Headers:** `x-engine-key: <ENGINE_API_KEY>`  
**Path:** `:id` = gameId  
**Body:** None  
**Response:**

```json
{ "ok": true }

```

- Deletes `match:{gameId}` from Redis


---
---


### 10. Leaderboard


---
---


#### `GET /api/leaderboard`

**Source:** `backend/src/leaderboard/leaderboard.controller.ts` — LeaderboardModule

Get paginated leaderboard rankings.

**Headers:** 🔒 JWT (required) — the logged-in user is highlighted via `myRank`  
**Query Params:**
| Param | Type | Default | Max |
|---|---|---|---|
| `mode` | `global` \| `ranked` \| `casual` \| `bot` | `global` | — |
| `page` | integer | `1` | — |
| `limit` | integer | `20` | `100` |

**Response:**

```json
{
  "entries": [
    {
      "rank": 1,
      "username": "string",
      "displayName": "string",
      "rating": 1500,
      "gamesPlayed": 42,
      "wins": 30,
      "losses": 12,
      "draws": 0,
      "winRate": 71,
      "avatarStyle": "bottts",
      "hasAvatarPhoto": false
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "myRank": {
    "rank": 12,
    "username": "you",
    "displayName": "You",
    "rating": 1540
  },
  "source": "redis"
}

```


---
---


### 11. Achievements


---
---


#### `GET /api/achievements`

**Source:** `backend/src/achievements/achievements.controller.ts` — AchievementsModule

Get the current user's achievement report (unlocked state + progress + target per achievement).

**Headers:** 🔒 (requires `token` cookie)  
**Query Params:** optional `?username=<username>` returns another user's achievement report.  
**Response:**

```json
{
  "achFirstBlood": { "unlocked": false, "progress": 0, "target": 1 },
  "achOnFire": { "unlocked": false, "progress": 0, "target": 2 },
  "achDiceMaster": { "unlocked": false, "progress": 0, "target": 3 },
  "achBabySteps": { "unlocked": false, "progress": 0, "target": 1 },
  "achTheDiceLoveMe": { "unlocked": false, "progress": 0, "target": 3 },
  "achTactician": { "unlocked": false, "progress": 0, "target": 5 },
  "achMaster": { "unlocked": false, "progress": 0, "target": 8 },
  "achGrandBotMaster": { "unlocked": false, "progress": 0, "target": 12 },
  "achWorldChampion": { "unlocked": false, "progress": 0, "target": 15 },
  "achft_Transcendence": { "unlocked": false, "progress": 0, "target": 10 },
  "achLoveTheMachine": { "unlocked": false, "progress": 0, "target": 3 },
  "achSpeedDemon": { "unlocked": false, "progress": 0, "target": 1 },
  "achUnstoppable": { "unlocked": false, "progress": 0, "target": 3 }
}

```

**Achievement reference** (from `achievements.registry.ts`):

| Field | Type | Condition |
|---|---|---|
| `achFirstBlood` | lifetime | 1 win |
| `achOnFire` | lifetime | 2-game win streak |
| `achDiceMaster` | lifetime | 3 wins |
| `achBabySteps` | lifetime | 1 bot win |
| `achTheDiceLoveMe` | lifetime | 3 bot wins |
| `achTactician` | lifetime | 5 wins |
| `achMaster` | lifetime | 8 wins |
| `achGrandBotMaster` | lifetime | 12 wins |
| `achWorldChampion` | lifetime | 15 wins |
| `achft_Transcendence` | lifetime | 10 human wins |
| `achLoveTheMachine` | lifetime | 3-game PvE streak |
| `achSpeedDemon` | per-game | Win in under 30 minutes |
| `achUnstoppable` | per-game | Capture ≥ 3 pieces in one game |


---
---


#### `POST /api/achievements/check`

**Source:** `backend/src/achievements/achievements.controller.ts` — AchievementsModule

Force re-evaluate achievements for the current user.

**Headers:** 🔒 (requires `token` cookie)  
**Body:** None  
**Response:**

```json
{
  "unlocked": ["achFirstBlood"]
}

```

The `unlocked` array contains the **keys** of any achievements newly unlocked by this evaluation (e.g. `achFirstBlood`). This backfill runs silently (`announce=false` — no notification burst fires).


---
---


### 12. Stats


---
---


#### `GET /api/stats`

**Source:** `backend/src/player-stats/stats.controller.ts` — StatsModule

Get player statistics for the current user.

**Headers:** 🔒 (requires `token` cookie)  
**Response:**

```json
{
  "rating": 1200,
  "highestRating": 1240,
  "totalGames": 42,
  "wins": 20,
  "losses": 22,
  "totalCaptures": 85,
  "totalPiecesInGoal": 168,
  "avgCapturesPerGame": 2.0
}

```


---
---


### 13. Friends — Requests

All friend endpoints require JWT auth via cookie.


---
---


#### `POST /api/friends/request/:userId`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Send a friend request.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:userId` = target user ID  
**Body:** None  
**Response:** Returns the full friendship object with user and friend details.

**Errors:** 400 `FRIEND_ALREADY` / `FRIEND_REQUEST_PENDING` / `FRIEND_BLOCKED`; 403 `NOT_FRIENDS_WITH_USER`; 404 `USER_NOT_FOUND`.


---
---


#### `POST /api/friends/accept/:requestId`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Accept a friend request.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:requestId` = request UUID  
**Body:** None  
**Response:** Returns the updated friendship object with user and friend details.

**Errors:** 404 if request not found, 403 if not addressed to current user.


---
---


#### `POST /api/friends/decline/:requestId`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Decline a friend request.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:requestId` = request UUID  
**Body:** None  
**Response:** `{ "message": "Friend request declined" }`

**Errors:** 404 if request not found.


---
---


#### `GET /api/friends/requests`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Get pending friend requests (both sent and received).

**Headers:** 🔒 (requires `token` cookie)  
**Response:**

```json
{
  "sent": [
    {
      "id": "request-uuid",
      "userId": "friend-user-id",
      "username": "string",
      "avatarStyle": "bottts",
      "createdAt": "ISO-date-string"
    }
  ],
  "received": [
    {
      "id": "request-uuid",
      "userId": "sender-user-id",
      "username": "string",
      "avatarStyle": "bottts",
      "createdAt": "ISO-date-string"
    }
  ]
}

```


---
---


### 14. Friends — Manage


---
---


#### `DELETE /api/friends/remove/:friendId`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Remove a friend.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:friendId` = friend's user ID  
**Body:** None  
**Response:** `{ "message": "Friend removed" }`


---
---


#### `GET /api/friends`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Get the current user's friends list.

**Headers:** 🔒 (requires `token` cookie)  
**Response:**

```json
[
  {
    "id": "user-id",
    "username": "string",
    "avatarStyle": "bottts",
    "rating": 1200,
    "friendsSince": "ISO-date-string"
  }
]

```


---
---


#### `POST /api/friends/block/:userId`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Block a user.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:userId` = user ID to block  
**Body:** None  
**Response:** Returns the blocked friendship object with user and friend details.


---
---


#### `GET /api/friends/blocked`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

List users the current user has blocked.

**Headers:** 🔒 (requires `token` cookie)  
**Response:**

```json
[
  {
    "id": "user-id",
    "username": "blocked-user",
    "displayName": "Blocked User",
    "avatarStyle": "bottts",
    "rating": 1200,
    "blockedSince": "2026-08-01T00:00:00.000Z"
  }
]

```


---
---


#### `POST /api/friends/unblock/:userId`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Unblock a user.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:userId` = user ID to unblock  
**Body:** None  
**Response:**

```json
{ "message": "User unblocked" }

```


---
---


### 15. Friends — Game Invites


---
---


#### `POST /api/friends/:friendId/invite`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Invite a friend to a PvP game. Creates a match room and seats the friend; pushes a `game_invite` notification.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:friendId` = friend's user ID  
**Body:** None  
**Response:**

```json
{
  "message": "Invite sent",
  "gameId": "game-id",
  "token": "<jwt>",
  "engineUrl": "ws://localhost:8443",
  "color": "red",
  "inviteCode": "ABCD12"
}

```


---
---


#### `GET /api/friends/invites/pending`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Get the current user's pending game invite (if any).

**Headers:** 🔒 (requires `token` cookie)  
**Response:** `null` or a pending-invite object.


---
---


#### `POST /api/friends/invites/dismiss`

**Source:** `backend/src/friends/friends.controller.ts` — FriendsModule

Dismiss the current user's pending game invite.

**Headers:** 🔒 (requires `token` cookie)  
**Body:** None  
**Response:**

```json
{ "ok": true }

```


---
---


### 16. Presence


---
---


#### `POST /api/presence/heartbeat`

**Source:** `backend/src/presence/presence.controller.ts` — PresenceModule

Send a presence heartbeat. Called every ~20s while the app is open.

**Headers:** 🔒 (requires `token` cookie)  
**Body:**

```json
{
  "playing": true
}

```

**Response:**

```json
{
  "ok": true
}

```


---
---


#### `DELETE /api/presence/heartbeat`

**Source:** `backend/src/presence/presence.controller.ts` — PresenceModule

Clear presence (e.g. on logout).

**Headers:** 🔒 (requires `token` cookie)  
**Body:** None  
**Response:**

```json
{
  "ok": true
}

```


---
---


#### `GET /api/presence/online-count`

**Source:** `backend/src/presence/presence.controller.ts` — PresenceModule

Get the site-wide count of currently online users (for the homepage badge bar).

**Headers:** 🔒 (requires `token` cookie)  
**Response:**

```json
{
  "count": 12
}

```


---
---


### 17. Notifications


---
---


#### `GET /api/notifications/stream`

**Source:** `backend/src/notification/notification.controller.ts` — NotificationModule

SSE stream — pushes new notifications to the browser in real time.

**Headers:** 🔒 (requires `token` cookie)  
**Response:** Server-Sent Events (`text/event-stream`); each event is a `NotificationPayload`:

```json
{
  "id": "notif-id",
  "type": "friend_request",
  "payload": { "fromUsername": "Alice" },
  "read": false,
  "createdAt": "2026-08-01T00:00:00.000Z"
}

```

Types: `friend_request` | `friend_accepted` | `friend_removed` | `friend_declined` | `game_invite` | `achievement` | `match_finished` | `match_cancelled` | `profile_updated` | `display_name_changed` | `friend_online` | `friend_offline` | `avatar_changed`

**Keep-alive (server → client):** the server writes a `ping` frame into the stream every 20 s (`SSE_HEARTBEAT_MS`). Between notifications this response sends no bytes for minutes, and ngrok's HTTP/2 edge resets an idle stream (`net::ERR_HTTP2_PROTOCOL_ERROR`), so the frame exists to satisfy the tunnel's socket requirements and stop the stream being treated as dead. It is unrelated to the **client → server** presence heartbeat ([`POST /api/presence/heartbeat`](#post-apipresenceheartbeat)), which is a separate request that writes nothing into this stream. See [architecture.md](architecture.md) → Connection liveness (two-direction heartbeats).


---
---


#### `GET /api/notifications`

**Source:** `backend/src/notification/notification.controller.ts` — NotificationModule

List unread notifications (populates the bell dropdown on page load).

**Headers:** 🔒 (requires `token` cookie)  
**Response:** Array of `NotificationPayload` (unread only, newest first, max 50).


---
---


#### `PATCH /api/notifications/:id/read`

**Source:** `backend/src/notification/notification.controller.ts` — NotificationModule

Mark a single notification as read.

**Headers:** 🔒 (requires `token` cookie)  
**Path:** `:id` = notification ID  
**Body:** None  
**Response:** Empty / `204`.


---
---


#### `POST /api/notifications/read-all`

**Source:** `backend/src/notification/notification.controller.ts` — NotificationModule

Mark all notifications as read.

**Headers:** 🔒 (requires `token` cookie)  
**Body:** None  
**Response:** Empty / `204`.


---
---


### 18. Health


---
---


#### `GET /health`

**Source:** `backend/src/main.ts` — App bootstrap

Simple health check that verifies database connectivity.

**Headers:** None  
**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-07-23T10:14:51.664Z"
}

```

On DB error:

```json
{
  "status": "error",
  "timestamp": "2026-07-23T10:14:51.664Z"
}

```


---
---


## WebSocket APIs — Ludo Engine


---
---


### 19. Connection

The browser connects to the engine on its **own origin** — nginx (or the Vite dev proxy) forwards `/socket.io/` to the ludo-engine.

Connection requires JWT in handshake auth:

```js
const socket = io(window.location.origin, { // same-origin → nginx → ludo-engine
  auth: { token: '<token-from-match-endpoint>' },
  transports: ['websocket'],
});

```

JWT payload structure:

```json
{
  "gameId": "uuid",
  "sub": "user-id",
  "userId": "user-id",
  "role": "player1" | "player",
  "color": "red"
}

```

**Health endpoint on the engine:** `GET http://localhost:3001/health` returns `{ "status": "ok", "uptime": 12345.67 }`.


---
---


### 20. Client → Server Events (emit)


---
---


#### `join_game`

**Source:** `backend/app/ludo-engine/src/socket/socket-handlers.ts` (`handleJoinGame`)

Join or create a game room. If all players have joined, transitions game from `waiting` to `active` automatically.

```js
socket.emit('join_game', gameId, playerColor, userId?, displayName?);

```

| Param | Type | Notes |
|---|---|---|
| `gameId` | string | Match UUID |
| `playerColor` | `'red'` \| `'green'` \| `'yellow'` \| `'blue'` | Your chosen color |
| `userId` | string | (optional) Override for bots |
| `displayName` | string | (optional) Display name for the seat |

**Response:** `game_joined` event with full `GameState`

**Errors:** `error` event with message.


---
---


#### `roll_dice`

**Source:** `backend/app/ludo-engine/src/socket/socket-handlers.ts` (`handleRollDice`)

Roll the dice for the current turn. Rejected if it is not your turn.

```js
socket.emit('roll_dice');

```

**Response:** `dice_rolled` event (broadcast to all in room)

**Errors:** `error` if not your turn, wrong phase, or player exited.


---
---


#### `move_piece`

**Source:** `backend/app/ludo-engine/src/socket/socket-handlers.ts` (`handleMovePiece`)

Move a piece using a legal pieceId.

```js
socket.emit('move_piece', pieceId);

```

| Param | Type | Notes |
|---|---|---|
| `pieceId` | string | e.g. `"red-0"` |

**Response:** `piece_moved` event (broadcast to all in room)

**Errors:** `error` if piece not in current legal moves.


---
---


#### `player_ready`

**Source:** `backend/app/ludo-engine/src/socket/socket-handlers.ts` (`handlePlayerReady`)

Mark the current seat's color as ready (readiness is color-keyed in engine state). The game starts once ≥2 active seats are all ready.

```js
socket.emit('player_ready');

```

**Response:** `lobby_update` broadcast (updated ready flags).


---
---


#### `select_color`

**Source:** `backend/app/ludo-engine/src/socket/socket-handlers.ts` (`handleSelectColor`)

Pick a seat color in the lobby. Picking or swapping a seat clears the Ready flag on both colors involved (readiness is tracked per color in engine state and must be re-confirmed after a change).

```js
socket.emit('select_color', color);

```

| Param | Type | Notes |
|---|---|---|
| `color` | `'red'` \| `'green'` \| `'yellow'` \| `'blue'` | The requested color |

**Response:** `lobby_update` or `color_selected` broadcast.


---
---


#### `leave_game`

**Source:** `backend/app/ludo-engine/src/socket/socket-handlers.ts` (`handleLeaveGame`)

Leave the current game room (before it starts).

```js
socket.emit('leave_game');

```

**Response:** `lobby_update` broadcast to the remaining players.


---
---


#### `end_game`

**Source:** `backend/app/ludo-engine/src/socket/server.ts` (`handleEndGame`)

End the game prematurely (host/admin action).

```js
socket.emit('end_game');

```

**Response:** `game_ended` / `player_aborted` broadcast.


---
---


#### `disconnect`

**Source:** `backend/app/ludo-engine/src/socket/socket-handlers.ts` (`handleDisconnect`)

Automatically handled when the WebSocket connection drops. Opens a reconnect grace window (45 s in PvP, 1 h in single-instance modes) for a **live, unfinished** seat and broadcasts `player_disconnected`; no window is opened for an exited/finished seat. `player_reconnected` fires if the player returns inside the window, carrying the name the client reports so a rename survives the reconnect. If the window expires the seat is pruned for good (`player_exited`, pieces parked at `step = -1`), and a later `join_game` for it is answered with `seat_expired` instead of being treated as a reconnect.

```js
// Socket.IO handles this automatically on connection loss

```

**Response:** `player_exited` event (broadcast to room).


---
---


### 21. Server → Client Events (on)

| Event | Payload | When |
|---|---|---|
| `game_joined` | `GameState` (full state) | After `join_game` |
| `dice_rolled` | `{ value, legalMoves, bonusRoll }` | After dice rolled |
| `piece_moved` | `MoveResult` | After piece moved |
| `game_started` | `{ gameId }` | Game transitions from waiting → active |
| `game_ended` | `{ winner, resultDetail }` | Game finished |
| `game_timeout` | none | Post-game lobby expired (60s) — room torn down |
| `game_expired` | none | Idle lobby expired (5 min, < 2 seated) |
| `player_exited` | `{ color }` | Player disconnected (exited) |
| `player_aborted` | `{ color, username }` | A player aborted the game |
| `player_disconnected` | `{ color }` | A player's connection dropped |
| `player_reconnected` | `{ color, displayName? }` | A player reconnected inside the grace window |
| `seat_expired` | `{ gameId, color }` | Your `join_game` was refused because the seat was already removed (left, or the grace window expired) — sent to that socket only |
| `lobby_update` | `{ players: [{ username, color, ready }] }` | Lobby seats changed (join/leave/ready) |
| `color_selected` | `{ color }` | A player selected a color in the lobby |
| `state_update` | full `GameState` | After a live exit moved the turn (also the SPA's catch-all for any other pub/sub frame) |
| `error` | `string` | On invalid action |


---
---


### 22. End-to-End Flow

```

1. POST /api/auth/login
   → { user: { id, username } }
   ← Set-Cookie: token=<jwt> (httpOnly)

2. POST /api/match/create { mode: "pvp" } (or /pve, or /pvp/invite then /match/join/:code)
   → { gameId, token, engineUrl }

3. Connect to engine:
   io(engineUrl, { auth: { token } })

4. socket.emit('join_game', gameId, 'red')
   ← socket.on('game_joined', state)

5. Play game:
   socket.emit('roll_dice')
   ← socket.on('dice_rolled', {...})
   socket.emit('move_piece', 'red-0')
   ← socket.on('piece_moved', {...})

6. Game end:
   ← socket.on('game_ended', {...})
   (engine calls POST /api/game/end automatically)

7. Post-game:
   ← socket.on('game_timeout')     // finished room expired after 60s
   (or emit 'end_game' to abandon early)

```


---
---


## Notes

- **Auth:** All auth endpoints use httpOnly cookies. Set automatically by login/register/refresh, cleared by logout. No `Authorization: Bearer` header is used.
- **JWT expiration:** 15 minutes for access tokens. Refresh tokens last 7 days and are rotated on each use.
- **Bot tokens:** `playerId` is `'ludo-bot'`, `role` is `'player'` / `'player1'`.
- **CORS:** Not enabled. Every client call is same-origin through nginx's `/api` proxy, so the backend emits no CORS headers.
- **Rate limiting:** Auth endpoints (`register`, `login`) have throttler guard enabled.