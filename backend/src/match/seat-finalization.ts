import type Redis from 'ioredis';

// Readers for the engine's game state (Redis hash `game:<gameId>`, field
// `state`). Both fail open, so an unreadable state never hides a seat or a room.

// Seat statuses the engine treats as terminal: the player can never rejoin.
const TERMINAL_SEAT_STATUSES = ['exited'] as const;

// Whether the engine has finalized this seat, meaning it can never be rejoined.
// A missing or unreadable state returns false, so a bad read never hides a
// legitimate seat.
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
    return (
      seat?.status !== undefined &&
      (TERMINAL_SEAT_STATUSES as readonly string[]).includes(seat.status)
    );
  } catch {
    return false;
  }
}

// Whether the engine has already started the game in this room. Read from the
// engine state, because the match:* hash can lag behind it. The full rule is in
// docs/backend/backend-match-module.md.
export async function isEngineGameStarted(redis: Redis, gameId: string): Promise<boolean> {
  if (!gameId) return false;
  const raw = await redis.hget(`game:${gameId}`, 'state');
  if (!raw) return false;
  try {
    const state = JSON.parse(raw) as { status?: string };
    return state.status !== undefined && state.status !== 'waiting';
  } catch {
    return false;
  }
}
