import { LudoEngine } from './engine';
import { RedisGameStore } from './redis';
import { BoardMapper } from './board-mapper';
import { isBotUserId } from './socket/auth';
import type { PlayerColor, PieceId, GameState, LegalMove } from './types';

const botMap = new Map<string, Map<PlayerColor, LudoBot>>();

export function getOrCreateBot(
  gameId: string,
  color: PlayerColor,
  engine: LudoEngine,
  store: RedisGameStore,
): LudoBot {
  if (!botMap.has(gameId)) botMap.set(gameId, new Map());
  const gameBots = botMap.get(gameId)!;
  if (!gameBots.has(color)) {
    gameBots.set(color, new LudoBot(gameId, color, engine, store));
  }
  return gameBots.get(color)!;
}

export function isBotPlayer(
  userIdMap: Map<string, Map<PlayerColor, string>>,
  gameId: string,
  color: PlayerColor,
): boolean {
  return isBotUserId(userIdMap.get(gameId)?.get(color));
}

/**
 * Server-side Ludo Bot with heuristic-based move selection.
 * Each bot (per color) analyzes the game state to decide moves.
 * Bot turns are scheduled by the SocketServer, not by the bot itself,
 * to prevent overlapping timers.
 */
export class LudoBot {
  private engine: LudoEngine;
  private store: RedisGameStore;
  private gameId: string;
  private color: PlayerColor;

  constructor(gameId: string, color: PlayerColor, engine: LudoEngine, store: RedisGameStore) {
    this.gameId = gameId;
    this.color = color;
    this.engine = engine;
    this.store = store;
  }

  /**
   * Select the best move using heuristics.
   * Priority order:
   * 1. Capture opponent pieces
   * 2. On roll 6, prefer freeing pieces from jail
   * 3. Enter home stretch (52+)
   * 4. Move to safe zones
   * 5. Maximum progress
   * 
   * Returns the LegalMove object for the best move.
   */
  selectBestMove(legalMoves: LegalMove[], state: GameState, diceValue: number): LegalMove | null {
    if (legalMoves.length === 0) return null;
    if (legalMoves.length === 1) return legalMoves[0];

    // Priority 1: Capture moves - always take them
    const captures = legalMoves.filter(m => m.isCapture);
    if (captures.length > 0) {
      return captures[0];
    }

    // Priority 2: On a 6, prefer freeing pieces from jail (step 0)
    if (diceValue === 6) {
      const freesFromJail = legalMoves.filter(m => m.from === 0);
      if (freesFromJail.length > 0) {
        return freesFromJail[0];
      }
    }

    // Priority 3-5: Score remaining moves
    const scored = legalMoves.map(move => ({
      move,
      score: this.scoreMove(move)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].move;
  }

  /**
   * Score a move based on heuristics.
   * Higher score = better move.
   */
  private scoreMove(move: LegalMove): number {
    let score = 0;

    // Home entry is excellent
    if (move.isHomeEntry) {
      score += 1000;
    }

    // Safe zone bonus
    if (BoardMapper.isSafeZoneStep(move.pieceId, move.to)) {
      score += 500;
    }

    // Progress bonus (scaled)
    score += move.to * 10;

    // Moving from jail has slight bonus
    if (move.from === 0) {
      score += 100;
    }

    return score;
  }

  /**
   * Execute bot turn: roll dice and make the best move.
   * Does NOT schedule follow-up turns — the SocketServer handles that
   * via processBotTurn() to prevent overlapping timers.
   * Returns true if the game is still active after this turn.
   */
  async takeTurn(): Promise<boolean> {
    try {
      return await this.takeTurnUnsafe();
    } catch (err) {
      // rollDice/movePiece throw when the game state moved on from under us
      // (resigned, timed out, or ended by the other player) during the gaps
      // between our own state checks above — most commonly the 1.2s delay
      // before movePiece. That's a normal race, not a bug: the caller
      // (triggerBotTurn in socket/server.ts) doesn't await/catch this
      // promise, so letting it throw here would be an unhandled rejection
      // that kills the whole engine process, not just this one game.
      console.error(`[bot] takeTurn aborted for game ${this.gameId} (${this.color}):`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  private async takeTurnUnsafe(): Promise<boolean> {
    // Strict turn validation — mirrors socket-handlers.ts early validation for humans
    const state = await this.store.loadGameState(this.gameId);
    if (!state || state.status !== 'active') return false;
    if (state.currentTurn !== this.color) return false; // Not our turn
    if (state.turnPhase !== 'WAITING_FOR_ROLL') return false; // Wrong phase

    // Roll dice — engine validates currentTurn again
    const { value: diceValue, legalMoves } = await this.engine.rollDice(this.gameId);

    if (legalMoves.length > 0) {
      // Re-validate after roll: turn may have changed due to disconnect
      const afterRoll = await this.store.loadGameState(this.gameId);
      if (!afterRoll || afterRoll.currentTurn !== this.color) return false;

      // Select best move using heuristics
      const bestMove = this.selectBestMove(legalMoves, afterRoll, diceValue);
      if (!bestMove) return false;

      // Delay piece movement so frontend dice roll animation finishes first and displays the number
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Re-validate once more: the game can end or the turn can move on
      // during the delay above (e.g. the other player resigns/times out).
      const beforeMove = await this.store.loadGameState(this.gameId);
      if (!beforeMove || beforeMove.status !== 'active' || beforeMove.currentTurn !== this.color) return false;

      // Execute move — engine emits piece_moved and game_ended events via handleEngineEvent
      const { state: finalState } = await this.engine.movePiece(this.gameId, bestMove.pieceId);

      // Check for win after bot move
      if (finalState.status === 'finished') {
        return false; // Game finished
      }
    }

    return true; // Game still active
  }

  getGameId(): string {
    return this.gameId;
  }

  getColor(): PlayerColor {
    return this.color;
  }
}