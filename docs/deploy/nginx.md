# nginx

How nginx sits in front of everything, and why it's the one piece that lets
local, LAN, and ngrok tunnel mode all work without the frontend or backend
knowing which one is in play. Companion docs: [`lan.md`](./lan.md),
[`tunnel.md`](./tunnel.md).

Verified directly against the current repo (`nginx/conf/nginx.conf`,
`nginx/conf/app.inc`, `compose.yaml`). See [Static-asset delivery](#static-asset-delivery-gzip--caching)
at the bottom for how the SPA is compressed and cached.


---
---


## The one idea that makes this simple

nginx is the **only** server that any client communicates with. Browsers — local or
tunnelled — connect to `nginx` on port `443` (published on the host as `8443`)
and nothing else. `nginx` then proxies to `backend:3000` and
`ludo-engine:3001` over the internal Docker network. The frontend SPA only
ever calls relative paths (`/api/...`, `/socket.io/...`), so it never needs
to know or care which mode it's running under — same-origin
`fetch`/WebSocket calls resolve against whatever host the browser actually
typed in the address bar.

```
                         ┌─────────────────────────────────────────┐
 browser  ── https ──►   │  nginx :443 (published as host :8443)   │
 (local / ngrok)        │  - TLS termination (self-signed cert)   │
                         │  - serves the built SPA from spa_dist   │
                         │  - proxies /api/       → backend:3000   │
                         │  - proxies /socket.io/ → ludo-engine:3001│
                         └─────────────────────────────────────────┘
```

Only `nginx`'s port is published on all interfaces (`"8443:443"` in
`compose.yaml`). Every other service — `backend`, `db`, `redis`, `studio`,
`ludo-engine` — publishes `127.0.0.1:<port>:<port>`, loopback-only, for
host-side debugging (`psql`, Prisma Studio, `npm run dev`'s Vite proxy).
Nothing but nginx is ever reachable from another device — that's what makes
[tunnel mode](./tunnel.md) need zero extra routing config of its own.


---
---


## TLS

`nginx/Dockerfile` generates a self-signed cert at build time (`openssl req
-x509 ... -days 365`, CN `transcendence-ludo`) and bakes it into the image
at `/etc/nginx/ssl/`. This is why every mode — local and the ngrok tunnel —
shows a browser certificate warning once: nginx only ever
terminates TLS with this one self-signed cert, in every mode. `nginx.conf`
restricts it to `TLSv1.2`/`TLSv1.3` and sets the standard hardening headers
(`X-Frame-Options`, `HSTS`, a `Content-Security-Policy`, etc.) directly in
the `server {}` block.


---
---


## Serving the SPA

The frontend is a separate container (`frontend` service) that runs
`tsc -b && vite build` on every source change and publishes the output into
a shared named volume, `spa_dist`. nginx mounts that volume read-only at
`/usr/share/nginx/html` and just serves static files off disk — there is no
Node/Vite process involved at runtime. `location /` uses
`try_files $uri $uri/ /index.html` so client-side routes (React Router)
resolve correctly on a hard refresh instead of 404ing.


---
---


## Routing table (active config, in `nginx.conf`)

| Path | Behaviour |
|---|---|
| `/` | Serves the SPA; falls back to `/index.html` for client-side routes |
| `= /api/leaderboard` | GET-only, rate-limited 30 req/min (burst 20), proxied to `backend:3000` |
| `= /api/auth/login` | Rate-limited 5 req/min (burst 5) — brute-force defense in depth behind the backend's own throttler |
| `= /api/auth/refresh` | Rate-limited 30 req/min (burst 15) — `apiFetch` fires this automatically on any 401, so several tabs can legitimately burst at once |
| `/api/auth/` | Rate-limited 60 req/min (burst 20) — covers `/api/auth/me`, which the SPA calls on page load for non-public routes (the probe is skipped on `/`, `/login`, `/signup`), and `/api/auth/logout` |
| `/api/` | Generic proxy to `backend:3000`. `proxy_read_timeout`/`proxy_send_timeout` are raised to 3600s and `proxy_buffering` is off — needed for `/api/notifications/stream`, a long-lived SSE response that can sit idle for minutes between notifications. nginx's 60s default was closing that stream mid-chunk (the client saw `ERR_INCOMPLETE_CHUNKED_ENCODING`), and buffering held back the events that did arrive |
| `= /api/health` | Proxied to `backend:3000/health` (rewritten — NestJS mounts `/health` at its root, not under `/api`) |
| `/socket.io/` | Proxied to `ludo-engine:3001`, with the `Upgrade`/`Connection` headers set from the `map $http_upgrade $connection_upgrade` block so WebSocket upgrades work. Also 3600s timeouts, for long game sessions. The browser therefore never opens a socket to `ludo-engine:3001` itself: a plain `ws://` call would be blocked as mixed content on an HTTPS page, and that port is not published for the host |
| `~ /\.` | Denies any dotfile path (`.env`, `.git`, etc.) |

All of the `/api/*` locations set `X-Real-IP`, `X-Forwarded-For`, and
`X-Forwarded-Proto` so the backend sees the client's real IP (used by its own
rate limiting) and knows the original request was HTTPS.

`resolver 127.0.0.11 valid=10s;` points nginx at Docker's embedded DNS and
caches service-name lookups for only 10s. Without this, `proxy_pass` would
resolve `backend`/`ludo-engine` once and cache the IP for the life of the
nginx worker — restarting either service in dev would leave nginx stuck
retrying an unreachable IP address until nginx itself restarted.


---
---


## Rate limiting

Every `/api/**` route is also throttled inside the backend by the NestJS throttler;
nginx adds a per-IP layer in front of it, so a burst is stopped before it reaches
Node. nginx keys its buckets on `$binary_remote_addr`, the real peer address, which
a client cannot spoof the way `X-Forwarded-For` can.

`limit_req` is a leaky bucket, not a per-minute quota: `rate=60r/m` refills one token
per second, and `burst=N nodelay` allows up to `N` tokens to be spent at once without
delay. The zones and the locations that spend them:

| Zone | Rate | Burst | Used by | Notes |
|------|------|-------|---------|-------|
| `leaderboard` | 30 r/m | 20 | `= /api/leaderboard` | Enough for normal page loads and filter changes, tight against scripted hammering |
| `login` | 5 r/m | 5 | `= /api/auth/login` | Brute-force defense |
| `refresh` | 30 r/m | 15 | `= /api/auth/refresh` | `apiFetch` fires this automatically on any 401, so several tabs resuming at once burst legitimately. Kept in step with the route's `@Throttle` in `auth.controller.ts` |
| `auth` | 60 r/m | 20 | `/api/auth/` prefix, which covers `/api/auth/me` and `/api/auth/logout` | The SPA calls these on every page load and in every tab; at the earlier 10 r/m a handful of tabs spent the bucket and got a 503 mid-session |

`limit_req_status 429;` makes a throttled request answer `429 Too Many Requests`,
matching the NestJS throttler. nginx's default is `503`, which reads as a broken
server: clients retry it and monitoring counts it as an outage.

Location precedence matters here, because nginx matches exact (`=`) locations before
prefixes: `/api/auth/login` is handled by the `login` zone rather than the `auth`
prefix, and `/api/leaderboard` never reaches the generic `/api/` block (it also
rejects every method but `GET` with a 405).


---
---


## Vite dev proxy (`frontend-dev`)

Under `make dev` the SPA is served by Vite on :8080 instead of nginx, so `vite.config.ts` repeats the two proxy `location` blocks from `nginx.conf`:

| Prefix | In-container target | Host (`npm run dev` - outside compose) target | Env override |
|---|---|---|---|
| `/api` | `http://backend:3000` | `http://localhost:3000` | `VITE_API_TARGET` |
| `/socket.io` | `http://ludo-engine:3001` | `http://localhost:3001` | `VITE_ENGINE_TARGET` (with `ws: true`) |

`VITE_IN_CONTAINER=true` (set by `Dockerfile.dev`) selects the in-container service names; otherwise the host's published ports are used. Repeating `nginx.conf` here is intentional: nginx, this dev server, and (for the engine) direct Docker DNS all behave identically, so no absolute backend URL ever leaks into the SPA and the browser never needs to know the engine's real address.


---
---


## Static-asset delivery (gzip + caching)

The SPA is served straight off the `spa_dist` volume by `nginx.conf`, and both how
it goes out and how long it may be cached are configured there:

- **Compression:** `gzip on`, `gzip_comp_level 5`, `gzip_min_length 1024`, with
  `gzip_types` covering JS, CSS, JSON, XML, SVG and the web manifest. The bundle is
  ~1 MB of JS+CSS uncompressed and Vite content-hashes every filename, so a rebuild
  invalidates all of it at once — the browser cache cannot cover a fresh `make`, and
  gzip is what keeps a cold load to roughly a third of that (measured on the built
  SPA: JS 452 KB → 125 KB, CSS 108 KB → 18 KB). `text/event-stream` is deliberately
  *not* in `gzip_types`: `/api/notifications/stream` is long-lived SSE, and
  compressing it buffers events instead of flushing them. `gzip_proxied` stays at its
  default (`off`), so proxied API responses — including that SSE stream — are not
  touched either.
- **Caching:** `location /assets/ { expires 1y; }` (content-hashed, hence
  immutable) and `location = /index.html { expires -1; }` (must be revalidated, or
  a client pins itself to a bundle that a later build replaced). `/` reaches the
  second location because `try_files` internally redirects to `/index.html`. Both
  use `expires`, never `add_header`: an `add_header` inside a location cancels
  every `add_header` inherited from the `server` block, which would silently drop
  the CSP/HSTS headers from these responses.

The `nginx/conf/app.inc` "shared server body" is retained in the repo as a
reference, but nothing wires it into the running nginx: `nginx.conf` never
`include`s it, `nginx/Dockerfile` does not `COPY` it, and `compose.yaml`
bind-mounts only `conf/nginx.conf`. Its routing duplicates the inline `server {}`
block in `nginx.conf` (which additionally carries the rate-limiting zones
`app.inc` lacks), so `include`-ing it would fail with a duplicate-`location`
error. `nginx.conf` is the single source of truth.
