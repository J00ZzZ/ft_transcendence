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
  // A turn advance always begins a NEW player's turn, so the turn-scoped
  // snapshot left behind by the previous player must not survive: turnPhase and
  // the pending roll/move belong to them. Leaving them behind stranded the next
  // player whenever a seat left mid-WAITING_FOR_MOVE (a prune or a resignation
  // advanced currentTurn but kept the departed player's pendingLegalMoves, so the
  // new player could neither roll — 'Invalid turn phase' — nor move a piece).
  // rollDice's own callers already reset these; doing it here makes the
  // invariant hold for every caller.
  state.turnPhase = 'WAITING_FOR_ROLL';
  state.pendingLegalMoves = [];
  state.pendingDiceValue = undefined;
  state.pendingIsFirstRoll = undefined;
  const nextPlayer = state.players.find((p) => p.color === COLORS[nextIndex]);
  if (nextPlayer) {
    // Reset the new player's turn-scoped flags so nothing leaks across turns:
    // the 6-streak, the "already rolled" flag, and a bonus roll they never
    // earned.
    nextPlayer.consecutiveSixes = 0;
    nextPlayer.hasRolled = false;
    nextPlayer.bonusRoll = false;
  }
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

  // Only a seat that can actually come back gets a window. A seat is no longer
  // resumable once it is exited (left, or pruned by an expired window) or the
  // match is finished : every one of its pieces is parked at step -1. Parking
  // such a seat in disconnectedPlayers is what let a later join_game take the
  // reconnect branch and flip it back to 'active' with all four pieces still at
  // -1 : MoveValidator skips step < 0, so that seat could never produce a legal
  // move and its turn auto-passed forever (a "zombie" seat).
  const player = state.players.find((p) => p.color === color);
  if (!player || player.status !== 'active' || player.isFinished) return;

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

  // Mark player as disconnected (not exited : they can still reconnect). The
  // guard above already proved this is a live, unfinished seat.
  player.status = 'disconnected';
  player.isConnected = false;

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
  //
  // The timer is only a convenience: expireDisconnectedPlayer re-reads the
  // window from Redis, so the server's periodic sweep can replay the same call.
  // A restart between disconnect and expiry would otherwise lose this timer and
  // leave the seat 'disconnected' with the turn held on it forever.
  setTimeout(() => {
    void expireDisconnectedPlayer(store, emit, gameId, color, notifyAbort);
  }, graceMs);
}

// Expire a grace window FOR REAL, with the window Redis holds as the source of
// truth: prune the seat, or abort the room when too few humans remain. Safe to
// call from anywhere and more than once : it no-ops unless the entry still
// exists and its deadline has actually passed, so the in-process timer and the
// server's sweep can both call it.
export async function expireDisconnectedPlayer(
  store: RedisGameStore,
  emit: (event: GameEvent) => void,
  gameId: string,
  color: PlayerColor,
  notifyAbort?: (gameId: string) => void,
): Promise<void> {
  const state = await store.loadGameState(gameId);
  if (!state) return;

  const disc = state.disconnectedPlayers.find((d) => d.color === color);
  if (!disc) return; // Already reconnected or already pruned
  if (Date.now() < disc.reconnectDeadline) return; // Window still open

  const matchData = await store.getMatchData(gameId);
  const isBotMode = matchData?.gameType === 'PVE' || matchData?.gameType === 'HOTSEAT';

  await handlePlayerExit(store, emit, gameId, color);
  if (isBotMode) {
    // Definitive abort of the whole instance.
    await store.abortMatch(gameId);
    await store.deleteGame(gameId);
    notifyAbort?.(gameId);
    return;
  }

  // Count humans from the FRESH engine state after the prune : the match hash
  // captured at disconnect time still lists the pruned user, which made a
  // 2-player room never look like it dropped below 2.
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

// Handle a player reconnecting within the grace period. Returns true only when
// the seat was actually restored : false means the window outlived its seat (it
// was pruned, left, or the match finished while the window was open), so the
// caller must reject the join instead of seating a player who cannot move.
// `displayName` is the name the client reports now : a player may have renamed
// while they were away, so a reconnect also refreshes the shown name.
export async function handlePlayerReconnect(
  store: RedisGameStore,
  gameId: string,
  color: PlayerColor,
  displayName?: string,
): Promise<boolean> {
  const state = await store.loadGameState(gameId);
  if (!state) return false;

  const discIndex = state.disconnectedPlayers.findIndex((d) => d.color === color);
  if (discIndex === -1) return false; // Not in grace period

  const disc = state.disconnectedPlayers[discIndex];
  if (Date.now() > disc.reconnectDeadline) {
    // Too late : player is already forfeited
    return false;
  }

  // The window always clears, even when nothing is restored : a stale entry
  // must never linger, or the next join_game would take the reconnect branch
  // again and resurrect this seat.
  state.disconnectedPlayers.splice(discIndex, 1);

  // Restore the seat only if a disconnect truly parked it. A seat pruned or
  // finished while the window was open has no pieces left to resume with, so
  // reviving it would strand a seat that can never move (see
  // handlePlayerDisconnect). Removal stays final.
  const player = state.players.find((p) => p.color === color);
  const revived = !!player && player.status === 'disconnected' && !player.isFinished;
  if (player && revived) {
    player.status = 'active';
    player.isConnected = true;
    if (displayName) player.displayName = displayName;
  }

  await store.saveGameState(gameId, state);
  return revived;
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
  // The turn moved off the resigning seat while their pieces stay on the board:
  // sync the room, or every client keeps showing the resigned player as the one
  // to play until the next roll/move event happens to carry the turn.
  emit({ type: 'state_update', gameId, state });
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
  // A live-game exit changes state no other event carries: the turn may have
  // moved off the departed seat and every one of their pieces is now off the
  // board. Without this frame each client keeps rendering the departed player's
  // turn (and their pieces) until some unrelated event happens to sync them —
  // which, if the player the turn moved TO is also disconnected, means the board
  // looks frozen on someone who has already been removed.
  if (state.status === 'active') {
    emit({ type: 'state_update', gameId, state });
  }

  // Waiting room: an abort frees the seat for someone else; simply leaving
  // reserves it so the player keeps their colour.
  if (state.status === 'waiting') {
    if (freeSeat) await store.clearMatchSeat(gameId, color);
    else await store.reserveMatchSeat(gameId, color);
  }
}
