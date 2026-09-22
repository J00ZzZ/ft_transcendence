import type { Server } from 'socket.io';
import type { LudoEngine } from '../engine';
import type { RedisGameStore } from '../redis';
import type { EventPublisher } from './event-publisher';
import type { GameSocket } from './auth';
import { finalizeDeparture, teardownRoom } from '../player-handler';

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
    const isSingleSocketMode = match?.gameType === 'PVE' || match?.gameType === 'HOTSEAT';

    if (isSingleSocketMode) {
      // Single-instance mode: tear down the whole room. teardownRoom
      // broadcasts game_expired and runs the cleanup callback.
      await teardownRoom(this.store, this.engine.emitEvent.bind(this.engine), gameId, this.cleanup);
      return;
    }

    // PvP: prune only this player and free the seat. finalizeDeparture tears
    // the room down if the prune leaves it below quorum.
    await finalizeDeparture(
      this.store,
      this.engine.emitEvent.bind(this.engine),
      gameId,
      color,
      'end_game',
      this.cleanup,
    );
    this.publisher.publish({ type: 'player_aborted', gameId, color, username });
  }
}
