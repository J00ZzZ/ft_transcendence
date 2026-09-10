import Redis from 'ioredis';
import { Server } from 'socket.io';

/**
 * RedisBroadcaster subscribes to game state changes published via Redis pub/sub
 * and forwards them to the corresponding Socket.IO room.
 * This decouples the broadcast mechanism from the event publishing logic.
 */
export class RedisBroadcaster {
  private subscriber: Redis;

  constructor(redisUrl?: string) {
    const host = process.env.REDIS_HOST || 'redis';
    const port = parseInt(process.env.REDIS_PORT || '6479', 10);
    const password = process.env.REDIS_PASSWORD;

    this.subscriber = redisUrl
      ? new Redis(redisUrl)
      : new Redis({ host, port, password, retryStrategy: (t) => Math.min(t * 50, 2000) });
  }

  /**
   * Start listening for game events on Redis pub/sub channels (game:* pattern).
   * Forwards each message to the matching Socket.IO room.
   */
  start(io: Server): void {
    this.subscriber.psubscribe('game:*', (err, count) => {
      if (err) {
        console.error('Failed to subscribe to game:* pattern:', err);
      } else {
        console.log(`Subscribed to ${count} game channels (pattern-based)`);
      }
    });

    this.subscriber.on('pmessage', (pattern, channel, message) => {
      if (pattern !== 'game:*') return;
      try {
        const gameId = channel.substring(5);
        const data = JSON.parse(message);
        io.to(gameId).emit(data.type, data);
      } catch (e) {
        console.error(`Failed to parse message on ${channel}:`, e);
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.subscriber.quit();
  }
}