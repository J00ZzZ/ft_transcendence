# Tunnel mode (ngrok)

Reaching the app from anywhere on the internet, via ngrok. Companion doc:
[`nginx.md`](./nginx.md).

Verified directly against the current repo (`Makefile`, `backend/src/secrets.ts`,
`backend/src/auth/oauth.guards.ts`, `backend/src/auth/auth.controller.ts`).

## Commands

```
make ngrok-auth   # one-time: registers NGROK_AUTHTOKEN with the ngrok CLI
make tunnel       # = make all, then ngrok http https://localhost:$(NGROK_PORT)
make tunnel-url   # prints the current public URL from ngrok's local API (:4040)
make dev-tunnel   # opens two Terminal.app tabs: `make dev` + `make tunnel` (macOS only)
make stop-tunnel  # stops ngrok and the compose stack
```

## The dedicated `:444` tunnel listener

`make tunnel` points ngrok **straight at nginx's TLS** —
`ngrok http https://localhost:$(NGROK_PORT)` (the `https://` scheme, not
`http://`, is deliberate: it tells ngrok to speak TLS to the local upstream
instead of forwarding plain HTTP at a TLS-only port). `NGROK_PORT` defaults to
**8444**, which is nginx's dedicated tunnel listener
(`127.0.0.1:8444 → :444`, loopback-only) — see [`nginx.md`](./nginx.md).
ngrok doesn't verify the self-signed cert by default, so that's not an issue.

That listener is separate from the direct `:443` (`localhost:8443`) one because
ngrok rewrites the client address: the request arrives from the agent on
loopback, so `:444` takes the real visitor's IP from `X-Forwarded-For`
(`set_real_ip_from` + `real_ip_header` + `real_ip_recursive`). Per-IP throttling
thus follows each visitor instead of lumping all tunnel traffic together —
which is the whole reason the tunnel has its own port. Both listeners `include`
the same server body (`nginx/conf/app.inc`), so routing, security headers and
rate limits never drift between the local and tunnel modes.

If `NGROK_DOMAIN` is set in `.env`, `make tunnel` passes
`--url=https://$(NGROK_DOMAIN)` so you get a stable, reusable ngrok domain
instead of a random one each run.

## Why OAuth needs two apps per provider

Google/GitHub/42 OAuth apps are registered with one fixed, pre-approved
callback URL. A tunnel's public URL is a different origin from
`https://localhost:8443`, so **one** OAuth app can't cover both — you'd have
to reconfigure the provider's callback URL every time you switched modes.
Instead, the app reuses the **same OAuth client credentials** for local and
tunnel mode and registers a **second callback URL** per provider
(`NGROK_GOOGLE_CALLBACK_URL`, etc. — the `NGROK_*_CALLBACK_URL` entries in
`TUNNEL_VARS`, see the `Makefile`). Google/GitHub/42 OAuth apps allow multiple
pre-approved redirect URIs, so both callback URLs can be listed on the single
app. Both Passport strategies are active on the backend **at the same time**.

Which one handles a given request is resolved **per request**, not at boot,
because a local client and a tunnelled client can both be live against the
same running backend simultaneously:

```ts
// backend/src/secrets.ts
export function isTunnelRequest(host: string | undefined): boolean {
  return !!host && host.includes('ngrok')
}
```

ngrok forwards the browser's original `Host` header unmodified, so a request
that arrives through the tunnel includes the public `*.ngrok-free.dev` host;
a local request has `localhost`. `oauth.guards.ts`
checks this on every OAuth kickoff to pick the matching Passport strategy
(`google` vs `google-tunnel`, etc.), and `auth.controller.ts` uses the same
check to decide which `FRONTEND_URL` to redirect back to after login
(`FRONTEND_URL` vs `NGROK_FRONTEND_URL`).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NGROK_AUTHTOKEN` | yes | Required by `make ngrok-auth`, which `tunnel` depends on |
| `NGROK_DOMAIN` | no | Reserved ngrok domain, for a stable URL across restarts |
| `NGROK_PORT` | no | Default `8444` — the loopback port ngrok tunnels. It must match the `:444` tunnel listener's published port (`127.0.0.1:8444:444` in `compose.yaml`); the default lives in the `Makefile` and can be overridden in `.env` |
| `NGROK_FRONTEND_URL` | yes | Post-login redirect target for tunnelled requests |
| `GOOGLE_/GITHUB_/FORTYTWO_CLIENT_ID` + `_SECRET` + `_CALLBACK_URL` | yes | OAuth app credentials — shared by the local and tunnel strategies |
| `NGROK_GOOGLE_/GITHUB_/FORTYTWO_CALLBACK_URL` | yes | Tunnel callback URLs registered as extra redirect URIs on the same OAuth apps |

`make env` (a prerequisite of `make build`, so it runs on every path) reads
`.env`, validates that every required value (core secrets/DB URLs, OAuth apps,
tunnel credentials) is present and non-empty — failing hard with the missing
list otherwise.
Nothing is auto-generated (the one exception: `LAN_IP`, which `make env`
overwrites with the machine's current address so LAN mode cannot print a
stale URL): copy a real `.env` from a teammate.
