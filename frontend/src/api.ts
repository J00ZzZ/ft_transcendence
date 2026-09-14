import i18n from './i18n';

// Auth API helpers: on a 401, refresh once (shared across all callers) and
// retry. An expired refresh token means signed out; a blocked one returns its own
// status. See docs/frontend/frontend-store-system.md.

// ngrok needs this header to skip its first-request interstitial; other hosts
// ignore it. Headers go through the Headers constructor because spreading a
// Headers instance yields {}.
function withNgrokHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('ngrok-skip-browser-warning', 'true');
  return { ...init, headers };
}

// Refresh outcomes: 'ok' → retry the call; 'expired' → signed out; 'blocked' →
// refresh failed (rate limit/server/offline), keeping its status/retryAfter so
// callers don't mistake it for a logout.
type RefreshResult =
  | { outcome: 'ok' }
  | { outcome: 'expired' }
  | { outcome: 'blocked'; status: number; retryAfter: string | null };

let refreshing: Promise<RefreshResult> | null = null;

// Exported so callers (e.g. the store's refresh timer) can refresh before the
// token expires, sharing apiFetch's single in-flight request.
export function refreshOnce(): Promise<RefreshResult> {
  const pending = refreshing;
  if (pending !== null) return pending;
  refreshing = fetch('/api/auth/refresh', withNgrokHeader({ method: 'POST' }))
    .then((r): RefreshResult => {
      if (r.ok) return { outcome: 'ok' };
      if (r.status === 401 || r.status === 403) return { outcome: 'expired' };
      return { outcome: 'blocked', status: r.status, retryAfter: r.headers.get('Retry-After') };
    })
    .catch((): RefreshResult => ({ outcome: 'blocked', status: 503, retryAfter: null }))
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// fetch() for authenticated endpoints: on a 401 it refreshes once and retries.
// Expired refresh returns the 401 (signed out); blocked refresh returns its own
// status. Retries reuse `init`, so keep bodies as plain values, not streams.
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const finalInit = withNgrokHeader(init);
  const res = await fetch(input, finalInit);
  if (res.status !== 401) return res;

  const result = await refreshOnce();
  if (result.outcome === 'ok') return fetch(input, finalInit);
  if (result.outcome === 'expired') return res;

  return new Response(null, {
    status: result.status,
    headers: result.retryAfter ? { 'Retry-After': result.retryAfter } : undefined,
  });
}

// Maps a backend error `code` to a localized message (errors.<CODE>), with a few
// overrides that reuse existing keys. Returns null when there is no mapping, so
// callers fall back to the server's English message.
const ERROR_KEY_OVERRIDES: Record<string, string> = {
  AVATAR_INVALID_TYPE: 'profile.fileTypeError',
};

export function translateErrorCode(code: unknown): string | null {
  if (typeof code !== 'string' || code.length === 0) return null;
  const key = ERROR_KEY_OVERRIDES[code] ?? `errors.${code}`;
  return i18n.exists(key) ? i18n.t(key) : null;
}

// Typed JSON REST helpers built on apiFetch.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await apiFetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const b = body as { code?: string; message?: string | string[] } | null;
    const msg = b?.message;
    const localized = translateErrorCode(b?.code);
    throw new Error(
      localized ??
        (Array.isArray(msg)
          ? msg.join('. ')
          : (msg ?? i18n.t('common.requestFailed', { status: res.status }))),
    );
  }
  return res.json() as Promise<T>;
}

export const getApi = <T>(path: string) => request<T>(path);
export const postApi = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : undefined });
export const deleteApi = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'DELETE', body: body != null ? JSON.stringify(body) : undefined });
export const patchApi = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
