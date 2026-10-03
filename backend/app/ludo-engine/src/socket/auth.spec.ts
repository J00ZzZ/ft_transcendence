import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyToken, ENGINE_TOKEN_AUDIENCE } from './auth';

// A session access token is signed with a different secret and carries no engine
// audience, so the engine must never accept one as a match token.
const SECRET = 'test-engine-secret';
const OTHER_SECRET = 'test-session-secret';

// Minimal HS256 encoder for the test tokens, matching how the backend signs them.
function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signToken(
  payload: Record<string, unknown>,
  secret: string,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): string {
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

function enginePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gameId: 'game-1',
    playerId: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    role: 'player1',
    color: 'red',
    mode: 'pvp',
    aud: ENGINE_TOKEN_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe('verifyToken (ludo-engine socket auth)', () => {
  beforeEach(() => {
    process.env.ENGINE_JWT_SECRET = SECRET;
  });

  it('accepts a valid engine token and exposes the account + seat', () => {
    const out = verifyToken(signToken(enginePayload(), SECRET));
    expect(out).toMatchObject({
      gameId: 'game-1',
      userId: 'user-1',
      username: 'alice',
      displayName: 'Alice',
      role: 'player1',
      color: 'red',
      mode: 'pvp',
    });
  });

  it('rejects a token signed with a different secret (session-token replay)', () => {
    // Same claims, signed with the session secret.
    expect(verifyToken(signToken(enginePayload(), OTHER_SECRET))).toBeNull();
  });

  it('rejects a correctly-signed token that carries no aud', () => {
    const payload = enginePayload();
    delete payload.aud;
    expect(verifyToken(signToken(payload, SECRET))).toBeNull();
  });

  it('rejects a correctly-signed token with the wrong aud', () => {
    const token = signToken(enginePayload({ aud: 'transcendence-session' }), SECRET);
    expect(verifyToken(token)).toBeNull();
  });

  it('rejects alg:none (unsigned) tokens', () => {
    const token = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(enginePayload())}.`;
    expect(verifyToken(token)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = signToken(enginePayload(), SECRET);
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(verifyToken(tampered)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signToken(enginePayload({ exp: Math.floor(Date.now() / 1000) - 10 }), SECRET);
    expect(verifyToken(token)).toBeNull();
  });

  it('falls back from playerId to sub, then userId', () => {
    const sub = signToken(enginePayload({ playerId: undefined, sub: 'sub-user' }), SECRET);
    expect(verifyToken(sub)?.userId).toBe('sub-user');
    const uid = signToken(enginePayload({ playerId: undefined, userId: 'uid-user' }), SECRET);
    expect(verifyToken(uid)?.userId).toBe('uid-user');
  });

  it('rejects malformed input instead of throwing', () => {
    expect(verifyToken('not-a-jwt')).toBeNull();
    expect(verifyToken('a.b')).toBeNull();
  });

  it('returns null when ENGINE_JWT_SECRET is unset', () => {
    delete process.env.ENGINE_JWT_SECRET;
    expect(verifyToken(signToken(enginePayload(), SECRET))).toBeNull();
  });
});
