import { GameState, PlayerColor, LegalMove, MoveResult, MovePieceOutput, PieceId, GameEvent } from './types';
import { RedisGameStore } from './redis';
import { MoveValidator } from './move-validator';
import { ClashManager } from './clash';
import { advanceTurnInState } from './player-handler';
import {
  handlePlayerDisconnect,
  handlePlayerReconnect,
  handlePlayerReady,
  handlePlayerExit,
  handlePlayerResign,
} from './player-handler';
import { LobbyManager } from './lobby';

export class LudoEngine {
  private store: RedisGameStore;
  private eventHandler?: (event: GameEvent) => void;
  private clashManager: ClashManager;
  private lobbyManager?: LobbyManager;
  // Serializes one game's operations so roll/move/etc. never run on top of
  // each other (a bot acting at the same time as a human would otherwise
  // both load the same state and one move gets lost).
  private gameLocks = new Map<string, Promise<unknown>>();

  constructor(store: RedisGameStore, clashManager: ClashManager) {
    this.store = store;
    this.clashManager = clashManager;
  }

  setLobbyManager(lobbyManager: LobbyManager): void {
    this.lobbyManager = lobbyManager;
  }

  /**
   * Register a callback for game lifecycle events.
   * This is the single source of truth — the socket layer should NOT
   * independently detect game end, publish events, etc.
   */
  onEvent(handler: (event: GameEvent) => void): void {
    this.eventHandler = handler;
  }

  private emit(event: GameEvent): void {
    this.eventHandler?.(event);
  }

  /** Public wrapper for emitting engine events (used by socket handlers). */
  emitEvent(event: GameEvent): void {
    this.emit(event);
  }

  /**
   * Serialize a mutating operation per game. Follows the same promise-chain
   * pattern as SocketHandlers.joinLocks; the next operation for a game only
   * starts after the previous one resolved (or rejected) against Redis.
   */
  private withGameLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.gameLocks.get(gameId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.gameLocks.set(gameId, run.then(() => undefined, () => undefined));
    return run;
  }

  async getGameState(gameId: string): Promise<GameState | null> {
    return await this.store.loadGameState(gameId);
  }

  /**
   * Roll dice for the current player.
   * Sets turnPhase to WAITING_FOR_MOVE and stores pendingLegalMoves and pendingDiceValue.
   * Handles zero legal moves by advancing turn automatically (with bonus roll on 6).
   */
  async rollDice(gameId: string): Promise<{ value: number; legalMoves: LegalMove[]; bonusRoll: boolean }> {
    return this.withGameLock(gameId, async () => {
    const state = await this.store.loadGameState(gameId);
    if (!state || state.status !== 'active') {
      throw new Error('Game not active');
    }

    // Only allow roll during WAITING_FOR_ROLL phase
    if (state.turnPhase !== 'WAITING_FOR_ROLL' && state.turnPhase !== undefined) {
      throw new Error('Invalid turn phase: expected WAITING_FOR_ROLL');
    }

    const currentPlayer = state.players.find(p => p.color === state.currentTurn);
    if (!currentPlayer || currentPlayer.status === 'exited') {
      throw new Error('Current player has exited');
    }

    const diceValue = Math.floor(Math.random() * 6) + 1;

    currentPlayer.hasRolled = true;
    // Per-player 6-streak (classic rule): every 6 grants a bonus roll; the
    // third consecutive 6 within one turn-holding streak forfeits the turn.
    // The streak lives on PlayerMeta so it resets on turn advance and can
    // never leak across players.
    currentPlayer.consecutiveSixes = diceValue === 6 ? currentPlayer.consecutiveSixes + 1 : 0;

    if (diceValue === 6) {
      if (currentPlayer.consecutiveSixes >= 3) {
        currentPlayer.consecutiveSixes = 0;
        currentPlayer.bonusRoll = false;
        state.turnPhase = 'WAITING_FOR_ROLL';
        state.pendingLegalMoves = [];
        state.pendingDiceValue = undefined;
        state.pendingIsFirstRoll = undefined;
        advanceTurnInState(state);
        await this.store.saveGameState(gameId, state);
        this.emit({ type: 'dice_rolled', gameId, value: diceValue, legalMoves: [], bonusRoll: false, currentTurn: state.currentTurn, forfeited: true });
        return { value: diceValue, legalMoves: [], bonusRoll: false };
      }
    }

    const sixBonus = diceValue === 6;
    currentPlayer.bonusRoll = sixBonus;

    const legalMoves = MoveValidator.getLegalMoves(state, state.currentTurn, diceValue);

    // Store authoritative dice value so movePiece() doesn't need to recompute it
    state.pendingDiceValue = diceValue;

    if (legalMoves.length === 0) {
      // No legal moves: auto-advance turn (with bonus roll only on a first-roll 6)
      state.pendingLegalMoves = [];
      if (sixBonus) {
        state.turnPhase = 'WAITING_FOR_ROLL';
      } else {
        state.turnPhase = 'WAITING_FOR_ROLL';
        advanceTurnInState(state);
      }
      await this.store.saveGameState(gameId, state);
      this.emit({ type: 'dice_rolled', gameId, value: diceValue, legalMoves: [], bonusRoll: sixBonus, currentTurn: state.currentTurn });
      return { value: diceValue, legalMoves: [], bonusRoll: sixBonus };
    }

    // Set turn phase and store pending legal moves (server-authoritative)
    state.turnPhase = 'WAITING_FOR_MOVE';
    state.pendingLegalMoves = legalMoves;

    await this.store.saveGameState(gameId, state);

    this.emit({ type: 'dice_rolled', gameId, value: diceValue, legalMoves, bonusRoll: sixBonus, currentTurn: state.currentTurn });
    return { value: diceValue, legalMoves, bonusRoll: sixBonus };
    });
  }

  /**
   * Move a piece. Validates against pendingLegalMoves for server-authoritativeness.
   * Uses pendingDiceValue from state instead of requiring it as a parameter.
   * Returns both the MoveResult and the updated GameState to avoid extra Redis loads.
   * Emits game lifecycle events as the single source of truth.
   */
  async movePiece(gameId: string, pieceId: PieceId): Promise<MovePieceOutput> {
    return this.withGameLock(gameId, async () => {
    const state = await this.store.loadGameState(gameId);
    if (!state || state.status !== 'active') {
      throw new Error('Game not active');
    }

    // Validate: must be in WAITING_FOR_MOVE phase
    if (state.turnPhase !== 'WAITING_FOR_MOVE') {
      throw new Error('Invalid turn phase: expected WAITING_FOR_MOVE');
    }

    // Validate: pieceId must be in pendingLegalMoves (server-authoritative).
    // The legal-move list is a snapshot taken at roll time; a player who was
    // disconnected (turn advanced, pending moves cleared) or forfeited between
    // roll and move is rejected here. We intentionally do NOT re-derive the
    // capture at execution time — the snapshot is the contract, and any
    // post-move capture gating (clash QTE) is a future layer on top of this.
    const pendingMove = state.pendingLegalMoves.find(m => m.pieceId === pieceId);
    if (!pendingMove) {
      throw new Error('Invalid move: piece not in legal moves');
    }

    // Use the server-authoritative dice value
    const diceValue = state.pendingDiceValue;
    if (diceValue === undefined) {
      throw new Error('No pending dice value — roll first');
    }

    // Execute move via MoveValidator (pure game logic)
    const result = MoveValidator.executeMove(state, pendingMove, diceValue);

    // Sync frontend-compatible piece fields
    const movedPiece = state.pieces.find(p => p.id === pieceId);
    if (movedPiece) {
      movedPiece.isInGoal = result.to === 57;
      movedPiece.isInBase = result.to <= 0;
    }
    if (result.captured && result.capturedPieceIds) {
      for (const id of result.capturedPieceIds) {
        const capturedPiece = state.pieces.find(p => p.id === id);
        if (capturedPiece) {
          capturedPiece.isInGoal = false;
          capturedPiece.isInBase = true;
        }
      }
    }

    // Record move history
    await this.store.recordMove(gameId, {
      ply: result.ply,
      color: result.color,
      diceValue: result.diceValue,
      pieceId: result.pieceId,
      from: result.from,
      to: result.to,
      captured: result.captured,
      enteredHome: result.enteredHome,
      timestamp: Date.now()
    });

    // Increment move counter
    state.moveCounter++;

    // Check win
    const winner = MoveValidator.checkWinner(state);
    
    if (winner) {
      const piecesInGoal = MoveValidator.countPiecesInGoal(state, winner);
      const winnerPlayer = state.players.find(p => p.color === winner);
      if (winnerPlayer) {
        winnerPlayer.stats.piecesInGoal = piecesInGoal;
        winnerPlayer.piecesInGoal = piecesInGoal;
        winnerPlayer.isFinished = true;
        winnerPlayer.finishedAt = new Date().toISOString();
      }
      state.status = 'finished';
      state.winner = winner;
      state.resultDetail = 'four_pieces';
    } else {
      // Sync piecesInGoal for the moving player
      const mover = state.players.find(p => p.color === result.color);
      const sixBonus = diceValue === 6;
      if (mover) {
        mover.piecesInGoal = MoveValidator.countPiecesInGoal(state, result.color);
        mover.hasRolled = false;
        mover.bonusRoll = sixBonus || result.captured;
      }
      // Bonus roll on a first-roll 6 or an actual capture: same player rolls again
      // Otherwise, advance turn to next player
      if (sixBonus || result.captured) {
        state.turnPhase = 'WAITING_FOR_ROLL';
      } else {
        state.turnPhase = 'WAITING_FOR_ROLL';
        advanceTurnInState(state);
      }
    }

    // Clear pending moves and dice value after move is processed
    state.pendingLegalMoves = [];
    state.pendingDiceValue = undefined;
    state.pendingIsFirstRoll = undefined;

    await this.store.saveGameState(gameId, state);

    this.emit({ type: 'piece_moved', gameId, result });
    if (winner) {
      this.emit({ type: 'game_ended', gameId, winner, resultDetail: 'four_pieces' });
    }

    return { result, state };
    });
  }


  // ─── Player lifecycle handlers (delegated to player-handler.ts) ─────────────

  async handlePlayerDisconnect(gameId: string, color: PlayerColor, notifyAbort?: (gameId: string) => void): Promise<void> {
    return this.withGameLock(gameId, () => handlePlayerDisconnect(this.store, (e) => this.emit(e), gameId, color, this.clashManager, notifyAbort));
  }

  async handlePlayerReconnect(gameId: string, color: PlayerColor): Promise<void> {
    return this.withGameLock(gameId, () => handlePlayerReconnect(this.store, gameId, color));
  }

  async handlePlayerReady(gameId: string, color: PlayerColor): Promise<void> {
    await this.withGameLock(gameId, () => handlePlayerReady(this.store, (e) => this.emit(e), gameId, color));
    await this.emitLobbyUpdate(gameId);
  }

  async handlePlayerExit(gameId: string, color: PlayerColor): Promise<void> {
    return this.withGameLock(gameId, () => handlePlayerExit(this.store, (e) => this.emit(e), gameId, color));
  }

  async handlePlayerResign(gameId: string, color: PlayerColor): Promise<void> {
    return this.withGameLock(gameId, () => handlePlayerResign(this.store, (e) => this.emit(e), gameId, color));
  }

  async handlePlayerSelectColor(gameId: string, userId: string, color: PlayerColor): Promise<void> {
    if (!this.lobbyManager) {
      throw new Error('Lobby manager not initialized');
    }
    await this.withGameLock(gameId, () => this.lobbyManager!.handleSelectColor(gameId, userId, color));
    await this.emitLobbyUpdate(gameId);
  }

  /**
   * Broadcast the current waiting-room roster (seat, username, ready flag) so every
   * connected client's lobby screen stays in sync after a ready-toggle, color swap,
   * or a new player joining. Public: socket-handlers.ts calls this after join_game
   * so already-connected clients learn about the new seat (see handleJoinGame).
   */
  async emitLobbyUpdate(gameId: string): Promise<void> {
    const state = await this.store.loadGameState(gameId);
    if (!state) return;
    const players = state.players
      .filter(p => p.status !== 'inactive')
      .map(p => ({
        userId: '',
        username: p.username,
        avatarStyle: '',
        color: p.color,
        ready: state.readyPlayers.includes(p.color),
      }));
    this.emit({ type: 'lobby_update', gameId, players });
  }
}
