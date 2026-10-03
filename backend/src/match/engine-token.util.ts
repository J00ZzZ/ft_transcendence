import type { JwtService } from '@nestjs/jwt';
import { requireSecret } from '../secrets';

// Audience carried by every engine match token. The engine rejects a token
// without it, so a session access token cannot be used as a match token.
export const ENGINE_TOKEN_AUDIENCE = 'ludo-engine';

// Match tokens outlive the 15m session access token: a player can be
// disconnected/refreshing mid-game for a while and still needs to rejoin.
export const ENGINE_TOKEN_TTL = '24h';

// Signs a match token for the engine with the engine secret and audience. The
// per-call secret override keeps the session and engine token families apart, so
// one leaked key cannot forge the other family.
export function signEngineToken(jwt: JwtService, payload: Record<string, unknown>): string {
  return jwt.sign(payload, {
    secret: requireSecret('ENGINE_JWT_SECRET'),
    audience: ENGINE_TOKEN_AUDIENCE,
    expiresIn: ENGINE_TOKEN_TTL,
  });
}
