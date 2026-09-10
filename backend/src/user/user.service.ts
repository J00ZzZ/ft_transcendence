import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PresenceService } from '../presence/presence.service';
import { ratingDeltaFor } from '../common/scoring';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly notifications: NotificationService,
  ) {}

  async getPublicProfile(username: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        createdAt: true,
        avatarStyle: true,
        avatarPhotoContentType: true,
        rating: true,
        highestRating: true,
        wins: true,
        losses: true,
        winStreak: true,
        bestWinStreak: true,
        botWins: true,
        humanWins: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User "${username}" not found`);
    }

    const status = await this.presence.getStatus(user.id);
    const { avatarPhotoContentType, ...rest } = user;
    return { ...rest, hasAvatarPhoto: avatarPhotoContentType !== null, status };
  }

  async uploadAvatar(userId: string, data: Buffer, contentType: string) {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Prisma 7 uses Bytes type for avatarPhoto
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { avatarPhoto: data as any, avatarPhotoContentType: contentType },
    });

    await this.notifications
      .notify(userId, 'profile_updated', { items: ['avatar'] })
      .catch(() => {});

    // Live push: broadcast a TRANSIENT event so every connected client busts
    // its cached /api/user/<username>/avatar URL for this user (their own other
    // tabs included). No persistence — the bell stays clean, the photo refreshes.
    await this.notifications
      .broadcast('avatar_changed', {
        userId: user.id,
        username: user.username,
        updatedAt: new Date().toISOString(),
      })
      .catch(() => {});

    return { message: 'Avatar uploaded', contentType };
  }

  async getAvatar(username: string): Promise<{ data: Buffer; contentType: string } | null> {
    const user = await this.prisma.db.user.findUnique({
      where: { username },
      select: { avatarPhoto: true, avatarPhotoContentType: true },
    });
    if (!user || !user.avatarPhoto || !user.avatarPhotoContentType) return null;
    return { data: Buffer.from(user.avatarPhoto), contentType: user.avatarPhotoContentType };
  }

  async deleteAvatar(userId: string) {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { avatarPhoto: null, avatarPhotoContentType: null },
    });

    await this.notifications
      .notify(userId, 'profile_updated', { items: ['avatar'] })
      .catch(() => {});

    // Same live push as uploadAvatar — clients showing this user's photo must
    // re-fetch (and correctly fall back to the generated pixel avatar).
    await this.notifications
      .broadcast('avatar_changed', {
        userId: user.id,
        username: user.username,
        updatedAt: new Date().toISOString(),
      })
      .catch(() => {});

    return { message: 'Avatar deleted' };
  }

  async getUserGames(username: string, page: number = 1, limit: number = 20) {
    const user = await this.prisma.db.user.findUnique({ where: { username } });
    if (!user) throw new NotFoundException(`User "${username}" not found`);

    const skip = (page - 1) * limit;

    const [participations, total] = await Promise.all([
      this.prisma.db.gameParticipant.findMany({
        where: { user_id: user.id },
        orderBy: { game: { endedAt: 'desc' } },
        skip,
        take: limit,
        include: {
          game: {
            include: {
              participants: {
                include: {
                  user: {
                    select: {
                      username: true,
                      displayName: true,
                      avatarStyle: true,
                      avatarPhotoContentType: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.db.gameParticipant.count({ where: { user_id: user.id } }),
    ]);

    return {
      games: participations.map((p) => ({
        gameId: p.game_id,
        status: p.game.status,
        gameType: p.game.gameType,
        color: p.color,
        rank: p.rank,
        piecesCaptured: p.piecesCaptured,
        piecesInGoal: p.piecesInGoal,
        ratingDelta: ratingDeltaFor({
          piecesInGoal: p.piecesInGoal,
          rank: p.rank,
          gameType: p.game.gameType,
        }),
        startedAt: p.game.startedAt,
        endedAt: p.game.endedAt,
        participants: p.game.participants.map((gp) => ({
          username: gp.user.username,
          displayName: gp.user.displayName,
          avatarStyle: gp.user.avatarStyle,
          hasAvatarPhoto: gp.user.avatarPhotoContentType !== null,
          color: gp.color,
          rank: gp.rank,
          piecesInGoal: gp.piecesInGoal,
        })),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
