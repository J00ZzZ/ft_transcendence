import Redis from 'ioredis';
import type { GameState, PlayerColor, PieceId, Piece, PlayerMeta, ClashState } from './types';

const COLORS: PlayerColor[] = ['blue', 'red', 'green', 'yellow'];

/**
 * RedisGameStore is a PERSISTENCE LAYER.
 * All game state is stored as a single serialized GameState object.
 * Game logic operates on in-memory GameState first, then persists.
 */
export class RedisGameStore {
  private client: Redis;
  public subscriber: Redis;

  constructor(redisUrl?: string) {
    const host = process.env.REDIS_HOST || 'redis';
    const port = parseInt(process.env.REDIS_PORT || '6479', 10);
    const password = process.env.REDIS_PASSWORD;

    this.client = redisUrl
      ? new Redis(redisUrl)
      : new Redis({ host, port, password, retryStrategy: (t) => Math.min(t * 50, 2000), lazyConnect: true });
    this.subscriber = this.client.duplicate();
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.subscriber.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
    await this.subscriber.quit();
  }

  /** Create a new game with all 16 pieces in prison. `activeColors` are the
   * seats actually in play for this match size — colors outside that set get
   * no PlayerMeta entry at all, so unused seats never appear anywhere
   * downstream (sidebar, color picker, turn order). */
  async createGame(gameId: string, clashMode: boolean = true, activeColors: PlayerColor[] = COLORS): Promise<void> {
    const pieces: Piece[] = [];
    for (const color of COLORS) {
      for (let i = 0; i < 4; i++) {
        pieces.push({ id: `${color}-${i}`, color, step: 0, isInGoal: false, isInBase: true });
      }
    }

    const players: PlayerMeta[] = activeColors.map(color => ({
      color,
      status: 'inactive',
      username: color === 'blue' ? 'You' : color.charAt(0).toUpperCase() + color.slice(1),
      isBot: false,
      isConnected: false,
      piecesInGoal: 0,
      hasRolled: false,
      consecutiveSixes: 0,
      bonusRoll: false,
      isFinished: false,
      stats: { turns: 0, captures: 0, piecesInGoal: 0 }
    }));
    
    const state: GameState = {
      id: gameId,
      pieces,
      players,
      currentTurn: activeColors[0] ?? 'blue',
      consecutiveSixes: 0,
      moveCounter: 0,
      turnPhase: 'WAITING_FOR_ROLL',
      firstRollOfTurn: true,
      pendingLegalMoves: [],
      disconnectedPlayers: [],
      status: 'waiting',
      clashMode,
      readyPlayers: [],
    };
    
    await this.saveGameState(gameId, state);
  }

  /** Load the entire GameState from Redis (single operation) */
  async loadGameState(gameId: string): Promise<GameState | null> {
    const data = await this.client.hget(this.gameKey(gameId), 'state');
    if (!data) return null;
    return JSON.parse(data) as GameState;
  }

  /** Save the entire GameState to Redis (single operation) */
  async saveGameState(gameId: string, state: GameState): Promise<void> {
    await this.client.hset(this.gameKey(gameId), 'state', JSON.stringify(state));
    await this.client.expire(this.gameKey(gameId), 86400);
  }

  /** Move history (separate, not part of main state) */
  async recordMove(gameId: string, move: { ply: number; color: PlayerColor; diceValue: number; pieceId: PieceId; from: number; to: number; captured: boolean; enteredHome: boolean; timestamp: number }): Promise<void> {
    await this.client.lpush(this.movesKey(gameId), JSON.stringify(move));
    await this.client.ltrim(this.movesKey(gameId), 0, 199);
  }

  /** Clash state management */
  async loadClashState(gameId: string): Promise<ClashState | null> {
    const state = await this.loadGameState(gameId);
    return state?.clash ?? null;
  }

  async saveClashState(gameId: string, clash: ClashState): Promise<void> {
    const state = await this.loadGameState(gameId);
    if (!state) return;
    
    state.clash = clash;
    await this.saveGameState(gameId, state);
  }

  async clearClashState(gameId: string): Promise<void> {
    const state = await this.loadGameState(gameId);
    if (!state) return;
    
    delete state.clash;
    await this.saveGameState(gameId, state);
  }

  async recordClashPress(gameId: string, color: PlayerColor): Promise<number> {
    const state = await this.loadGameState(gameId);
    if (!state?.clash) return 0;
    
    const isAttacker = state.clash.attacker === color;
    if (isAttacker) {
      state.clash.attackerPresses++;
    } else {
      state.clash.defenderPresses++;
    }
    await this.saveGameState(gameId, state);
    return isAttacker ? state.clash.attackerPresses : state.clash.defenderPresses;
  }

  /** Publish state change to all subscribers */
  async publish(gameId: string, message: string): Promise<void> {
    await this.client.publish(`game:${gameId}`, message);
  }

   /** Get the match metadata hash (for lobby/color selection) */
   async getMatchData(gameId: string): Promise<Record<string, string> | null> {
     const data = await this.client.hgetall(this.matchKey(gameId));
     return Object.keys(data).length > 0 ? data : null;
   }

   /** Update specific fields in the match metadata hash */
   async updateMatchData(gameId: string, fields: Record<string, string>): Promise<void> {
     await this.client.hmset(this.matchKey(gameId), fields);
   }

   /** SCAN all match metadata hashes. */
   async scanMatchKeys(): Promise<string[]> {
     const keys: string[] = [];
     let cursor = '0';
     do {
       const [nextCursor, batch] = await this.client.scan(cursor, 'MATCH', 'match:*', 'COUNT', 100);
       cursor = nextCursor;
       keys.push(...batch);
     } while (cursor !== '0');
     return keys;
   }

   /** Stamp the moment a room became idle (< 2 seated), without overwriting an existing stamp. */
   async setIdleSince(gameId: string, now: number): Promise<void> {
     await this.client.hsetnx(this.matchKey(gameId), 'idleSince', now.toString());
   }

   /** Clear the idle stamp (room has ≥ 2 seated players again). */
   async clearIdleSince(gameId: string): Promise<void> {
     await this.client.hdel(this.matchKey(gameId), 'idleSince');
   }

   /**
    * Remove a non-host player's seat from a waiting room's match hash.
    * The host (player1) seat is never cleared — the room stays rejoinable.
    * After clearing, the idle stamp is (re)written so the 5-minute idle
    * countdown restarts from the moment the room dropped back below 2 seats.
    */
   async clearMatchSeat(gameId: string, color: PlayerColor): Promise<void> {
     const data = await this.getMatchData(gameId);
     if (!data) return;
     if (data.player1_color === color) return; // never clear the host's seat

     const slotIndex = COLORS.indexOf(color);
     if (slotIndex <= 0) return; // unknown color or host slot
     await this.client.hdel(
       this.matchKey(gameId),
       `player${slotIndex + 1}_id`,
       `player${slotIndex + 1}_color`,
     );
     await this.setIdleSince(gameId, Date.now());
   }

   /** Mark a match ABORTED with a short TTL so it drops out of open-room listings. */
   async abortMatch(gameId: string): Promise<void> {
     await this.client.hset(this.matchKey(gameId), 'status', 'ABORTED');
     await this.client.expire(this.matchKey(gameId), 3600);
   }

   /** Delete the engine-side game state/moves for a match. */
   async deleteGame(gameId: string): Promise<void> {
     await this.client.del(this.gameKey(gameId), this.movesKey(gameId));
   }

   private matchKey(gameId: string): string { return `match:${gameId}`; }
   private gameKey(gameId: string): string { return `game:${gameId}`; }
   private movesKey(gameId: string): string { return `game:${gameId}:moves`; }
 }
