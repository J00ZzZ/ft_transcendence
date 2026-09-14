import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma.service';
import { PresenceService } from '../presence/presence.service';
import { MatchService } from '../match/match.service';
import { NotificationService } from '../notification/notification.service';
import { secret } from '../secrets';

@Injectable()
// Friend system: friend requests/accept/decline, friend list with online
// status, blocking, and game invitations. Called by friends.controller.ts.
export class FriendsService {
  // Redis client (used for pending-invite records, invite:<userId> keys).
  private redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly matchService: MatchService,
    private readonly notificationService: NotificationService,
  ) {
    const host = process.env.REDIS_HOST ?? 'redis';
    const port = parseInt(process.env.REDIS_PORT ?? '6479', 10);
    const password = secret('REDIS_PASSWORD');

    this.redis = new Redis({ host, port, password, retryStrategy: (t) => Math.min(t * 50, 2000) });
    this.redis.on('error', (error) => {
      console.error('Redis error:', error.message);
    });
  }

  // Create a match room, seat both players and notify the invitee.
  // POST /api/friends/:friendId/invite
  async inviteToGame(userId: string, friendId: string) {
    if (userId === friendId)
      throw new BadRequestException({
        code: 'FRIEND_INVITE_SELF',
        message: 'Cannot invite yourself',
      });

    const friendship = await this.prisma.db.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId, status: 'accepted' },
          { userId: friendId, friendId: userId, status: 'accepted' },
        ],
      },
    });
    if (!friendship)
      throw new ForbiddenException({
        code: 'NOT_FRIENDS_WITH_USER',
        message: 'You are not friends with this user',
      });

    const match = await this.matchService.createInvite(userId);
    const inviter = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { username: true, displayName: true },
    });

    // Seat the friend into the room now : they only confirm before entering,
    // they don't have to "accept" first.
    const friendSeat = await this.matchService.joinMatch(match.gameId, friendId);

    // Push a real-time notification to the friend instead of a polled Redis key.
    await this.notificationService.notify(friendId, 'game_invite', {
      gameId: friendSeat.gameId,
      token: friendSeat.token,
      engineUrl: friendSeat.engineUrl,
      color: friendSeat.color,
      inviteCode: match.inviteCode,
      fromUsername: inviter?.username ?? 'A friend',
    });

    // Return the host's own match credentials so the caller can join its own
    // room immediately : the host must be seated before the friend can accept,
    // otherwise the friend's accept could create/join the room alone.
    return {
      message: 'Invite sent',
      gameId: match.gameId,
      token: match.token,
      engineUrl: match.engineUrl,
      color: match.color,
      inviteCode: match.inviteCode,
    };
  }

  async getPendingInvite(userId: string) {
    const raw = await this.redis.get(`invite:${userId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async dismissInvite(userId: string) {
    await this.redis.del(`invite:${userId}`);
    return { message: 'Dismissed' };
  }

  // Create a pending friend request (with duplicate/block checks) and notify
  // the target. Used by POST /api/friends/request/:userId.
  async sendFriendRequest(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException({
        code: 'FRIEND_REQUEST_SELF',
        message: 'Cannot send friend request to yourself',
      });
    }

    const targetUser = await this.prisma.db.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    const existing = await this.prisma.db.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        throw new BadRequestException({ code: 'FRIEND_ALREADY', message: 'Already friends' });
      }
      if (existing.status === 'pending') {
        throw new BadRequestException({
          code: 'FRIEND_REQUEST_PENDING',
          message: 'Friend request already pending',
        });
      }
      // FriendshipStatus is only accepted/pending/blocked, so this is the
      // remaining case after the two checks above.
      throw new ForbiddenException({
        code: 'FRIEND_BLOCKED',
        message: 'Cannot send request - user is blocked',
      });
    }

    const friendship = await this.prisma.db.friendship.create({
      data: {
        id: `${userId}-${targetUserId}`,
        user: { connect: { id: userId } },
        friend: { connect: { id: targetUserId } },
        status: 'pending',
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
        friend: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
      },
    });

    // Notify the target user that they have a new friend request.
    const sender = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { username: true, displayName: true, avatarStyle: true },
    });
    await this.notificationService.notify(targetUserId, 'friend_request', {
      requestId: friendship.id,
      fromUserId: userId,
      fromUsername: sender?.username ?? 'Someone',
      fromAvatarStyle: sender?.avatarStyle ?? 'bottts',
    });

    return friendship;
  }

  // Accept a pending request addressed to userId and notify the sender.
  // Used by POST /api/friends/accept/:requestId.
  async acceptFriendRequest(requestId: string, userId: string) {
    const request = await this.prisma.db.friendship.findFirst({
      where: {
        id: requestId,
        friendId: userId,
        status: 'pending',
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'FRIEND_REQUEST_NOT_FOUND',
        message: 'Friend request not found',
      });
    }

    const updated = await this.prisma.db.friendship.update({
      where: { id: requestId },
      data: { status: 'accepted' },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
        friend: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
      },
    });

    // Notify the original sender that their request was accepted.
    await this.notificationService.notify(request.userId, 'friend_accepted', {
      fromUserId: userId,
      fromUsername: updated.friend.username,
      fromAvatarStyle: updated.friend.avatarStyle,
    });

    return updated;
  }

  // Delete a pending request addressed to userId and notify the sender.
  // Used by POST /api/friends/decline/:requestId.
  async declineFriendRequest(requestId: string, userId: string) {
    const request = await this.prisma.db.friendship.findFirst({
      where: {
        id: requestId,
        friendId: userId,
        status: 'pending',
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'FRIEND_REQUEST_NOT_FOUND',
        message: 'Friend request not found',
      });
    }

    await this.prisma.db.friendship.delete({
      where: { id: requestId },
    });

    // Notify the original sender that their request was declined.
    const decliner = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    await this.notificationService.notify(request.userId, 'friend_declined', {
      fromUserId: userId,
      fromUsername: decliner?.username ?? 'A pilot',
    });

    return { message: 'Friend request declined' };
  }

  // Delete an accepted friendship and notify the removed friend. Used by
  // DELETE /api/friends/remove/:friendId.
  async removeFriend(userId: string, friendId: string) {
    const friendship = await this.prisma.db.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
        status: 'accepted',
      },
    });

    if (!friendship) {
      throw new NotFoundException({ code: 'FRIEND_NOT_FOUND', message: 'Friendship not found' });
    }

    await this.prisma.db.friendship.delete({
      where: { id: friendship.id },
    });

    // Notify the removed friend that the link was severed.
    const remover = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    await this.notificationService.notify(friendId, 'friend_removed', {
      fromUserId: userId,
      fromUsername: remover?.username ?? 'A pilot',
    });

    return { message: 'Friend removed' };
  }

  // Accepted friends of a user (optionally looked up by username instead of
  // the caller) with presence status. Used by GET /api/friends.
  async getFriends(userId: string, targetUsername?: string) {
    let effectiveUserId = userId;
    if (targetUsername) {
      const targetUser = await this.prisma.db.user.findUnique({
        where: { username: targetUsername },
        select: { id: true },
      });
      if (targetUser) {
        effectiveUserId = targetUser.id;
      }
    }

    const friendships = await this.prisma.db.friendship.findMany({
      where: {
        OR: [
          { userId: effectiveUserId, status: 'accepted' },
          { friendId: effectiveUserId, status: 'accepted' },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarStyle: true,
            avatarPhotoContentType: true,
            rating: true,
          },
        },
        friend: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarStyle: true,
            avatarPhotoContentType: true,
            rating: true,
          },
        },
      },
    });

    const friends = friendships.map((f) => {
      const friend = f.userId === effectiveUserId ? f.friend : f.user;
      return {
        id: friend.id,
        username: friend.username,
        displayName: friend.displayName,
        avatarStyle: friend.avatarStyle,
        hasAvatarPhoto: friend.avatarPhotoContentType !== null,
        rating: friend.rating,
        friendsSince: f.createdAt,
      };
    });

    const statuses = await this.presence.getStatuses(friends.map((f) => f.id));
    return friends.map((f) => ({ ...f, status: statuses[f.id] }));
  }

  // Pending friend requests sent and received by the user. Used by
  // GET /api/friends/requests.
  async getFriendRequests(userId: string) {
    const [sent, received] = await Promise.all([
      this.prisma.db.friendship.findMany({
        where: {
          userId,
          status: 'pending',
        },
        include: {
          friend: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
        },
      }),
      this.prisma.db.friendship.findMany({
        where: {
          friendId: userId,
          status: 'pending',
        },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
        },
      }),
    ]);

    return {
      sent: sent.map((r) => ({
        id: r.id,
        userId: r.friend.id,
        username: r.friend.username,
        displayName: r.friend.displayName,
        avatarStyle: r.friend.avatarStyle,
        createdAt: r.createdAt,
      })),
      received: received.map((r) => ({
        id: r.id,
        userId: r.user.id,
        username: r.user.username,
        displayName: r.user.displayName,
        avatarStyle: r.user.avatarStyle,
        createdAt: r.createdAt,
      })),
    };
  }

  // Block a user: create or flip the friendship row to 'blocked'. Used by
  // POST /api/friends/block/:userId.
  async blockUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException({
        code: 'FRIEND_BLOCK_SELF',
        message: 'Cannot block yourself',
      });
    }

    const existing = await this.prisma.db.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
    });

    if (existing) {
      const updated = await this.prisma.db.friendship.update({
        where: { id: existing.id },
        data: {
          userId,
          friendId: targetUserId,
          status: 'blocked',
        },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
          friend: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
        },
      });
      return updated;
    } else {
      const blocked = await this.prisma.db.friendship.create({
        data: {
          id: `${userId}-${targetUserId}-blocked`,
          userId,
          friendId: targetUserId,
          status: 'blocked',
        },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
          friend: { select: { id: true, username: true, displayName: true, avatarStyle: true } },
        },
      });
      return blocked;
    }
  }

  // Remove a 'blocked' friendship row, restoring normal relations. Used by
  // POST /api/friends/unblock/:userId.
  async unblockUser(userId: string, targetUserId: string) {
    const blocked = await this.prisma.db.friendship.findFirst({
      where: {
        userId,
        friendId: targetUserId,
        status: 'blocked',
      },
    });

    if (!blocked) {
      throw new NotFoundException({
        code: 'FRIEND_BLOCK_NOT_FOUND',
        message: 'Blocked user record not found',
      });
    }

    await this.prisma.db.friendship.delete({
      where: { id: blocked.id },
    });

    return { message: 'User unblocked' };
  }

  // All users the caller has blocked. Used by GET /api/friends/blocked.
  async getBlockedUsers(userId: string) {
    const blocked = await this.prisma.db.friendship.findMany({
      where: {
        userId,
        status: 'blocked',
      },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarStyle: true,
            avatarPhotoContentType: true,
            rating: true,
          },
        },
      },
    });

    return blocked.map((b) => ({
      id: b.friend.id,
      username: b.friend.username,
      displayName: b.friend.displayName,
      avatarStyle: b.friend.avatarStyle,
      hasAvatarPhoto: b.friend.avatarPhotoContentType !== null,
      rating: b.friend.rating,
      blockedSince: b.createdAt,
    }));
  }
}
