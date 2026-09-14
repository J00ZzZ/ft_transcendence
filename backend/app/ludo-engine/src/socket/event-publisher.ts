import { RedisGameStore } from '../redis';
import { GameEvent } from '../types';

// EventPublisher: the only place that publishes game lifecycle events. Each
// engine event goes to Redis pub/sub so every client receives it.
export class EventPublisher {
  constructor(private store: RedisGameStore) {}

  // Publish an engine event to Redis pub/sub, broadcast to the game room
  // via the Redis subscriber in server.ts.
  publish(event: GameEvent): void {
    const { gameId } = event;

    switch (event.type) {
      case 'dice_rolled':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'dice_rolled',
            value: event.value,
            legalMoves: event.legalMoves,
            bonusRoll: event.bonusRoll,
            currentTurn: event.currentTurn,
            forfeited: event.forfeited,
          }),
        );
        break;

      case 'piece_moved':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'piece_moved',
            ...event.result,
          }),
        );
        break;

      case 'game_ended':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'game_ended',
            winner: event.winner,
            resultDetail: event.resultDetail,
          }),
        );
        break;

      case 'player_exited':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'player_exited',
            color: event.color,
          }),
        );
        break;

      case 'player_resigned':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'player_resigned',
            color: event.color,
          }),
        );
        break;

      case 'game_started':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'game_started',
            gameId: event.gameId,
          }),
        );
        break;

      case 'color_selected':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'color_selected',
            gameId: event.gameId,
            userId: event.userId,
            color: event.color,
          }),
        );
        break;

      case 'lobby_update':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'lobby_update',
            gameId: event.gameId,
            players: event.players,
          }),
        );
        break;

      case 'player_aborted':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'player_aborted',
            color: event.color,
            username: event.username,
          }),
        );
        break;

      case 'player_disconnected':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'player_disconnected',
            color: event.color,
          }),
        );
        break;

      case 'player_reconnected':
        this.store.publish(
          gameId,
          JSON.stringify({
            type: 'player_reconnected',
            color: event.color,
          }),
        );
        break;
    }
  }
}
