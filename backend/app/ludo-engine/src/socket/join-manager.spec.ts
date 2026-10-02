import { describe, it, expect } from 'vitest';
import { JoinManager } from './join-manager';
import type { RedisGameStore } from '../redis';
import type { LudoEngine } from '../engine';
import type { LudoBot } from '../bot';
import type { GameState, PlayerColor, PlayerMeta } from '../types';

// A PvE room: the human owns slot 1 (blue) and slot 2 is the bot seat (red).
// The backend writes the lobby's label into `player2_displayName`, so the
// engine must show it while the seat keeps its `bot-red` identity.
function pveState(): GameState {
  return {
    id: 'game-1',
    pieces: [],
    players: [
      seat('blue', { status: 'active', username: 'alice' }),
      seat('red'),
      seat('green'),
      seat('yellow'),
    ],
    currentTurn: 'blue',
    consecutiveSixes: 0,
    moveCounter: 0,
    turnPhase: 'WAITING_FOR_ROLL',
    firstRollOfTurn: true,
    pendingLegalMoves: [],
    disconnectedPlayers: [],
    status: 'waiting',
    readyPlayers: [],
  };
}

// Mirrors the waiting-room seat a backend `createGame` produces: everything
// inactive until a join (or the bot auto-fill) activates it.
function seat(color: PlayerColor, overrides: Partial<PlayerMeta> = {}): PlayerMeta {
  return {
    color,
    status: 'inactive',
    username: `user-${color}`,
    isBot: false,
    isConnected: false,
    hasAvatarPhoto: false,
    piecesInGoal: 0,
    hasRolled: false,
    consecutiveSixes: 0,
    bonusRoll: false,
    isFinished: false,
    stats: { turns: 0, captures: 0, piecesInGoal: 0 },
    ...overrides,
  };
}

function makeManager(state: GameState) {
  const saved: GameState[] = [];
  const events: unknown[] = [];
  const botSeats: PlayerColor[] = [];
  const store = {
    loadGameState: async () => state,
    saveGameState: async (_gameId: string, next: GameState) => {
      saved.push(next);
    },
    setSeatUser: async () => {},
  } as unknown as RedisGameStore;
  const engine = { emitEvent: (event: unknown) => events.push(event) } as unknown as LudoEngine;
  const manager = new JoinManager(store, engine, new Map(), (_gameId, color) => {
    botSeats.push(color);
    return {} as LudoBot;
  });
  return { manager, saved, events, botSeats };
}

// autoStartIfReady is private: it is only ever reached through join_game, and
// the assertions below need to inspect the state it persists.
type AutoStart = (id: string, matchData: Record<string, string>) => Promise<void>;

function autoStart(manager: JoinManager, matchData: Record<string, string>): Promise<void> {
  const target = manager as unknown as { autoStartIfReady: AutoStart };
  return target.autoStartIfReady('game-1', matchData);
}

type Manager = ReturnType<typeof makeManager>;

function botMatchData(displayName?: string): Record<string, string> {
  const matchData: Record<string, string> = {
    gameType: 'PVE',
    playerCount: '2',
    player1_id: 'alice-id',
    player1_color: 'blue',
    player2_id: 'bot-red',
    player2_color: 'red',
  };
  if (displayName !== undefined) matchData.player2_displayName = displayName;
  return matchData;
}

function redSeat(state: GameState): PlayerMeta {
  const player = state.players.find((p) => p.color === 'red');
  if (!player) throw new Error('red seat missing from the state');
  return player;
}

describe('JoinManager.autoStartIfReady (PvE bot seats)', () => {
  it("shows the lobby's assistant name while keeping the bot-<color> identity", async () => {
    const state = pveState();
    const { manager, saved, events, botSeats }: Manager = makeManager(state);

    await autoStart(manager, botMatchData('bot-red (Siri)'));

    const red = redSeat(state);
    expect(red.username).toBe('bot-red');
    expect(red.displayName).toBe('bot-red (Siri)');
    expect(red.isBot).toBe(true);
    expect(red.isConnected).toBe(true);
    expect(red.hasAvatarPhoto).toBe(false);
    // The human seat is untouched by the bot fill.
    expect(state.players.find((p) => p.color === 'blue')).toMatchObject({
      status: 'active',
      username: 'alice',
      isBot: false,
    });
    expect(botSeats).toEqual(['red']);
    expect(saved.at(-1)?.status).toBe('active');
    expect(events).toContainEqual({ type: 'game_started', gameId: 'game-1' });
  });

  it('falls back to the bare bot id when the lobby sent no assistant name', async () => {
    const state = pveState();
    const { manager }: Manager = makeManager(state);

    await autoStart(manager, botMatchData());

    expect(redSeat(state).displayName).toBe('bot-red');
    expect(redSeat(state).username).toBe('bot-red');
  });

  it('falls back for a blank assistant name', async () => {
    const state = pveState();
    const { manager }: Manager = makeManager(state);

    await autoStart(manager, botMatchData(''));

    expect(redSeat(state).displayName).toBe('bot-red');
  });
});
