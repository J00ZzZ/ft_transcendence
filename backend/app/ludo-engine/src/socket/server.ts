import { Server } from 'socket.io';
import * as http from 'http';
import { LudoEngine } from '../engine';
import { RedisGameStore } from '../redis';
import { ClashManager } from '../clash';
import { getOrCreateBot, isBotPlayer } from '../bot';
import { EventPublisher } from './event-publisher';
import { RedisBroadcaster } from './redis-broadcaster';
import { ResultSubmitter } from './result-submitter';
import { SocketHandlers } from './socket-handlers';
import { verifyToken, GameSocket } from './auth';
import { LobbyManager } from '../lobby';
import type { PlayerColor } from '../types';

const SLOT_COLORS: PlayerColor[] = ['blue', 'red', 'green', 'yellow'];

// A WAITING PvP room with fewer than 2 seated players is idle; once it has
// been idle this long the room is aborted (friend on the way? give them time).
const IDLE_LOBBY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POST_GAME_TIMEOUT_MS = 60 * 1000; // 60 seconds

// Mirrors the frontend's STEP_ANIM_MS (Game.tsx) — how long the box-by-box
// piece-move animation takes per step. Bot turns are paced against this so a
// bot's move finishes animating on screen before the bot's next action (roll,
// bonus move, capture chain) fires and cuts it off.
const BOT_STEP_ANIM_MS = 220;
// Flat "thinking" pause before a bot rolls, so bot turns don't feel instant.
const BOT_THINK_MS = 500;

/**
 * SocketServer orchestrates the ludo engine, socket connections,
 * Redis pub/sub, bot management, and game lifecycle.
 *
 * Business logic for each socket event lives in SocketHandlers.
 */
export class SocketServer {
	private io!: Server;
	private httpServer!: http.Server;
	private store: RedisGameStore;
	private engine: LudoEngine;
	private clashManager: ClashManager;
	private publisher: EventPublisher;
	private broadcaster: RedisBroadcaster;
	private resultSubmitter: ResultSubmitter;
	private handlers: SocketHandlers;
  private userIdMap: Map<string, Map<PlayerColor, string>> = new Map();
  private rematchVotes: Map<string, Set<string>> = new Map();
	private gameEndedAt: Map<string, number> = new Map();
  private botTurnTimers = new Map<string, NodeJS.Timeout>();

	constructor() {
		this.store = new RedisGameStore();
		this.publisher = new EventPublisher(this.store);
		this.clashManager = new ClashManager(this.store, this.publisher);
		this.engine = new LudoEngine(this.store, this.clashManager);
		const lobbyManager = new LobbyManager(this.store, this.publisher);
		this.engine.setLobbyManager(lobbyManager);
		this.broadcaster = new RedisBroadcaster();
		this.resultSubmitter = new ResultSubmitter(
			this.engine, this.store, this.userIdMap,
			(gameId) => this.cleanupGame(gameId),
		);
		this.handlers = new SocketHandlers(
			this.store, this.engine, this.clashManager,
			this.userIdMap, getOrCreateBot,
			(gameId) => this.triggerBotTurn(gameId, BOT_THINK_MS),
			(gameId) => {
				// A grace timeout dropped the room below the minimum human count
				// (or a bot-mode disconnect window fully expired): tell any
				// surviving client the room is gone so they leave cleanly.
				this.io.to(gameId).emit('game_expired');
				this.cleanupGame(gameId);
			},
		);

		// Wire up engine events — single source of truth for game lifecycle
		this.engine.onEvent((event) => {
			this.publisher.publish(event);

			if (event.type === 'game_ended') {
				this.handleGameEnd(event.gameId);
				this.resultSubmitter.submitGameResult(event.gameId);
			} else if (event.type === 'game_started') {
				this.triggerBotTurn(event.gameId, BOT_THINK_MS);
				this.resultSubmitter.notifyGameStarted(event.gameId);
			} else if (event.type === 'piece_moved') {
				// Wait for the move's box-by-box animation to finish on screen
				// (path.length steps) plus a short thinking pause before acting again.
				const animMs = event.result.path.length * BOT_STEP_ANIM_MS;
				this.triggerBotTurn(event.gameId, animMs + BOT_THINK_MS);
			} else if (event.type === 'dice_rolled') {
				// Only trigger bot turn if no legal moves (turn auto-advanced)
				// Wait for the 750ms frontend dice-roll animation plus thinking pause
				if (event.legalMoves.length === 0) {
					this.triggerBotTurn(event.gameId, 750 + BOT_THINK_MS);
				}
			}
		});
	}

	async start(port: number): Promise<void> {
		await this.store.connect();

		this.httpServer = http.createServer((req, res) => {
			if (req.url === '/health' && req.method === 'GET') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
				return;
			}
			res.writeHead(404);
			res.end();
		});

		this.io = new Server(this.httpServer, {
			cors: {
				origin: process.env.CORS_ORIGIN || '*',
				methods: ['GET', 'POST']
			}
		});

		this.broadcaster.start(this.io);
		this.setupSocketHandlers();

		this.httpServer.listen(port, () => {
			console.log(`Ludo engine listening on port ${port}`);
		});

		// Periodic check for expired lobbies
		setInterval(() => this.checkExpiredLobbies(), 60_000);
	}

	async stop(): Promise<void> {
		await this.store.disconnect();
		await this.broadcaster.disconnect();
		this.httpServer.close();
	}

	/**
	 * If the current turn belongs to a bot, execute its turn after `delayMs`.
	 * The delay lets any in-flight move-animation on the frontend finish
	 * before the bot's next action is broadcast. Runs inside the queue so
	 * it's serialized with human moves and cannot overlap.
	 */
	private triggerBotTurn(gameId: string, delayMs: number): void {
		// Cancel an old timer for this game so we never stack overlapping bot
		// turns (safer than relying on takeTurn's phase guard alone).
		if (this.botTurnTimers.has(gameId)) {
			clearTimeout(this.botTurnTimers.get(gameId)!);
		}
		const timer = setTimeout(() => {
			this.botTurnTimers.delete(gameId);
			this.store.loadGameState(gameId).then(state => {
				if (!state || state.status !== 'active') return;
				// Pause-air guard: while a bot-mode game is paused, the IN-FLIGHT
				// bot (currentTurn === pauseTurnOwner) may finish its action chain,
				// but as soon as the turn moves to a different color the pause
				// boundary has been reached and no further triggers run.
				if (state.paused && state.currentTurn !== state.pauseTurnOwner) return;
				if (!isBotPlayer(this.userIdMap, gameId, state.currentTurn)) return;

				const bot = getOrCreateBot(gameId, state.currentTurn, this.engine, this.store);
				// takeTurn() already catches its own engine-call failures, but this
				// is fire-and-forget (never awaited) — a rejection here would be an
				// unhandled promise rejection that crashes the whole engine process,
				// not just this one game. Belt-and-suspenders against future
				// refactors reintroducing that.
				bot.takeTurn().catch((err) => {
					console.error(`[bot] unexpected takeTurn rejection for game ${gameId}:`, err instanceof Error ? err.message : err);
				});
				// Bonus roll / capture chains emit piece_moved -> handleEngineEvent -> triggerBotTurn again
			}).catch((err) => {
				console.error(`[bot] failed to load game state for ${gameId}:`, err instanceof Error ? err.message : err);
			});
		}, delayMs);
		this.botTurnTimers.set(gameId, timer);
	}

  private cleanupGame(gameId: string): void {
    this.userIdMap.delete(gameId);
    this.rematchVotes.delete(gameId);
    this.gameEndedAt.delete(gameId);
  }

	// ─── Post-game lifecycle ───────────────────────────────────────────────────

	private handleGameEnd(gameId: string): void {
		this.gameEndedAt.set(gameId, Date.now());

		// Auto-timeout after POST_GAME_TIMEOUT_MS if no rematch
		setTimeout(() => {
			const votes = this.rematchVotes.get(gameId);
			if (!votes || votes.size < 2) {
				this.io.to(gameId).emit('game_timeout');
				this.cleanupGame(gameId);
			}
		}, POST_GAME_TIMEOUT_MS);
	}

	private async handleRematch(socket: GameSocket): Promise<void> {
		const gameId = socket.data.gameId;
		const userId = socket.data.userId;
		if (!gameId || !userId) return;

		// Track vote
		if (!this.rematchVotes.has(gameId)) {
			this.rematchVotes.set(gameId, new Set());
		}
		this.rematchVotes.get(gameId)!.add(userId);

		// Check if at least 2 players voted for rematch
		if (this.rematchVotes.get(gameId)!.size >= 2) {
			// Create new game with only rematching players
			const newGameId = `${gameId}-rematch`;
			const oldMatchData = await this.store.getMatchData(gameId);
			const playerCount = parseInt(oldMatchData?.playerCount || '4', 10);
			// Reuse the original seat order (skipped colors in hotseat etc.)
			// rather than re-densifying the first playerCount colors.
			const seatColors = oldMatchData?.seatColors
				? (oldMatchData.seatColors.split(',') as PlayerColor[])
				: SLOT_COLORS.slice(0, playerCount);
			await this.store.createGame(newGameId, true, seatColors);

			// Transfer players who voted
			const voters = this.rematchVotes.get(gameId)!;
			for (const [color, uid] of (this.userIdMap.get(gameId) || [])) {
				if (voters.has(uid)) {
					socket.join(newGameId);
					// Update userIdMap for new game
					if (!this.userIdMap.has(newGameId)) {
						this.userIdMap.set(newGameId, new Map());
					}
					this.userIdMap.get(newGameId)!.set(color, uid);
				}
			}

			this.cleanupGame(gameId);
			this.io.to(newGameId).emit('game_created', newGameId);
		}
	}

	private handleExitPostGame(socket: GameSocket): void {
		const gameId = socket.data.gameId;
		const userId = socket.data.userId;
		if (!gameId || !userId) return;

		// Remove from rematch votes if present
		this.rematchVotes.get(gameId)?.delete(userId);

		// Check if quorum is broken (fewer than 2 voters remain)
		const votes = this.rematchVotes.get(gameId);
		if (!votes || votes.size < 2) {
			this.io.to(gameId).emit('game_timeout');
			this.cleanupGame(gameId);
		}
	}

	/**
	 * Definitive game termination via the frontend's "End Game" button.
	 *  - PvP: prune just this player (pieces cleaned, seat exited) and emit
	 *    player_aborted for the log line; the game continues if >= 2 humans
	 *    remain, otherwise the whole instance is aborted + cleaned up.
	 *  - PvE/Hotseat: the whole instance is aborted and its engine state
	 *    deleted -> "Resume last game" becomes unreachable. No result POSTed
	 *    (aborted games have no definitive result).
	 */
	private async handleEndGame(socket: GameSocket): Promise<void> {
		const gameId = socket.data.gameId;
		const color = socket.data.playerColor;
		if (!gameId || !color) return;

		const state = await this.store.loadGameState(gameId);
		if (!state) return;
		const player = state.players.find((p: any) => p.color === color);
		const username = player?.username || color;
		const match = await this.store.getMatchData(gameId);
		const isBotMode = match?.gameType === 'PVE' || match?.gameType === 'HOTSEAT';

		if (isBotMode) {
			this.io.to(gameId).emit('game_expired');
			this.cleanupGame(gameId);
			await this.store.abortMatch(gameId);
			await this.store.deleteGame(gameId);
			return;
		}

		// PvP: prune only this player.
		await this.engine.handlePlayerExit(gameId, color);
		this.publisher.publish({ type: 'player_aborted', gameId, color, username });

		// If fewer than 2 humans remain, the game cannot continue -> abort+clean.
		const remaining = await this.store.loadGameState(gameId);
		if (!remaining || remaining.players.filter((p: any) => p.status === 'active' && !p.isBot).length < 2) {
			this.io.to(gameId).emit('game_expired');
			this.cleanupGame(gameId);
			await this.store.abortMatch(gameId);
			await this.store.deleteGame(gameId);
		}
	}

	private async checkExpiredLobbies(): Promise<void> {
		const now = Date.now();
		const matchKeys = await this.store.scanMatchKeys();
		for (const key of matchKeys) {
			const match = await this.store.getMatchData(key.slice('match:'.length));
			if (!match || match.status !== 'WAITING') continue;

			const seatedCount = [match.player1_id, match.player2_id, match.player3_id, match.player4_id]
				.filter(Boolean).length;

			if (seatedCount >= 2) {
				// Two or more seated players — the idle timer is inactive.
				await this.store.clearIdleSince(match.id);
				continue;
			}

			// Idle room (< 2 seated). Stamp the idle start on first encounter
			// (hsetnx — a pre-existing stamp is kept), then abort once the
			// room has been idle for the full timeout.
			await this.store.setIdleSince(match.id, now);
			const idleSinceMs = match.idleSince ? parseInt(match.idleSince, 10) : now;
			if (now - idleSinceMs > IDLE_LOBBY_TIMEOUT_MS) {
				this.io.to(match.id).emit('game_expired');
				this.cleanupGame(match.id);
				await this.store.abortMatch(match.id);
				await this.store.deleteGame(match.id);
			}
		}
	}

	// ─── Socket wiring (orchestration only) ────────────────────────────────────

	private setupSocketHandlers(): void {
		this.io.use((socket: GameSocket, next) => {
			const token = socket.handshake.auth?.token;
			// A token is mandatory. This used to fall through to next() for
			// "bots, dev" — but bots are driven server-side (triggerBotTurn),
			// never over a socket, and the SPA always supplies a token
			// (frontend/src/socket.ts). Allowing tokenless connections would
			// make signature verification pointless: an attacker could simply
			// omit the token and then assert gameId/colour via join_game.
			if (!token) return next(new Error('Authentication required'));

			const payload = verifyToken(token);
			if (!payload) return next(new Error('Invalid token'));

			socket.data.userId = payload.userId;
			socket.data.username = payload.username;
			socket.data.displayName = payload.displayName;
			socket.data.gameId = payload.gameId;
			socket.data.role = payload.role as 'player' | 'spectator';
			socket.data.tokenColor = payload.color;
			socket.data.mode = payload.mode as 'pvp' | 'pve' | 'hotseat' | undefined;
			next();
		});

		this.io.on('connection', (socket: GameSocket) => {
			console.log(`Client connected: ${socket.id}${socket.data.userId ? ` (user: ${socket.data.userId})` : ''}`);

			socket.on('join_game', (gameId: string, playerColor: PlayerColor, userId?: string, displayName?: string) =>
				this.handlers.handleJoinGame(socket, gameId, playerColor, userId, displayName));

			socket.on('roll_dice', () =>
				this.handlers.handleRollDice(socket));

			socket.on('move_piece', (pieceId) =>
				this.handlers.handleMovePiece(socket, pieceId));

			socket.on('clash_input', (key: string) =>
				this.handlers.handleClashInput(socket, key));

			socket.on('reconnect_clash', () =>
				this.handlers.handleReconnectClash(socket));

			socket.on('player_ready', () =>
				this.handlers.handlePlayerReady(socket));

			socket.on('select_color', (color: string) =>
				this.handlers.handleSelectColor(socket, color));

			socket.on('leave_game', () =>
				this.handlers.handleLeaveGame(socket));

			socket.on('resign', () =>
				this.handlers.handleResign(socket));

			socket.on('end_game', () =>
				this.handleEndGame(socket));

			socket.on('disconnect', () =>
				this.handlers.handleDisconnect(socket));

			socket.on('rematch', () =>
				this.handleRematch(socket));

			socket.on('exit_post_game', () =>
				this.handleExitPostGame(socket));
		});
	}
}
