import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { GameState, PlayerColor, LegalMove, MoveResult } from './game/types';

export type ServerEvents = {
  game_joined: (state: GameState) => void;
  dice_rolled: (e: {
    value: number;
    legalMoves: LegalMove[];
    bonusRoll: boolean;
    currentTurn: PlayerColor;
    forfeited?: boolean;
  }) => void;
  piece_moved: (e: MoveResult) => void;
  game_started: (e: { gameId: string }) => void;
  game_ended: (e: { winner: PlayerColor; resultDetail: string }) => void;
  player_exited: (e: { color: PlayerColor }) => void;
  player_aborted: (e: { color: PlayerColor; username: string }) => void;
  player_disconnected: (e: { color: PlayerColor }) => void;
  player_reconnected: (e: { color: PlayerColor }) => void;
  lobby_update: (e: {
    players: Array<{ username: string; color: PlayerColor; ready: boolean }>;
  }) => void;
  game_timeout: () => void;
  game_expired: () => void;
  state_update: (payload: GameState) => void;
  error: (msg: string) => void;
};

export type ClientEvents = {
  join_game: (gameId: string, color: PlayerColor, userId?: string, displayName?: string) => void;
  roll_dice: () => void;
  move_piece: (pieceId: string) => void;
  player_ready: () => void;
  select_color: (color: PlayerColor) => void;
  leave_game: () => void;
  resign: () => void;
  end_game: () => void;
};

// Always connects to the page's own origin — nginx (or, in dev, the Vite
// proxy) forwards /socket.io/ to the engine, so the browser never needs to
// know its real hostname/port. See nginx/conf/app.inc and vite.config.ts.
export function connectSocket(token: string): Socket<ServerEvents, ClientEvents> {
  return io(window.location.origin, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
  });
}
