import type Redis from 'ioredis';

// Seat-finalization read: the single helper that answers "can this seat still
// be rejoined?" for both /api/games/mine (stop advertising) and the rejoin
// endpoint (refuse to mint a token).
//
// The engine owns the authoritative live game state (game:{gameId} hash, field
// "state" — one JSON blob). A seat whose PlayerMeta.status is 'exited' (pruned
// on grace expiry or End Game) is TERMINAL: the
// player can never resume that seat, so the backend must stop treating the
// match as rejoinable for them.
// The 'resigned' terminal status was removed with the unused concede path;
// the only terminal status is now 'exited'.
//
// Deliberately NOT terminal: 'disconnected' (grace window running — the player
// can still come back), 'inactive' (waiting-room leave, or a seat that has not
// joined a live game yet — both still rejoinable).
//
// Failure mode is fail-open: a missing/invalid state or a schema drift returns
// false, which restores today's behaviour (the match stays advertised) rather
// than locking legitimate players out. See docs/ludo-engine/
// ludo-engine-redis-system.md for the state schema.
const TERMINAL_SEAT_STATUSES = ['exited'] as const;

export async function isSeatFinalized(
  redis: Redis,
  gameId: string,
  color: string,
): Promise<boolean> {
  if (!gameId || !color) return false;
  const raw = await redis.hget(`game:${gameId}`, 'state');
  if (!raw) return false;
  try {
    const state = JSON.parse(raw) as { players?: Array<{ color?: string; status?: string }> };
    const seat = state.players?.find((p) => p.color === color);
    return seat?.status !== undefined && (TERMINAL_SEAT_STATUSES as readonly string[]).includes(seat.status);
  } catch {
    return false;
  }
}
