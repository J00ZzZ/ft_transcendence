import type Redis from 'ioredis';

// Whether the engine has finalized this seat, meaning the player can never
// rejoin it. Reads the engine's GameState and fails open (false) on a missing or
// unreadable state, so a bad read never hides a legitimate seat.
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
    return (
      seat?.status !== undefined &&
      (TERMINAL_SEAT_STATUSES as readonly string[]).includes(seat.status)
    );
  } catch {
    return false;
  }
}
