import { GameState, PlayerColor, GameEvent } from './types';
import { RedisGameStore } from './redis';

const COLORS: PlayerColor[] = ['blue', 'red', 'green', 'yellow'];
const DISCONNECT_GRACE_MS = 45000; // 45 seconds to reconnect before the player is pruned (PvP window)
const SINGLE_SOCKET_DISCONNECT_GRACE_MS = 60 * 60 * 1000; // 1 hour to reconnect before auto-abort (bot-mode games)

// First active seat in color order. currentTurn must always point at a
// seated color : pre-game color swaps mean 'blue' isn't guaranteed occupied,
// and an inactive currentTurn soft-locks the game.
export function firstActiveColor(state: GameState): PlayerColor | undefined {
	return COLORS.find((c) => state.players.find((p) => p.color === c)?.status === 'active');
}

// Advance turn to the next seated (active) player.
// Mutates state in-place.
// Scans state.players[] directly (players-as-truth). A disconnected seat whose
// grace window is still open HOLDS the turn (nobody else can act — turn
// ownership gates roll/move/bot actions — until it reconnects or is pruned);
// pruned/left seats are skipped. The explicit `paused` flag is separate and set
// only by handlePlayerDisconnect (a PvP player dropping during their own turn);
// this function clears it once its owner reconnects or is pruned, then advances.
// Idempotent: safe to call while paused.
export function advanceTurnInState(state: GameState): void {
	// If paused, check if the pause owner has reconnected or been pruned
	if (state.paused) {
		const pausedPlayer = state.players.find((p) => p.color === state.pauseTurnOwner);
		if (pausedPlayer?.status === 'active' || pausedPlayer?.status === 'exited') {
			// No longer in grace window — clear pause and continue advancing
			delete state.paused;
			delete state.pauseTurnOwner;
			delete state.pausedReason;
		} else {
			// Still in grace window — stay paused
			return;
		}
	}

	if (state.players.length === 0) {
		state.status = 'finished';
		return;
	}

	// Find current turn index in players array
	const currentIdx = state.players.findIndex((p) => p.color === state.currentTurn);
	if (currentIdx === -1) {
		state.status = 'finished';
		return;
	}

	// Scan forward for the next player who can take the turn.
	// Exited seats are skipped. Disconnected seats with running grace hold the
	// turn (the game waits there — turn ownership gates roll/move/bot actions —
	// until that seat reconnects or its grace expires and it is pruned).
	// Disconnected seats with expired grace are treated as exited.
	let loopCount = 0;
	let nextIdx = (currentIdx + 1) % state.players.length;
	while (loopCount < state.players.length) {
		const p = state.players[nextIdx];
		if (p.status === 'active') {
			state.currentTurn = p.color;
			break;
		}
		if (p.status === 'disconnected') {
			const disc = state.disconnectedPlayers.find((d) => d.color === p.color);
			if (disc && Date.now() < disc.reconnectDeadline) {
				// Grace still running — the turn waits on this seat. No pause flag
				// is needed: nobody else can act (it is not their turn), a
				// reconnect revives the seat in place, and grace expiry prunes it.
				state.currentTurn = p.color;
				break;
			}
			// Grace expired — treat as exited, keep scanning
		}
		// 'exited' or 'inactive' or expired disconnected — skip
		nextIdx = (nextIdx + 1) % state.players.length;
		loopCount++;
	}

	if (loopCount >= state.players.length) {
		// No active player found
		state.status = 'finished';
		return;
	}

	state.firstRollOfTurn = true;
	// A turn advance always begins a NEW player's turn, so the turn-scoped
	// snapshot left behind by the previous player must not survive: turnPhase and
	// the pending roll/move belong to them. Leaving them behind stranded the next
	// player whenever a seat left mid-WAITING_FOR_MOVE (a prune advanced
	// currentTurn but kept the departed player's pendingLegalMoves, so the new
	// player could neither roll — 'Invalid turn phase' — nor move a piece). The
	// resign path was removed with the unused concede route, so this no longer
	// applies to resign. rollDice's own callers already reset these; doing it here
	// makes the invariant hold for every caller.
	state.turnPhase = 'WAITING_FOR_ROLL';
	state.pendingLegalMoves = [];
	state.pendingDiceValue = undefined;
	state.pendingIsFirstRoll = undefined;
	const nextPlayer = state.players.find((p) => p.color === state.currentTurn);
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
	const isSingleSocketMode = matchData?.gameType === 'PVE' || matchData?.gameType === 'HOTSEAT';
	const graceMs = isSingleSocketMode ? SINGLE_SOCKET_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_MS + 1000;

	const deadline = Date.now() + (isSingleSocketMode ? SINGLE_SOCKET_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_MS);
	state.disconnectedPlayers.push({
		color,
		disconnectedAt: Date.now(),
		reconnectDeadline: deadline,
	});

	// Mark player as disconnected (not exited : they can still reconnect). The
	// guard above already proved this is a live, unfinished seat.
	player.status = 'disconnected';
	player.isConnected = false;

	// HOLD the turn: pause only in PvP when it's the disconnected player's own
	// turn (PvE/hotseat have no freeze concept — the game runs or is aborted).
	// If they disconnect during another player's turn, the game continues for
	// others; when the turn arrives at the disconnected player, it simply waits
	// there (turn ownership gates everyone). Pending dice/moves are preserved so
	// a reconnect resumes the exact state. Pruning happens on grace expiry only.
	if (
		!isSingleSocketMode &&
		state.currentTurn === color &&
		state.status === 'active'
	) {
		state.paused = true;
		state.pauseTurnOwner = color;
		state.pausedReason = 'disconnect_grace';
	}

	await store.saveGameState(gameId, state);
	// Announce a TEMPORARY disconnect: the player stays visible as
	// 'disconnected' so the host sees "Reconnecting…" : player_exited fires
	// only on genuine permanent exit.
	emit({ type: 'player_disconnected', gameId, color });
	// If the game just froze on this seat, push the paused state out so every
	// client shows the pause banner immediately instead of waiting for the
	// next unrelated event to sync them.
	if (state.paused && state.status === 'active') {
		emit({ type: 'state_update', gameId, state });
	}

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
	const isSingleSocketMode = matchData?.gameType === 'PVE' || matchData?.gameType === 'HOTSEAT';

	// Delegate to the unified exit chokepoint. For single-instance modes the room
	// is torn down wholesale after the seat is finalized; for PvP the quorum check
	// inside finalizeDeparture handles teardown if needed. Pass notifyAbort so it's
	// called when teardownRoom is invoked from finalizeDeparture (PvP quorum loss).
	await finalizeDeparture(store, emit, gameId, color, 'timeout', notifyAbort);
	if (isSingleSocketMode) {
		await teardownRoom(store, emit, gameId, notifyAbort);
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

	// If the game was paused waiting for this player, clear the pause so the
	// game can resume. Without this the game stays paused on a now-active
	// player — no one can end their turn to trigger clearance in advanceTurnInState.
	if (state.paused && state.pauseTurnOwner === color && player?.status === 'active') {
		delete state.paused;
		delete state.pauseTurnOwner;
		delete state.pausedReason;
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

// ── Unified exit-path helpers (Step 3) ──────────────────────────────────────

export type DepartureReason =
	| 'timeout'        // grace window expired (E2/E8)
	| 'leave'          // socket leave_game / tab-close prune in a live game (E3/E5)
	| 'end_game'       // End Game button, freeSeat semantics (E6)
	| 'waiting_leave'; // left a WAITING room: reversible, reserves the seat (E3 waiting branch)

// The ONE place a seat leaves a game. Shared skeleton + a per-reason body.
// Replaces the scattered exit bodies across handlePlayerExit, expireDisconnectedPlayer,
// and handleEndGame.
export async function finalizeDeparture(
	store: RedisGameStore,
	emit: (event: GameEvent) => void,
	gameId: string,
	color: PlayerColor,
	reason: DepartureReason,
	notifyAbort?: (gameId: string) => void,
): Promise<void> {
	const state = await store.loadGameState(gameId);
	if (!state) return;

	// Idempotency guard: a seat already terminal is a no-op.
	const player = state.players.find((p) => p.color === color);
	if (!player || player.status === 'exited' || player.status === 'inactive') return;

	// Clear any grace entry for this colour.
	state.disconnectedPlayers = state.disconnectedPlayers.filter((d) => d.color !== color);

	// Per-reason body.
	if (reason === 'waiting_leave') {
		// Waiting room: reversible leave. Set inactive, keep pieces untouched,
		// keep isFinished untouched (a stale finished flag would make the player look
		// already done at game start). Reserve the seat so rejoin returns the same colour.
		if (state.status === 'waiting') {
			player.status = 'inactive';
			player.isConnected = false;
			await store.saveGameState(gameId, state);
			await store.reserveMatchSeat(gameId, color);
			emit({ type: 'player_exited', gameId, color });
			return;
		}
		// Fall through to live-game handling if the room started while they were leaving.
	}

	// Live-game departure (timeout, leave, end_game): park pieces, mark exited.
	for (const piece of state.pieces.filter((p) => p.color === color)) {
		piece.step = -1;
	}
	player.status = 'exited';
	player.isConnected = false;
	player.isFinished = true;

	// End Game button frees the seat outright so the room can hand it to someone else.
	if (reason === 'end_game') {
		await store.clearMatchSeat(gameId, color);
	}

	// If the game was paused waiting for this player, clear the pause so the
	// game doesn't stall on a pruned seat. advanceTurnInState will move to the
	// next player who can take the turn.
	if (state.paused && state.pauseTurnOwner === color) {
		delete state.paused;
		delete state.pauseTurnOwner;
		delete state.pausedReason;
	}

	// Advance the turn if it was theirs.
	if (state.currentTurn === color && state.status === 'active') {
		advanceTurnInState(state);
	}

	await store.saveGameState(gameId, state);
	emit({ type: 'player_exited', gameId, color });
	// A live-game exit changes state no other event carries: the turn may have
	// moved off the departed seat and every one of their pieces is now off the
	// board. Without this frame each client keeps rendering the departed player's
	// turn (and their pieces) until some unrelated event happens to sync them.
	if (state.status === 'active') {
		emit({ type: 'state_update', gameId, state });
	}

	// Evaluate quorum; if lost, tear the room down.
	if (!hasQuorum(state)) {
		await teardownRoom(store, emit, gameId, notifyAbort);
	}
}

// The ONE place a room is torn down: abort + delete + emit game_expired + clear
// in-memory (userIdMap, bots). Replaces the 6 duplicated copies.
export async function teardownRoom(
	store: RedisGameStore,
	emit: (event: GameEvent) => void,
	gameId: string,
	notify?: (gameId: string) => void,
): Promise<void> {
	emit({ type: 'game_expired', gameId });
	await store.abortMatch(gameId);
	await store.deleteGame(gameId);
	notify?.(gameId);
}

// The ONE quorum predicate, currently duplicated at player-handler.ts:173-181
// and post-game.ts:56-68.
export function hasQuorum(state: GameState): boolean {
	return state.players.filter((p) => p.status === 'active' && !p.isBot).length >= 2;
}
