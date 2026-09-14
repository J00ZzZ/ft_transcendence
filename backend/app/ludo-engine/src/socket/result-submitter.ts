import { LudoEngine } from '../engine';
import { RedisGameStore } from '../redis';
import type { PlayerColor } from '../types';
import { BACKEND_URL } from './auth';

function getEngineApiKey(): string {
  return process.env.ENGINE_API_KEY || 'dev-engine-key';
}

// ResultSubmitter: posts finished-game results to the backend and cleans up
// in-memory state.
export class ResultSubmitter {
  constructor(
    private engine: LudoEngine,
    private store: RedisGameStore,
    private userIdMap: Map<string, Map<PlayerColor, string>>,
    private cleanup: (gameId: string) => void,
  ) {}

  // POST the finished game's results to the backend /api/game/end exactly
  // once per game (idempotent via resultSubmitted). Skips hotseat entirely.
  // Called by PostGameManager when a game_ended event arrives.
  async submitGameResult(gameId: string): Promise<void> {
    try {
      const state = await this.engine.getGameState(gameId);
      if (!state) return;

      // Hotseat is demo-and-forget: the result is NEVER submitted to the
      // backend : no game/participant rows, no counters, no leaderboard.
      // (achievement-revamp.md §2)
      const matchData = await this.store.getMatchData(gameId);
      if (matchData?.gameType === 'HOTSEAT') {
        console.log(`Game ${gameId} is HOTSEAT : skipping backend submission (demo-and-forget)`);
        state.resultSubmitted = true;
        await this.store.saveGameState(gameId, state);
        return;
      }

      if (state.resultSubmitted) {
        console.log(`Game ${gameId} result already submitted, skipping`);
        return;
      }
      state.resultSubmitted = true;
      await this.store.saveGameState(gameId, state);

      const participants = [];
      for (const player of state.players) {
        // Players who aborted/left via End Game (status 'exited') are pruned
        // from the board and must NOT receive a definitive result or rating :
        // they didn't finish the match, so no outcome is recorded for them.
        if (player.status === 'exited') continue;
        const stats = { ...player.stats };
        const userId = this.userIdMap.get(gameId)?.get(player.color) || `bot-${player.color}`;
        participants.push({
          userId,
          color: player.color.toUpperCase(),
          rank: player.color === state.winner ? 1 : 2,
          totalTurns: stats.turns,
          piecesCaptured: stats.captures,
          piecesInGoal: stats.piecesInGoal,
        });
      }

      const engineApiKey = getEngineApiKey();
      await fetch(`${BACKEND_URL}/api/game/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Engine-Key': engineApiKey,
        },
        body: JSON.stringify({ gameId, participants }),
      });
    } catch (err) {
      console.error('Failed to submit game result:', err);
    }
  }

  // Tell the backend a game left the lobby so it flips the Redis match from
  // WAITING to ACTIVE : otherwise it keeps appearing in "open rooms" mid-game.
  async notifyGameStarted(gameId: string): Promise<void> {
    try {
      const engineApiKey = getEngineApiKey();
      await fetch(`${BACKEND_URL}/api/game/${gameId}/started`, {
        method: 'POST',
        headers: { 'X-Engine-Key': engineApiKey },
      });
    } catch (err) {
      console.error('Failed to notify game started:', err);
    }
  }
}
