import { Server } from 'socket.io';
import { LudoEngine } from '../engine';
import { RedisGameStore } from '../redis';
import { EventPublisher } from './event-publisher';
import { GameSocket } from './auth';

// PostGameManager owns the end-of-game lifecycle: the post-game timeout that
// expires a finished room, and the "End Game" button.
export class PostGameManager {
  constructor(
    private getIo: () => Server,
    private store: RedisGameStore,
    private engine: LudoEngine,
    private publisher: EventPublisher,
    private postGameTimeoutMs: number,
    private cleanup: (gameId: string) => void,
  ) {}

  // A game finished: emit game_timeout and tear the room down after the timeout.
  onGameEnded(gameId: string): void {
    // Auto-timeout after postGameTimeoutMs, then expire the finished room.
    setTimeout(() => {
      this.getIo().to(gameId).emit('game_timeout');
      this.cleanup(gameId);
    }, this.postGameTimeoutMs);
  }

  // Definitive termination via the "End Game" button. PvE/hotseat: abort the
  // whole instance. PvP: prune just this player; if fewer than 2 humans
  // remain, the room is aborted and cleaned up. No result is posted.
  async handleEndGame(socket: GameSocket): Promise<void> {
    const gameId = socket.data.gameId;
    const color = socket.data.playerColor;
    if (!gameId || !color) return;

    const state = await this.store.loadGameState(gameId);
    if (!state) return;
    const player = state.players.find((p) => p.color === color);
    const username = player?.username || color;
    const match = await this.store.getMatchData(gameId);
    const isBotMode = match?.gameType === 'PVE' || match?.gameType === 'HOTSEAT';

    if (isBotMode) {
      this.getIo().to(gameId).emit('game_expired');
      this.cleanup(gameId);
      await this.store.abortMatch(gameId);
      await this.store.deleteGame(gameId);
      return;
    }

    // PvP: prune only this player. `true` = ABORT frees the seat outright, so
    // the room can hand it to someone else (a player who merely returns to the
    // lobby only reserves theirs).
    await this.engine.handlePlayerExit(gameId, color, true);
    this.publisher.publish({ type: 'player_aborted', gameId, color, username });

    // If fewer than 2 humans remain, the game cannot continue -> abort+clean.
    const remaining = await this.store.loadGameState(gameId);
    if (
      !remaining ||
      remaining.players.filter((p) => p.status === 'active' && !p.isBot).length < 2
    ) {
      this.getIo().to(gameId).emit('game_expired');
      this.cleanup(gameId);
      await this.store.abortMatch(gameId);
      await this.store.deleteGame(gameId);
    }
  }
}
