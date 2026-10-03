import { createHash, timingSafeEqual } from 'node:crypto';

// Config/secrets live in the root .env, loaded into containers via compose's
// env_file and via dotenv for host-side scripts. Single lookup point.

// Read a config value by its env var name. Returns undefined if unset.
export function secret(name: string): string | undefined {
  return process.env[name] ?? undefined;
}

// Per-request Host check used by oauth.guards.ts (which OAuth strategy) and
// AuthController (which frontend origin to redirect to). ngrok forwards the
// original Host header, so tunnelled and local clients can coexist.
export function isTunnelRequest(host: string | undefined): boolean {
  return !!host && host.includes('ngrok');
}

// Like secret(), but throws instead of signing with undefined.
export function requireSecret(name: string): string {
  const value = secret(name);
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

// Constant-time comparison of a presented secret against its configured value.
// Both sides are hashed first, so a length mismatch cannot throw and the length
// itself does not leak. A missing configured value still throws (loudly).
export function verifySecret(name: string, provided: string | undefined): boolean {
  const expected = requireSecret(name);
  if (!provided) return false;
  return timingSafeEqual(
    createHash('sha256').update(provided).digest(),
    createHash('sha256').update(expected).digest(),
  );
}
