// Read-only match queries: open rooms and my-rooms.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { secret } from '../secrets';
import Redis from 'ioredis';

@Injectable()
// Read-only match queries over Redis match:* hashes, enriched with host
// details from Postgres. Used by match.controller.ts via MatchService.
export class MatchQueryService {
  // Redis client for scanning match:* game hashes.
  private redis: Redis;

  constructor(private readonly prisma: PrismaService) {
    const host = process.env.REDIS_HOST ?? 'redis';
    const port = parseInt(process.env.REDIS_PORT ?? '6479', 10);
    const password = secret('REDIS_PASSWORD');
    this.redis = new Redis({ host, port, password, retryStrategy: (t) => Math.min(t * 50, 2000) });
    this.redis.on('error', (error) => {
      console.error('Redis error:', error.message);
    });
  }

  // List all WAITING PvP rooms that are open for joining.
  async listOpenRooms() {
    let cursor = '0';
    const rooms: Array<{
      id: string;
      roomCode: string;
      hostId: string;
      seats: number;
      maxSeats: number;
    }> = [];
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'match:*', 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const data = await this.redis.hgetall(key);
        if (data.status === 'WAITING' && data.gameType === 'PVP' && data.player1_id) {
          const seats = [data.player1_id, data.player2_id, data.player3_id, data.player4_id].filter(
            Boolean,
          ).length;
          const maxSeats = parseInt(data.playerCount || '4', 10);
          // Full rooms are hidden from the list of joinable PvP rooms
          if (seats >= maxSeats) continue;
          rooms.push({
            id: data.id,
            roomCode: data.inviteCode,
            hostId: data.player1_id,
            seats,
            maxSeats,
          });
        }
      }
    } while (cursor !== '0');

    const hostIds = [...new Set(rooms.map((r) => r.hostId))];
    const hosts = await this.prisma.db.user.findMany({
      where: { id: { in: hostIds } },
      select: { id: true, username: true, displayName: true, avatarPhotoContentType: true },
    });
    const hostMap = new Map(hosts.map((u) => [u.id, u]));

    return rooms.map((r) => {
      const h = hostMap.get(r.hostId);
      return {
        id: r.id,
        roomCode: r.roomCode,
        // Host identity: the id keys the avatar, the display name is shown, and
        // the immutable username is returned separately for ownership checks.
        hostId: r.hostId,
        host: h?.displayName ?? h?.username ?? 'Unknown',
        hostUsername: h?.username ?? r.hostId,
        hasAvatarPhoto: h?.avatarPhotoContentType != null,
        seats: r.seats,
        maxSeats: r.maxSeats,
        mode: r.maxSeats === 2 ? 'duel' : 'classic',
      };
    });
  }

  // List WAITING or ACTIVE matches that the given user is seated in.
  async listMyRooms(userId: string) {
    let cursor = '0';
    const rooms: Array<{
      id: string;
      roomCode: string | null;
      status: string;
      gameType: string;
      seats: number;
      maxSeats: number;
    }> = [];
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'match:*', 'COUNT', 100);
      cursor = nextCursor;
      for (const key of keys) {
        const data = await this.redis.hgetall(key);
        const seatIds = [data.player1_id, data.player2_id, data.player3_id, data.player4_id];
        if (!seatIds.includes(userId)) continue;
        if (data.status !== 'WAITING' && data.status !== 'ACTIVE') continue;
        rooms.push({
          id: data.id,
          roomCode: data.inviteCode || null,
          status: data.status,
          gameType: data.gameType,
          seats: seatIds.filter(Boolean).length,
          maxSeats: parseInt(data.playerCount || '4', 10),
        });
      }
    } while (cursor !== '0');
    return rooms;
  }
}
