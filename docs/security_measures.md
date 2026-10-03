# Security measures

What the app does to protect itself, and what each measure defends against. The doc is ordered from
the network edge inward: exposure, transport, edge headers, rate limits, sessions, tokens, the game
engine boundary, input handling, and secrets.

In short: nginx is the only public entry point (TLS 1.2/1.3 only, security headers, per-IP rate
limits) and it fronts a loopback-only backend, engine, database and cache. Sessions use httpOnly
cookies with rotating refresh tokens, passwords are bcrypt-hashed, every emailed token is single
use and stored only as a hash, and the game engine verifies its own signed token before a socket can
join a room.

Companion docs: [`architecture.md`](architecture.md) (which covers the game engine socket threat
model in full), [`deploy/nginx.md`](deploy/nginx.md) and [`deploy/tunnel.md`](deploy/tunnel.md) (how
the two TLS listeners work). The review that produced this list, together with the options that were
rejected, is kept in `security-review.md`, private working notes that are not part of this doc set.

Verified against the current repo: `compose.yaml`, `nginx/conf/nginx.conf`, `nginx/conf/app.inc`,
`nginx/Dockerfile`, `backend/src`, `backend/app/ludo-engine/src`, `backend/docker-entrypoint.sh`,
`backend/src/auth/auth.constants.ts`, `Makefile`.


## Table of Contents

- [Network exposure](#network-exposure): the one port reachable from another machine, and why the rest are loopback-only
- [Transport security (TLS)](#transport-security-tls): TLS 1.2/1.3 on both listeners, HSTS, and the self-signed certificate
- [Edge headers and static content](#edge-headers-and-static-content): the headers both listeners set, and the static-file rules
- [Rate limiting](#rate-limiting): the nginx per-address zones, the address each listener trusts, and the API throttler
- [Sessions and authentication](#sessions-and-authentication): cookie shape, token lifetimes, rotation and revocation, bcrypt, 2FA
- [Emailed link tokens](#emailed-link-tokens): what the app emails, each token's lifetime, and the single-use rule
- [Verification links cannot reach a log](#verification-links-cannot-reach-a-log): why a verification token never lands in a proxy access log
- [Game engine boundary](#game-engine-boundary): how a socket proves it may join a game, and what the engine refuses
- [Input validation and uploads](#input-validation-and-uploads): body validation, avatar signature checks, parameterized queries
- [Data stores, secrets and configuration](#data-stores-secrets-and-configuration): where secrets live, what Redis holds, no browser credential
- [Not yet addressed](#not-yet-addressed): the open items, listed so this doc does not overstate the current state
- [References](#references): the companion docs, and where each detail is documented in full


---


## Network exposure

Only one port is meant to be reachable from another machine. Every other publish is bound to
`127.0.0.1`, so a device on the same WiFi can reach the app and nothing else.

| Port | Service | Bound to | Purpose |
|---|---|---|---|
| `8443` | nginx direct TLS listener | all interfaces | the app entry point |
| `8080` | Vite dev server | all interfaces | `dev` profile only (`make dev`); never in a production stack |
| `8444` | nginx tunnel TLS listener | `127.0.0.1` | the local ngrok agent is the only process that may connect |
| `3000` | backend API | `127.0.0.1` | host debugging; the SPA reaches it through nginx `/api` |
| `3001` | ludo-engine | `127.0.0.1` | host debugging; the browser reaches it through nginx `/socket.io/` |
| `5432` | PostgreSQL | `127.0.0.1` | `psql` from the host |
| `6479` | Redis | `127.0.0.1` | seed and maintenance scripts from the host |
| `5555` | Prisma Studio | `127.0.0.1` | interactive database browsing from the host |
| `4040` | ngrok agent local API | `127.0.0.1` | exists only while `make tunnel` runs |

Cross-container traffic stays on the private `transcendence_network`, so the database, the cache and
the engine are addressed by service name and never leave the Docker network.

**Mitigates:** direct connections to the database, the cache or the game engine from the LAN or
through the tunnel; port scanning from another device; a raw database browser that has no
application-level authentication being reachable from the network.


---


## Transport security (TLS)

- Both listeners serve **TLS 1.2 and TLS 1.3 only** (`ssl_protocols TLSv1.2 TLSv1.3`). SSLv3, TLS 1.0
  and TLS 1.1 are refused.
- nginx has **no plain-HTTP listener**. Both `server {}` blocks use `listen ... ssl`, and the only
  published nginx ports are `443` and `444`.
- Every response carries `Strict-Transport-Security: max-age=31536000; includeSubDomains`, so a
  browser that has seen the app once keeps using HTTPS for it.
- The certificate is self-signed and generated at image build time (`nginx/Dockerfile`, `openssl req
  -x509 -days 365`, CN `transcendence-ludo`). This is why the first visit shows a browser warning.
- `make tunnel` points ngrok at `https://localhost:$(NGROK_PORT)`, so the agent speaks TLS to nginx
  instead of forwarding plain HTTP at a TLS-only port. The visitor's connection to ngrok is TLS too.

**Mitigates:** downgrade to a broken TLS version, passive interception of credentials or session
cookies on the network, and plaintext capture of the first request.


---


## Edge headers and static content

`nginx/conf/app.inc` is included by both listeners, so the two modes cannot drift apart.

| Header | Value | Mitigates |
|---|---|---|
| `X-Frame-Options` | `SAMEORIGIN` | clickjacking, where another site frames the app and overlays it |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing, where a stored file is interpreted as a script |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | leaking full URLs, and any path or query data in them, to third-party sites |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | protocol downgrade and cookie theft over plain HTTP |
| `Content-Security-Policy` | `default-src 'self'` and an explicit source list | content from an origin that was not declared in the policy |
| `X-XSS-Protection` | `1; mode=block` | the legacy XSS filter in older browser engines |

Additional edge behaviour:

- Every header is set with `always`, so it is sent on error responses (`4xx`, `5xx`) too, not only
  on `200`.
- `server_tokens off` removes the nginx version from responses and error pages.
- `location ~ /\.` denies hidden files (`.env`, `.git` and similar), with `access_log off` so a probe
  leaves no useful noise behind either.
- `client_max_body_size 10M` bounds the request body at the edge.

The current policy still allows `'unsafe-inline'` script, and `img-src` and `connect-src` use
wildcards, so CSP is a partial control rather than a complete one. See
[Not yet addressed](#not-yet-addressed).

**Mitigates:** clickjacking, MIME sniffing, referrer leakage, downgrade attacks, and a broad class
of injected-resource attacks that a strict policy would block outright.


---


## Rate limiting

### At the edge (nginx, keyed on the client address)

| Zone | Rate | Burst | Applies to |
|---|---|---|---|
| `login` | 5 r/m | 5 | `= /api/auth/login` only |
| `refresh` | 30 r/m | 15 | `= /api/auth/refresh` only |
| `auth` | 60 r/m | 20 | the `/api/auth/` prefix (`/me`, `/logout` and the rest of the auth flows) |
| `leaderboard` | 30 r/m | 20 | `= /api/leaderboard`, which also rejects every method but `GET` with a `405` |
| `api` | 600 r/m | 100 | every other `/api/` route (user, friends, game, notifications, stats) |

- `limit_req_status 429` makes a throttled request answer `429 Too Many Requests`, matching the
  NestJS throttler. nginx's default `503` reads as a broken server, so clients retry it and
  monitoring counts it as an outage.
- Location precedence does the routing: nginx matches an exact location before a prefix, so
  `/api/auth/login` uses the tight `login` zone rather than the `auth` prefix, and a request that a
  tighter zone matched never reaches the loose `api` zone.
- The `api` zone is deliberately loose: one SPA page load fans out across several endpoints, so it is
  a ceiling on hammering rather than a usage quota.

### Which client address each listener trusts

Throttling is only as good as the address it keys on, so the two listeners differ on purpose:

- **`8443` (direct):** no forwarded header is trusted. Docker's port publishing rewrites the peer
  address to the bridge gateway, so the limits there are honestly a shared bucket. The only
  alternative would be a client-supplied header, and trusting it would let any client choose its own
  bucket.
- **`8444` (tunnel):** the client is resolved from `X-Forwarded-For` with `set_real_ip_from` for the
  private ranges, `real_ip_header X-Forwarded-For` and `real_ip_recursive on`. This is safe because
  the port is published on loopback only, so the ngrok agent is the only possible peer. The recursive
  walk takes the first address from the right that is not in a trusted range, so a value the visitor
  sent themselves is never the one chosen.
- nginx overwrites `X-Forwarded-For` with `$remote_addr` before proxying, so the backend never sees a
  client-supplied value.
- The backend sets `trust proxy` to `loopback`, `linklocal` and `uniquelocal`, so `req.ip` is a real
  client address for its own throttler and cannot be spoofed from outside those ranges.

### In the API (NestJS throttler)

A global default of 300 requests per minute per client, plus per-route overrides:

| Route | Limit |
|---|---|
| `POST /api/auth/register` | 5 per hour |
| `POST /api/auth/login` | 5 per minute |
| `POST /api/auth/2fa/verify` | 5 per minute |
| `POST /api/auth/2fa/resend` | 5 per hour |
| `POST /api/auth/refresh` | 30 per minute (kept in step with the nginx zone) |
| `POST /api/auth/forgot-password` | 3 per hour |
| `POST /api/auth/reset-password` | 5 per 15 minutes |
| `POST /api/auth/resend-verification` | 3 per hour |
| `PATCH /api/auth/profile` | 10 per hour |
| `POST /api/auth/profile/resend-email-change` | 5 per hour |

Per-account limits complement the per-address ones: at most 3 email-change links per hour per user (a
Redis counter with a rolling window), at most 3 resends of a 2FA code per hour, and 5 wrong 2FA
codes invalidate the challenge outright.

**Mitigates:** credential brute force, verification and reset mail spam (which also turns the app
into a nuisance mail sender aimed at a victim's inbox), repeated 2FA code guessing, and scripted
hammering of the API.

Throttling keys on the client address, not on the account, so an attempt spread over many addresses
is not slowed per account. See [Not yet addressed](#not-yet-addressed).


---


## Sessions and authentication

- **Access token:** a JWT with `iss: ft_transcendence`, `aud: ft_transcendence-api`, a string `sub`
  (the user id), `HS256` and a 15 minute lifetime. `JwtStrategy` enforces the issuer, the audience
  and the algorithm, and rejects a token whose `sub` is missing or not a string, so a malformed token
  cannot widen a database query.
- **Delivery:** both tokens travel in cookies that are `httpOnly` (script cannot read them),
  `SameSite=Lax` (a cross-site form post does not carry them) and `Secure` in production. The access
  cookie is scoped to `path=/`; the refresh cookie is scoped to `path=/api/auth`, so the browser only
  sends it to the refresh and logout routes.
- **Refresh token:** 32 random bytes, 7 days, stored in Redis only as a SHA-256 hash
  (`refresh:<hash>` maps to the user id). Every refresh consumes the old token and issues a new one
  in the same step, so a token that has already been used cannot be used again. Each hash is also
  indexed under `sessions:<userId>`, which lets logout revoke one session while a password reset or
  an account deletion revokes every session at once.
- **Logout** revokes the refresh token server-side and clears both cookies, repeating the path each
  cookie was set with.
- **Passwords:** bcrypt with cost 10. The policy is at least 12 characters with an upper-case letter,
  a lower-case letter, a digit and a special character, and at most 72 bytes, which is the point past
  which bcrypt ignores input. The same rules are mirrored in the client for immediate feedback.
- **Two-factor authentication:** a 6-digit code, stored in Redis as a SHA-256 hash with a 5 minute
  TTL and an attempt counter. 5 wrong codes invalidate the challenge; resends are capped at 3 per
  hour.
- **OAuth:** the callback step carries its own token type (`aud: oauth-link`, signed with a separate
  `OAUTH_STATE_SECRET`, 10 minute TTL). Because each guard requires its own audience, an OAuth
  callback token cannot be used as a session and a session token cannot complete a link. Strategy
  selection is per request: the backend picks the tunnel callback URL when the `Host` header contains
  `ngrok`, so a local client and a tunnelled client can sign in at the same time without crossing
  over.

**Mitigates:** session theft by an injected script (httpOnly), cross-site request forgery through a
form post (SameSite), long-lived credential theft (short access token plus rotation), reuse of a
captured refresh token, offline cracking of stored passwords (bcrypt), silent truncation of long
passwords, 2FA code guessing, and confusion between session and OAuth tokens.


---


## Emailed link tokens

Every link the app emails carries a token of 32 random bytes. Only its SHA-256 hash is stored, so a
dump or an operational listing of Redis reveals no usable token.

| Link | Redis key | TTL | Notes |
|---|---|---|---|
| Signup verification | `verify:<sha256>` | 24 hours | single use |
| Password reset | `reset:<sha256>` | 1 hour | single use; completing a reset revokes every live session |
| Email change | `emailchange:<sha256>` | 15 minutes | single use; staged, not committed until the link is opened |

- A token is consumed as it is read: the value is fetched and deleted in the same operation, so a
  second use of the same link finds nothing.
- An email change is **verify-then-commit**. The new address is staged in Redis and the user row is
  not touched until the link is opened, at which point the address is written and the change is
  refused with a conflict if the address has been taken meanwhile.
- Requesting a new email-change link invalidates the previous one: the old key is deleted as the new
  one is written.
- At most 3 email-change links per user per hour (a Redis counter with a rolling window), on top of
  the route-level throttle.

**Mitigates:** replay of an emailed link, a stale link remaining valid after a newer one was issued,
token exposure through a dump or a backup of the data store, and an unverified address being written
into the user row.


---


## Verification links cannot reach a log

Emailed verification links point at the SPA with the token in the **URL fragment**, as in
`https://<host>/verify-email#token=<64 hex characters>`. A fragment is never sent to the server, so
it cannot appear in the nginx access log, the nginx error log, browser history or a `Referer`
header.

The SPA reads the fragment on first render, removes it with `history.replaceState` before the
request is made, and sends the token in the body of `POST /api/auth/verify-email`. The body is not
logged. The response is one of `signup`, `change`, `conflict` or `invalid`, so the page can route
without any secret coming back. There is no `GET` variant of the route: a link minted by an older
build fails instead of falling back to the loggable shape.

**Mitigates:** single-use verification tokens being recorded in plaintext by the reverse proxy,
where anyone with access to the logs (or to a log-forwarding destination) could redeem another
user's link.

The password-reset link is not converted yet: it still carries its token in the query string, so it
reaches the same logs. See [Not yet addressed](#not-yet-addressed).


---


## Game engine boundary

- **The engine is not reachable directly.** It publishes on loopback only, and the SPA connects to
  `/socket.io/` on its own origin, which nginx proxies over TLS. A loopback connection on its own is
  never enough to reach a game.
- **Every socket is authenticated by a match token** signed with a dedicated secret
  (`ENGINE_JWT_SECRET`) that is separate from the session secret. The engine refuses to boot without
  it, and the backend entrypoint preflight aborts when it is missing.
- **The engine accepts only `HS256`**, requires the `aud: ludo-engine` claim, compares the signature
  with `timingSafeEqual` (constant time) and honours `exp`. A session access token fails all three
  checks.
- **The token, not the client, names the room and the seat.** The engine keeps the token's match id
  and colour as authoritative; the argument a client passes to `join_game` is only a fallback. A
  refused join leaves the room and clears the socket's binding, so its later disconnect cannot mark a
  live player as gone.
- **The backend mints a token only for a seat the caller still owns**, in a match the engine has
  neither started nor finalized. The engine's own state is read for that decision; the cached
  `match:*` hash is never trusted on its own.
- **The engine calls back into the backend** with an `X-Engine-Key` header holding `ENGINE_API_KEY`,
  so the game-result endpoints do not accept an ordinary user session.

The ten holes found in the first version of this boundary, and the rule that now closes each one, are
tabulated in [`architecture.md`](architecture.md) (Security & Threat Model); the engine-side detail
is in [`ludo-engine/ludo-engine-socket-system.md`](ludo-engine/ludo-engine-socket-system.md).

**Mitigates:** forging a game credential from any other token or key that shares the session secret,
joining a room or claiming a seat the caller does not own, a refused socket continuing to receive a
game's broadcasts, and a stale duplicate socket closing a seat that is live.


---


## Input validation and uploads

- Every request body is validated by `class-validator` decorators through a global `ValidationPipe`
  with `whitelist: true` (unknown properties are stripped before a handler sees them) and
  `transform: true` (declared types are coerced).
- Validation failures return a stable code that the SPA localizes, so an error response never carries
  internals.
- Fields with a meaningful shape have explicit rules, including the verification token, which must be
  exactly 64 hex characters: a malformed body is rejected before any data-store lookup.
- **Avatars** are validated before anything is stored. The upload is limited to 2 MB and to PNG,
  JPEG, GIF or WebP, and the server compares the leading bytes of the file against the signature of
  the declared type (`89 50 4E 47 0D 0A 1A 0A` for PNG, `FF D8 FF` for JPEG, `47 49 46 38` for GIF,
  `52 49 46 46` plus `57 45 42 50` for WebP), because the declared MIME type is only what the client
  claims. A mismatch is refused before a single byte is written. The check reads the signature only
  and does not decode the image, so a file truncated after its signature is stored, and the client
  falls back to the generated avatar when the browser cannot render it.
- Accepted bytes are stored in Postgres in a `Bytes` column through Prisma and sent back with the
  stored `Content-Type`. The database never executes or opens the file.
- Database access goes through Prisma's parameterized query builder. The one raw statement in the
  backend is the `SELECT 1` health probe.

**Mitigates:** malformed or oversized payloads, mass assignment through extra JSON properties, a
script disguised as an image behind a benign declared type, and SQL injection through user input.


---


## Data stores, secrets and configuration

- **PostgreSQL and Redis are container-internal** and published on loopback only. Both require
  credentials from the root `.env`, and every client connects with the password: the Redis server is
  started with `REDIS_PASSWORD`, each client passes it, and the healthcheck authenticates with it.
- **Redis holds derived data only:** SHA-256 hashes of the refresh, verification, reset, email-change
  and 2FA tokens, plus presence and game keys. A dump yields no usable credential.
- **Configuration lives in one gitignored `.env`** at the repo root and is loaded into containers
  with compose's `env_file`. `.env.example` is the shared template and documents every key.
- **The stack refuses to start with a missing secret.** `make env` runs before every build and fails
  with the list of empty keys; the backend reads its secrets through `requireSecret()`, which throws
  at boot rather than signing with `undefined`; the backend entrypoint preflight aborts on a missing
  `DATABASE_URL`, `JWT_SECRET`, `ENGINE_JWT_SECRET` or `OAUTH_STATE_SECRET`.
- **The frontend stores no credential.** The session lives in the httpOnly cookies only; nothing
  token-like is kept in `localStorage` or `sessionStorage`.
- **CORS is not enabled on the backend.** Every call the SPA makes is same-origin through nginx, so
  the backend emits no cross-origin permission at all: there is no allow-list to get wrong and no
  `Access-Control-Allow-Origin` for another site's page to make use of.

**Mitigates:** recovering a token or a password from a cache dump, starting a service with an empty
secret (which would make signatures forgeable), a session being readable by an injected script, and a
cross-origin page calling the API with the user's cookies.


---


## Not yet addressed

The review tracks these as open. Each is deliberate, and none is exploitable from outside on its own.
They are listed so that this doc does not overstate the current state.

| Area | Current state | Why it matters |
|---|---|---|
| Password-reset link | the link carries its token in the query string (`/reset-password?token=...`) | the same leak that was closed for verification links: the reverse proxy logs the token, so a log reader could redeem another user's reset link |
| Content Security Policy | `script-src 'self' 'unsafe-inline'`, with wildcard `img-src` and `connect-src` | inline script is allowed, so the policy does not stop an injected inline payload |
| Engine socket | Socket.IO CORS defaults to `origin: '*'`; no event rate limit; the default 1 MB `maxHttpBufferSize` | a foreign origin can open a socket (it still needs a valid match token to join a game), and a connected socket can send large or rapid events |
| Login lockout | throttling is per client address | attempts spread over many addresses are not slowed per account |
| Engine shared key | `X-Engine-Key` is compared with a plain string comparison, and falls back to `dev-engine-key` when the variable is unset | the comparison is not constant time, and the fallback would let a misconfigured deployment accept a known key |
| Request size | the edge allows 10 MB while avatars are limited to 2 MB | a large body is buffered before the API rejects it |
| TLS tuning | default cipher list and session tickets | cipher preferences are whatever the nginx build ships with |
| Schema push | the backend entrypoint runs `prisma db push --accept-data-loss` on every boot | an unintended schema drift could drop data unattended |
| Notification streams | no cap on concurrent SSE streams per user | one signed-in user can hold many long-lived responses open |
| Certificate | valid for 365 days, regenerated only at image build | an expired certificate is a warning, not a bypass, but it is a recurring support burden |
| Connection cap | no `limit_conn` | there is a request rate limit but no limit on simultaneous connections per address |
| `helmet()` | not used on the backend | nginx already sets the headers, so this is a duplicate-control gap only |


---


## References

- [`architecture.md`](architecture.md): topology, request paths, and the game engine socket threat
  model in full.
- [`deploy/nginx.md`](deploy/nginx.md) and [`deploy/tunnel.md`](deploy/tunnel.md): the two TLS
  listeners, the rate-limit zones, and the ngrok callback setup.
- [`backend/backend-auth-module.md`](backend/backend-auth-module.md): the session, token and
  verification flows in detail.
- [`ludo-engine/ludo-engine-socket-system.md`](ludo-engine/ludo-engine-socket-system.md): the
  handshake, `join_game` and disconnect rules.
- `security-review.md`: the review behind this list, private working notes that are not part of this
  doc set.
