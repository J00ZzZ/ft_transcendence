import { GameState, PlayerColor, GameEvent } from './types';
import { RedisGameStore } from './redis';
import { ClashManager } from './clash';

const COLORS: PlayerColor[] = ['blue', 'red', 'green', 'yellow'];
const DISCONNECT_GRACE_MS = 45000; // 45 seconds to reconnect before the player is pruned (PvP window)
const BOT_DISCONNECT_GRACE_MS = 60 * 60 * 1000; // 1 hour to reconnect before auto-abort (bot-mode games)

/**
 * First active seat in color order. Game creation always seeds
 * currentTurn as 'blue', but colors can be swapped pre-game (see
 * LobbyManager.handleSelectColor) so blue isn't guaranteed to be occupied
 * by the time the match starts — currentTurn must be corrected to an
 * actually-seated color or the game soft-locks on an inactive seat.
 */
export function firstActiveColor(state: GameState): PlayerColor | undefined {
  return COLORS.find(c => state.players.find(p => p.color === c)?.status === 'active');
}

/**
 * Advance turn to the next seated (active) player.
 * Mutates state in-place.
 */
export function advanceTurnInState(state: GameState): void {
  const currentIndex = COLORS.indexOf(state.currentTurn);
  let nextIndex = (currentIndex + 1) % 4;

  let loopCount = 0;
  while (loopCount < 4) {
    // .find by color, not an index into state.players — the array only
    // holds entries for seats actually in the match (see redis.ts
    // createGame's activeColors), so it's shorter than 4 for < 4-player
    // games and no longer aligned 1:1 with COLORS by position.
    const p = state.players.find(pl => pl.color === COLORS[nextIndex]);
    // Only an *active* seat can hold the turn — 'inactive' means the seat was
    // never joined at all (e.g. the unused 2 colors in a 2-player match), and
    // was previously falling through this check, permanently stalling the
    // turn on a seat nobody controls.
    if (p?.status === 'active') {
      break;
    }
    nextIndex = (nextIndex + 1) % 4;
    loopCount++;
  }

  if (loopCount >= 4) {
    state.status = 'finished';
  }
  state.currentTurn = COLORS[nextIndex];
  state.firstRollOfTurn = true;
  // Reset the new player's 6-streak so it never leaks across turns.
  const nextPlayer = state.players.find(p => p.color === COLORS[nextIndex]);
  if (nextPlayer) nextPlayer.consecutiveSixes = 0;
}

/**
 * Handle a player disconnect with a grace period.
 * Instead of immediately exiting, marks the player as 'disconnected'
 * and schedules a forfeit after DISCONNECT_GRACE_MS.
 * If the player reconnects within the window, the disconnect is cleared.
 */
export async function handlePlayerDisconnect(
  store: RedisGameStore,
  emit: (event: GameEvent) => void,
  gameId: string,
  color: PlayerColor,
  clashManager?: ClashManager,
  notifyAbort?: (gameId: string) => void,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state) return;

  // Check if already disconnected
  const existing = state.disconnectedPlayers.find(d => d.color === color);
  if (existing) return; // Already in grace period

  // Determine mode up-front: bot-mode games PAUSE on disconnect (and use a
  // long reconnect window), PvP games HOLD the disconnected player's turn for
  // the short window then prune on expiry.
  const matchData = await store.getMatchData(gameId);
  const isBotMode = matchData?.gameType === 'PVE' || matchData?.gameType === 'HOTSEAT';
  const graceMs = isBotMode ? BOT_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_MS + 1000;

  const deadline = Date.now() + (isBotMode ? BOT_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_MS);
  state.disconnectedPlayers.push({
    color,
    disconnectedAt: Date.now(),
    reconnectDeadline: deadline,
  });

  // Mark player as disconnected (not exited — they can still reconnect)
  const player = state.players.find(p => p.color === color);
  if (player && player.status === 'active') {
    player.status = 'disconnected';
    player.isConnected = false;
  }

  // HOLD the turn: the disconnected player's turn always waits (up to the
  // grace window) — it never advances past them, so a mid-turn disconnect
  // can't be exploited to skip a player. Pending dice/moves are preserved so
  // a reconnect resumes the exact turn state. Pruning only happens on expiry
  // of the grace window below, or via the explicit `end_game` event.
  if (isBotMode && state.status === 'active') {
    // Pause bot-mode games at a deterministic boundary so bots don't keep
    // playing while the human is away. If a bot was mid-chain, the pause
    // lands on the next bot's start (see server.ts triggerBotTurn guard).
    state.paused = true;
    state.pauseTurnOwner = state.currentTurn;
  }

  // If there's an active clash, freeze it — no separate timeout needed
  if (clashManager && state.clash) {
    await clashManager.freezeClash(gameId, color);
  }

  await store.saveGameState(gameId, state);
  // Announce a TEMPORARY disconnect (not a permanent exit): the room keeps the
  // player visible as 'disconnected' so the host sees "Reconnecting…" instead
  // of the player vanishing. player_exited now only fires on genuine permanent
  // exit (grace expiry, end_game, resign).
  emit({ type: 'player_disconnected', gameId, color });

  // Grace timeout: reconnect window, NOT a forfeit. On expiry:
  //  - bot-mode (PVE/HOTSEAT): auto-abort the whole instance (player counted
  //    as aborted, no result posted) — Resume becomes unreachable.
  //  - PvP: prune just this player; if fewer than 2 humans remain the game
  //    cannot continue and the room is aborted/cleaned up too.
  setTimeout(async () => {
    const currentState = await store.loadGameState(gameId);
    if (!currentState) return;

    const disc = currentState.disconnectedPlayers.find(d => d.color === color);
    if (!disc) return; // Already reconnected

    // Check if deadline has passed
    if (Date.now() >= disc.reconnectDeadline) {
      // Resolve any frozen clash against this player
      if (currentState.clash && currentState.clash.waitingForReconnect === color) {
        const other = currentState.clash.attacker === color
          ? currentState.clash.defender
          : currentState.clash.attacker;
        // Resolve the clash immediately
        if (clashManager) {
          await clashManager.resolveClash(gameId, other, color);
        }
      }
      await handlePlayerExit(store, emit, gameId, color);
      if (isBotMode) {
        // Definitive abort of the whole instance.
        await store.abortMatch(gameId);
        await store.deleteGame(gameId);
        notifyAbort?.(gameId);
      } else {
        // Count humans from the FRESH engine state after the prune — the
        // match hash captured at disconnect time still lists the pruned user,
        // which made a 2-player room never look like it dropped below 2.
        const after = await store.loadGameState(gameId);
        const humansLeft = (after?.players ?? [])
          .filter(p => p.status === 'active' && !p.isBot).length;
        if (!after || humansLeft < 2) {
          await store.abortMatch(gameId);
          await store.deleteGame(gameId);
          notifyAbort?.(gameId);
        }
      }
    }
  }, graceMs);
}

/**
 * Handle a player reconnecting within the grace period.
 */
export async function handlePlayerReconnect(
  store: RedisGameStore,
  gameId: string,
  color: PlayerColor,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state) return;

  const discIndex = state.disconnectedPlayers.findIndex(d => d.color === color);
  if (discIndex === -1) return; // Not in grace period

  const disc = state.disconnectedPlayers[discIndex];
  if (Date.now() > disc.reconnectDeadline) {
    // Too late — player is already forfeited
    return;
  }

  // Remove from disconnect list
  state.disconnectedPlayers.splice(discIndex, 1);

  // Restore player to active
  const player = state.players.find(p => p.color === color);
  if (player) {
    player.status = 'active';
    player.isConnected = true;
  }

  await store.saveGameState(gameId, state);
}

/**
 * Handle a player clicking "ready".
 * When all joined players are ready, transitions game to 'active'.
 */
export async function handlePlayerReady(
  store: RedisGameStore,
  emit: (event: GameEvent) => void,
  gameId: string,
  color: PlayerColor,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state || state.status !== 'waiting') return;

  // Add to ready list if not already there
  if (!state.readyPlayers.includes(color)) {
    state.readyPlayers.push(color);
  }

  await store.saveGameState(gameId, state);

  // Check if game should start (delegate to lobby manager if available).
  // Requires >= 2 active seats — a lone host marking themselves ready must
  // not be able to flip a pvp match to 'active' with nobody else in the room.
  const activeCount = state.players.filter(p => p.status === 'active').length;
  const allReady = activeCount >= 2 &&
    state.players.filter(p => p.status === 'active').every(p => state.readyPlayers.includes(p.color));

  if (allReady) {
    state.currentTurn = firstActiveColor(state) ?? state.currentTurn;
    state.status = 'active';
    await store.saveGameState(gameId, state);
    emit({ type: 'game_started', gameId });
  }
}

/**
 * Resign — concede a live match.
 */
export async function handlePlayerResign(
  store: RedisGameStore,
  emit: (event: GameEvent) => void,
  gameId: string,
  color: PlayerColor,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state) return;
  if (state.status !== 'active') return; // already over, or still in the lobby

  const player = state.players.find((p) => p.color === color);
  if (!player || player.status === 'resigned' || player.status === 'exited') return;

  player.status = 'resigned';
  player.isFinished = true;
  player.finishedAt = new Date().toISOString();
  player.isConnected = false;
  state.disconnectedPlayers = state.disconnectedPlayers.filter((d) => d.color !== color);
  if (state.clash) delete state.clash;

  // Who is still playing? Bots count — conceding to a bot is still a loss.
  const stillPlaying = state.players.filter(
    (p) => p.status === 'active' && !p.isFinished,
  );

  if (stillPlaying.length <= 1) {
    state.status = 'finished';
    state.winner = stillPlaying[0]?.color ?? state.winner;
    state.resultDetail = 'resignation';
    await store.saveGameState(gameId, state);
    emit({ type: 'player_resigned', gameId, color });
    if (state.winner) {
      emit({
        type: 'game_ended',
        gameId,
        winner: state.winner,
        resultDetail: 'resignation',
      });
    }
    return;
  }

  if (state.currentTurn === color) advanceTurnInState(state);
  await store.saveGameState(gameId, state);
  emit({ type: 'player_resigned', gameId, color });
}

export async function handlePlayerExit(
  store: RedisGameStore,
  emit: (event: GameEvent) => void,
  gameId: string,
  color: PlayerColor,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state) return;

  // Remove from disconnect list if present
  state.disconnectedPlayers = state.disconnectedPlayers.filter(d => d.color !== color);

  for (const piece of state.pieces.filter(p => p.color === color)) {
    piece.step = -1;
  }

  const player = state.players.find(p => p.color === color);
  if (player) {
    player.status = 'exited';
    player.isConnected = false;
    player.isFinished = true;
  }

  if (state.currentTurn === color && state.status === 'active') {
    advanceTurnInState(state);
  }

	// Clear any pending clash state on exit
	if (state.clash) {
		delete state.clash;
	}

	await store.saveGameState(gameId, state);
	emit({ type: 'player_exited', gameId, color });

	// Waiting-room cleanup: a guest leaving a PvP lobby must leave their
	// Redis match-hash seat, otherwise the room counts 2 seated forever and
	// the 5-minute idle-abort (server.ts checkExpiredLobbies) never restarts
	// its countdown for the host. The host's own seat is never cleared —
	// that keeps their room rejoinable from the open-rooms list.
	if (state.status === 'waiting') {
		await store.clearMatchSeat(gameId, color);
	}
}
