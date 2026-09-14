import { GameState, PlayerColor, GameEvent } from './types';
import { RedisGameStore } from './redis';

const COLORS: PlayerColor[] = ['blue', 'red', 'green', 'yellow'];
const DISCONNECT_GRACE_MS = 45000; // 45 seconds to reconnect before the player is pruned (PvP window)
const BOT_DISCONNECT_GRACE_MS = 60 * 60 * 1000; // 1 hour to reconnect before auto-abort (bot-mode games)

// First active seat in color order. currentTurn must always point at a
// seated color : pre-game color swaps mean 'blue' isn't guaranteed occupied,
// and an inactive currentTurn soft-locks the game.
export function firstActiveColor(state: GameState): PlayerColor | undefined {
  return COLORS.find((c) => state.players.find((p) => p.color === c)?.status === 'active');
}

// Advance turn to the next seated (active) player.
// Mutates state in-place.
export function advanceTurnInState(state: GameState): void {
  const currentIndex = COLORS.indexOf(state.currentTurn);
  let nextIndex = (currentIndex + 1) % 4;

  let loopCount = 0;
  while (loopCount < 4) {
    // Find by color, not index: state.players only holds seats actually in
    // the match (see redis.ts activeColors), so it isn't aligned 1:1 with
    // COLORS by position.
    const p = state.players.find((pl) => pl.color === COLORS[nextIndex]);
    // Only an *active* seat can hold the turn : 'inactive' seats were never
    // joined; skipping them prevents the turn stalling on a seat nobody
    // controls.
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
  const nextPlayer = state.players.find((p) => p.color === COLORS[nextIndex]);
  if (nextPlayer) nextPlayer.consecutiveSixes = 0;
}

// Handle a player disconnect: mark them 'disconnected' with a grace window
// (PvP 45s, bot-mode 1h) instead of an instant exit; reconnect clears it.
export async function handlePlayerDisconnect(
  store: RedisGameStore,
  emit: (event: GameEvent) => void,
  gameId: string,
  color: PlayerColor,
  notifyAbort?: (gameId: string) => void,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state) return;

  // Check if already disconnected
  const existing = state.disconnectedPlayers.find((d) => d.color === color);
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

  // Mark player as disconnected (not exited : they can still reconnect)
  const player = state.players.find((p) => p.color === color);
  if (player && player.status === 'active') {
    player.status = 'disconnected';
    player.isConnected = false;
  }

  // HOLD the turn: it never advances past a disconnected player (no skipping
  // via mid-turn disconnects), and pending dice/moves are preserved so a
  // reconnect resumes the exact state. Pruning happens on grace expiry only.
  if (isBotMode && state.status === 'active') {
    // Pause bot-mode games at a deterministic boundary so bots stop while
    // the human is away; the pause lands on the next bot's start.
    state.paused = true;
    state.pauseTurnOwner = state.currentTurn;
  }

  await store.saveGameState(gameId, state);
  // Announce a TEMPORARY disconnect: the player stays visible as
  // 'disconnected' so the host sees "Reconnecting…" : player_exited fires
  // only on genuine permanent exit.
  emit({ type: 'player_disconnected', gameId, color });

  // Grace timeout = reconnect window, NOT a forfeit. On expiry: bot-mode
  // auto-aborts the whole instance; PvP prunes just this player and aborts
  // the room if fewer than 2 humans remain.
  setTimeout(async () => {
    const currentState = await store.loadGameState(gameId);
    if (!currentState) return;

    const disc = currentState.disconnectedPlayers.find((d) => d.color === color);
    if (!disc) return; // Already reconnected

    // Check if deadline has passed
    if (Date.now() >= disc.reconnectDeadline) {
      await handlePlayerExit(store, emit, gameId, color);
      if (isBotMode) {
        // Definitive abort of the whole instance.
        await store.abortMatch(gameId);
        await store.deleteGame(gameId);
        notifyAbort?.(gameId);
      } else {
        // Count humans from the FRESH engine state after the prune : the
        // match hash captured at disconnect time still lists the pruned user,
        // which made a 2-player room never look like it dropped below 2.
        const after = await store.loadGameState(gameId);
        const humansLeft = (after?.players ?? []).filter(
          (p) => p.status === 'active' && !p.isBot,
        ).length;
        if (!after || humansLeft < 2) {
          await store.abortMatch(gameId);
          await store.deleteGame(gameId);
          notifyAbort?.(gameId);
        }
      }
    }
  }, graceMs);
}

// Handle a player reconnecting within the grace period.
export async function handlePlayerReconnect(
  store: RedisGameStore,
  gameId: string,
  color: PlayerColor,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state) return;

  const discIndex = state.disconnectedPlayers.findIndex((d) => d.color === color);
  if (discIndex === -1) return; // Not in grace period

  const disc = state.disconnectedPlayers[discIndex];
  if (Date.now() > disc.reconnectDeadline) {
    // Too late : player is already forfeited
    return;
  }

  // Remove from disconnect list
  state.disconnectedPlayers.splice(discIndex, 1);

  // Restore player to active
  const player = state.players.find((p) => p.color === color);
  if (player) {
    player.status = 'active';
    player.isConnected = true;
  }

  await store.saveGameState(gameId, state);
}

// Handle a player clicking "ready". When every active seat is ready the
// game transitions to 'active'.
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

  // Start gate: at least 2 active seats and every one of them ready. A lone
  // host marking themselves ready must not flip a pvp match to 'active' with
  // nobody else in the room.
  const activeCount = state.players.filter((p) => p.status === 'active').length;
  const allReady =
    activeCount >= 2 &&
    state.players
      .filter((p) => p.status === 'active')
      .every((p) => state.readyPlayers.includes(p.color));

  if (allReady) {
    state.currentTurn = firstActiveColor(state) ?? state.currentTurn;
    state.status = 'active';
    await store.saveGameState(gameId, state);
    emit({ type: 'game_started', gameId });
  }
}

// Resign : concede a live match.
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

  // Who is still playing? Bots count : conceding to a bot is still a loss.
  const stillPlaying = state.players.filter((p) => p.status === 'active' && !p.isFinished);

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

// Player leaves the game on purpose: remove their pieces from the board,
// mark them exited, advance the turn, and clean up their waiting-room seat.
// Called by LudoEngine.handlePlayerExit (socket 'leave_game').
export async function handlePlayerExit(
  store: RedisGameStore,
  emit: (event: GameEvent) => void,
  gameId: string,
  color: PlayerColor,
  // Waiting-room only: true frees the seat outright (abort). Default false
  // RESERVES it, so a player who returned to the lobby reclaims the same
  // colour instead of being handed a new one on rejoin.
  freeSeat = false,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state) return;

  // Remove from disconnect list if present
  state.disconnectedPlayers = state.disconnectedPlayers.filter((d) => d.color !== color);

  for (const piece of state.pieces.filter((p) => p.color === color)) {
    piece.step = -1;
  }

  const player = state.players.find((p) => p.color === color);
  if (player) {
    if (state.status === 'waiting') {
      // Waiting room: the player is away, not out. The seat is hidden as
      // 'inactive' and restored on rejoin; the finished flags stay untouched.
      player.status = 'inactive';
      player.isConnected = false;
    } else {
      // Live game: keep the seat visible as 'exited' (the results logic prunes
      // on that status) and count the player as finished for scoring.
      player.status = 'exited';
      player.isConnected = false;
      player.isFinished = true;
    }
  }

  if (state.currentTurn === color && state.status === 'active') {
    advanceTurnInState(state);
  }

  await store.saveGameState(gameId, state);
  emit({ type: 'player_exited', gameId, color });

  // Waiting room: an abort frees the seat for someone else; simply leaving
  // reserves it so the player keeps their colour.
  if (state.status === 'waiting') {
    if (freeSeat) await store.clearMatchSeat(gameId, color);
    else await store.reserveMatchSeat(gameId, color);
  }
}
