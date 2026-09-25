import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { PrismaService } from '../prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtPayload } from './jwt-payload';
import { MailService } from './mail.service';
import { TwoFactorService } from './twofactor.service';
import { SessionService } from './session.service';
import { requireSecret, secret } from '../secrets';
import { NotificationService } from '../notification/notification.service';
import { AvatarMetaService } from '../avatar/avatar-meta.service';

const SALT_ROUNDS = 10;
// Also where the SPA lives; /api on the same origin reaches the backend
// through whichever proxy (nginx or Vite) is serving it. Required by the
// make env preflight, so no hardcoded fallback here.
const BASE_URL = requireSecret('FRONTEND_URL');

// store all email as lowercase since email is case-insensitive
const normalizeEmail = (email: string) => email.trim().toLowerCase();

// The part of an OAuth callback request that auth code reads: the provider
// `state` query param (a signed oauth-link token) and the access-token cookie.
// `query` stays structural so an Express Request or ParsedQs satisfies it.
export interface OAuthCallbackRequest {
  query?: { state?: unknown };
  cookies?: Record<string, unknown>;
}

// convert at read/display time
const formatVerifiedAt = (date: Date) =>
  new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

// login()'s outcomes: an unverified address, a 2FA challenge, or a session.
// The explicit union lets the controller narrow on the variant it receives.
type LoginResult =
  | { emailNotVerified: true }
  | { twoFactorRequired: true; pendingToken: string }
  | {
      twoFactorRequired: false;
      accessToken: string;
      refreshToken: string;
      user: { id: string; username: string; displayName: string };
    };

@Injectable()
// All account logic: register/login with email verification + 2FA, session
// tokens, OAuth linking, profile/password changes, account deletion. Called
// by auth.controller.ts and the OAuth strategies.
export class AuthService implements OnModuleDestroy {
  // Redis client used only for account-deletion cleanup (matches, presence,
  // invites, leaderboard entries).
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly twoFactor: TwoFactorService,
    private readonly session: SessionService,
    private readonly notifications: NotificationService,
    private readonly avatarMeta: AvatarMetaService,
  ) {
    // Small Redis client for account-deletion cleanup (same idiom as
    // FriendsService / MatchPlayerService).
    const host = process.env.REDIS_HOST ?? 'redis';
    const port = parseInt(process.env.REDIS_PORT ?? '6479', 10);
    const password = secret('REDIS_PASSWORD');
    this.redis = new Redis({ host, port, password, retryStrategy: (t) => Math.min(t * 50, 2000) });
    this.redis.on('error', (error) => {
      console.error('Auth Redis error:', error.message);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  // Create a local (password) account: check username/email are free, hash
  // the password, create the User + Achievement rows, and email a signup
  // verification link. Called by auth.controller.ts POST /register.
  async register(dto: RegisterDto, baseUrl: string = BASE_URL) {
    const existing = await this.prisma.db.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException({
        code: 'AUTH_USERNAME_TAKEN',
        message: 'Username is already taken',
      });
    }

    const email = dto.email ? normalizeEmail(dto.email) : dto.email;
    if (email) {
      const emailTaken = await this.prisma.db.user.findUnique({ where: { email } });
      if (emailTaken) {
        throw new ConflictException({
          code: 'AUTH_EMAIL_TAKEN',
          message: 'Email already registered. Use a different email',
        });
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.db.user.create({
      data: {
        id: crypto.randomUUID(),
        username: dto.username,
        displayName: dto.username,
        email,
        password_hash: passwordHash,
        achievement: { create: { id: crypto.randomUUID() } },
      },
    });

    // Seed the avatar-meta cache: a fresh account has no photo, so every reader
    // (the engine included) can tell that from the very first join.
    await this.avatarMeta.set(user.id, { has: false, style: user.avatarStyle });

    // No session yet, the account activates via the emailed link.
    const token = await this.twoFactor.createVerifyToken(user.id);
    await this.mail.sendVerification(email, `${baseUrl}/api/auth/verify-email?token=${token}`);
    return { message: 'Account created : check your email to verify your address.' };
  }

  // Redeems a signup verification link. Returns false for unknown/expired tokens.
  async verifyEmail(token: string): Promise<boolean> {
    const userId = await this.twoFactor.consumeVerifyToken(token);
    if (!userId) return false;
    const emailVerifiedAt = new Date();
    const user = await this.prisma.db.user.update({
      where: { id: userId },
      data: { emailVerified: emailVerifiedAt },
    });
    console.log(`Email verified for ${user.username} at ${formatVerifiedAt(emailVerifiedAt)}`);
    return true;
  }

  // Factor one of password login: match identifier (username or email) and
  // password. An unverified address stops here; otherwise 2FA decides between
  // a session and an emailed code. Called by auth.controller.ts POST /login.
  async login(dto: LoginDto): Promise<LoginResult> {
    // Accept either a username or an email in the same field.
    const user = await this.prisma.db.user.findFirst({
      where: {
        OR: [{ username: dto.identifier }, { email: normalizeEmail(dto.identifier) }],
      },
    });
    if (!user?.password_hash) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid username, email, or password',
      });
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid username, email, or password',
      });
    }

    // An unverified address cannot sign in. Returned as a result, not thrown:
    // the browser logs a failed status itself, and this is a normal state.
    if (!user.emailVerified) return { emailNotVerified: true as const };

    // 2FA off → password alone is enough; issue the session immediately.
    // 2FA on → password is only factor one; email a code and finish later.
    if (!user.twoFactorEnabled) {
      return {
        twoFactorRequired: false as const,
        ...(await this.issueSession(user.id, user.username)),
      };
    }
    const { pendingToken } = await this.startTwoFactor(user.id, user.email ?? '');
    return { twoFactorRequired: true as const, pendingToken };
  }

  // Step one of reset: email a one-time link for password accounts only.
  // Same reply for every case, so callers can't probe which emails exist.
  async forgotPassword(rawEmail: string, baseUrl: string = BASE_URL) {
    const email = normalizeEmail(rawEmail);
    const user = await this.prisma.db.user.findUnique({ where: { email } });
    // Only local accounts have a password to reset; OAuth-only users (no
    // password_hash) sign in through their provider instead.
    if (user?.password_hash) {
      const token = await this.twoFactor.createResetToken(user.id);
      await this.mail.sendPasswordReset(email, `${baseUrl}/reset-password?token=${token}`);
    }
    return { message: 'If that email is registered, a reset link is on its way.' };
  }

  // Step two: redeem the link's token and set the new password.
  async resetPassword(token: string, newPassword: string) {
    const userId = await this.twoFactor.consumeResetToken(token);
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_RESET_LINK_INVALID',
        message: 'This reset link is invalid or has expired',
      });
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        password_hash: passwordHash,
        // Redeeming an emailed link proves inbox control : the same guarantee
        // signup verification gives : so confirm the address if it wasn't yet.
        // Without this, an unverified user could reset yet still be login-blocked.
        emailVerified: new Date(),
      },
    });
    // drop every existing session after a password reset
    await this.session.revokeAll(userId);

    // Announce the password reset to the user. It is persisted, so it appears in
    // the bell on their next sign-in; this flow revokes all open sessions.
    await this.notifications
      .notify(userId, 'profile_updated', { items: ['password'] })
      .catch(() => {});

    return { message: 'Password updated : you can log in with it now.' };
  }

  // Factor two: email a one-time code, hand back the challenge reference.
  async startTwoFactor(userId: string, email: string) {
    const { pendingToken, code } = await this.twoFactor.startChallenge(userId);
    await this.mail.send2faCode(email, code);
    return { pending: true as const, pendingToken };
  }

  // Factor two of 2FA login: check the emailed code against the pending
  // token and issue the full session. Called by auth.controller.ts
  // POST /twofactor.
  async completeTwoFactor(pendingToken: string, code: string) {
    const userId = await this.twoFactor.verifyChallenge(pendingToken, code);
    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTH_CODE_INVALID',
        message: 'Invalid or expired code',
      });
    }
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_CODE_INVALID',
        message: 'Invalid or expired code',
      });
    }
    return this.issueSession(user.id, user.username);
  }

  // Sign a short-lived access-token JWT (15m, per JwtModule config).
  signAccess(userId: string, username: string): string {
    const payload: JwtPayload = { sub: userId, username };
    return this.jwt.sign(payload);
  }

  // Issue a fresh session: a short-lived access token plus a long-lived,
  // revocable refresh token. Called once both login factors pass.
  async issueSession(userId: string, username: string) {
    const accessToken = this.signAccess(userId, username);
    const refreshToken = await this.session.issue(userId);
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return {
      accessToken,
      refreshToken,
      user: { id: userId, username, displayName: user?.displayName ?? username },
    };
  }

  // Trade a refresh token for a new access token, rotating the refresh token
  // in the same step. Throws 401 when it's missing/expired/revoked.
  async refresh(refreshToken?: string) {
    if (!refreshToken)
      throw new UnauthorizedException({
        code: 'AUTH_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });
    const rotated = await this.session.rotate(refreshToken);
    if (!rotated)
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_EXPIRED',
        message: 'Session expired : please log in again',
      });
    const user = await this.prisma.db.user.findUnique({ where: { id: rotated.userId } });
    if (!user)
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_EXPIRED',
        message: 'Session expired : please log in again',
      });
    return {
      accessToken: this.signAccess(user.id, user.username),
      refreshToken: rotated.newToken,
      user: { id: user.id, username: user.username, displayName: user.displayName },
    };
  }

  // Revoke the given refresh token : logout on this device.
  async logout(refreshToken?: string) {
    if (refreshToken) await this.session.revoke(refreshToken);
  }

  // Full profile for the Edit-Profile card (incl. linked OAuth providers).
  async getProfile(userId: string) {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    // Repair the avatar-meta cache from this row: /me is the payload every session
    // loads, so the cached flag follows the stored row at no extra query cost.
    this.avatarMeta.syncFromUser(user);

    const accounts = await this.prisma.db.account.findMany({
      where: { userId },
      select: { provider: true },
    });
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        hasPassword: !!user.password_hash,
        avatarStyle: user.avatarStyle,
        hasAvatarPhoto: user.avatarPhotoContentType !== null,
        providers: accounts.map((a) => a.provider),
      },
    };
  }

  // Validates a short-lived access-token JWT (the `token` cookie). Returns the
  // user id when valid, else null. Used to confirm an OAuth callback is a
  // genuine "add method" round-trip from an already-authenticated browser.
  verifyAccessToken(token: string | undefined): string | null {
    if (!token) return null;
    try {
      const payload = this.jwt.verify<{ sub?: string }>(token);
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  // Read the user's current 2FA preference.
  async getTwoFactorSetting(userId: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    if (!user)
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    return { twoFactorEnabled: user.twoFactorEnabled };
  }

  // Turn email-code 2FA on or off for the user.
  async setTwoFactorSetting(userId: string, enabled: boolean) {
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: enabled },
    });
    return { twoFactorEnabled: enabled };
  }

  // Complete profile update : edit display name, email, and/or the email-code
  // 2FA method in one call; only provided fields change. Email changes reuse
  // the signup verification flow. Username is immutable.
  async updateProfile(
    userId: string,
    dto: {
      displayName?: string;
      email?: string;
      twoFactorEnabled?: boolean;
      oauthToAdd?: string;
      oauthToRemove?: string;
    },
  ) {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const data: Record<string, unknown> = {};
    let emailChanged = false;
    let newEmail: string | undefined;
    // Items actually changed in this request : feeds the profile_updated toast.
    const changedItems: string[] = [];

    if (dto.displayName !== undefined && dto.displayName !== user.displayName) {
      const taken = await this.prisma.db.user.findUnique({
        where: { displayName: dto.displayName },
      });
      if (taken)
        throw new ConflictException({
          code: 'AUTH_DISPLAY_NAME_TAKEN',
          message: 'Display name is already taken',
        });
      data.displayName = dto.displayName;
    }

    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email);
      if (email !== user.email) {
        const emailTaken = await this.prisma.db.user.findUnique({ where: { email } });
        if (emailTaken) {
          throw new ConflictException({
            code: 'AUTH_EMAIL_TAKEN',
            message: 'Email already registered. Use a different email',
          });
        }
        data.email = email;
        // New address must be re-confirmed before it can be used to log in.
        data.emailVerified = null;
        emailChanged = true;
        newEmail = email;
      }
    }

    if (dto.twoFactorEnabled !== undefined) {
      data.twoFactorEnabled = dto.twoFactorEnabled;
    }

    // OAuth: remove a linked sign-in method (lockout-guarded).
    if (dto.oauthToRemove !== undefined) {
      await this.removeOAuthMethod(userId, dto.oauthToRemove);
      changedItems.push('oauthRemove');
    }

    // OAuth: adding a method needs the browser round-trip : mint a 10m
    // oauth-link token and hand back the provider authorize URL with it in
    // `state`; the callback then links the provider to this user.
    let oauthRedirectUrl: string | undefined;
    if (dto.oauthToAdd !== undefined) {
      const state = this.createOAuthLinkToken(userId, dto.oauthToAdd);
      // Relative path (same as the login page's OAuthButtons) so it resolves on
      // whatever host the user is actually connected through (LAN IP, tunnel, etc.).
      oauthRedirectUrl = `/api/auth/${encodeURIComponent(dto.oauthToAdd)}?state=${encodeURIComponent(state)}`;
    }

    const updated =
      Object.keys(data).length > 0
        ? await this.prisma.db.user.update({ where: { id: userId }, data })
        : user;

    // Email change → auto-send a fresh verification link (reuse register's path).
    if (emailChanged && newEmail) {
      const token = await this.twoFactor.createVerifyToken(userId);
      await this.mail.sendVerification(
        newEmail,
        `${BASE_URL}/api/auth/verify-email?token=${token}`,
      );
    }

    // Profile-change notifications
    // 1) Self-confirmation (persisted): "You have updated your profile: …"
    if (data.displayName !== undefined) changedItems.push('displayName');
    if (emailChanged) changedItems.push('email');
    if (dto.twoFactorEnabled !== undefined && dto.twoFactorEnabled !== user.twoFactorEnabled) {
      changedItems.push('twoFactor');
    }
    if (changedItems.length > 0) {
      await this.notifications
        .notify(userId, 'profile_updated', { items: changedItems })
        .catch(() => {});
    }

    // 2) Global announcement (transient toast, all online users):
    //    "(Old DisplayName) has changed their Displayname to (New DisplayName)"
    if (data.displayName !== undefined) {
      await this.notifications
        .broadcast('display_name_changed', {
          fromUserId: userId,
          fromUsername: user.username,
          oldDisplayName: user.displayName,
          displayName: dto.displayName,
        })
        .catch(() => {});
    }

    const accounts = await this.prisma.db.account.findMany({
      where: { userId },
      select: { provider: true },
    });

    return {
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.displayName,
        email: updated.email,
        hasPassword: !!updated.password_hash,
        providers: accounts.map((a) => a.provider),
      },
      emailVerificationSent: emailChanged,
      oauthRedirectUrl,
    };
  }

  // Logged-in password change: verify the current password (if one exists),
  // set the new one, and revoke every other session. OAuth-only accounts
  // set their FIRST password here.
  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
    currentRefreshToken?: string,
  ) {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    if (user.password_hash) {
      const matches = await bcrypt.compare(currentPassword ?? '', user.password_hash);
      if (!matches)
        throw new UnauthorizedException({
          code: 'AUTH_CURRENT_PASSWORD_INCORRECT',
          message: 'Current password is incorrect',
        });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { password_hash: passwordHash },
    });

    // Log the user out everywhere : other devices must re-auth with the new password.
    await this.session.revokeAllExcept(userId, currentRefreshToken);

    await this.notifications
      .notify(userId, 'profile_updated', { items: ['password'] })
      .catch(() => {});

    return {
      code: 'AUTH_PASSWORD_UPDATED',
      message: 'Password updated : other devices were signed out.',
    };
  }

  // Permanently delete the user's account. Requires `confirm: true` and a
  // verified password. Redis/other cleanup runs first; the DB delete (last)
  // is the single point of no return.
  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    if (!dto.confirm)
      throw new BadRequestException({
        code: 'AUTH_DELETE_CONFIRM_REQUIRED',
        message: 'You must confirm account deletion',
      });

    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    if (!user.password_hash) {
      throw new ForbiddenException({
        code: 'AUTH_DELETE_SET_PASSWORD',
        message: 'Set a password before deleting your account',
      });
    }
    const matches = await bcrypt.compare(dto.currentPassword ?? '', user.password_hash);
    if (!matches)
      throw new UnauthorizedException({
        code: 'AUTH_CURRENT_PASSWORD_INCORRECT',
        message: 'Current password is incorrect',
      });

    // 1. Abort live matches the user is seated in, so a deleted user_id can
    //    never FK-fail processGameEnd and void the opponents' results.
    await this.abortUserMatches(userId);

    // 2. Drop ephemeral Redis state (presence, invites, leaderboard entries).
    await this.clearUserRedisState(userId);
    //    ...and the avatar-meta record, so a deleted account leaves none behind.
    await this.avatarMeta.remove(userId);

    // 3. Revoke every refresh session : all devices are logged out.
    await this.session.revokeAll(userId);

    // 4. DB: user.delete() cascades Account/Achievement/GameParticipant/Friendship/
    //    Notification (all onDelete: Cascade in the schema). The user's Redis
    //    leaderboard entry is already removed by clearUserRedisState above.
    await this.prisma.db.user.delete({ where: { id: userId } });

    return { message: 'Account permanently deleted' };
  }

  // Mark every WAITING/ACTIVE match the user is seated in as ABORTED (1h TTL).
  private async abortUserMatches(userId: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'match:*', 'COUNT', 100);
        cursor = nextCursor;
        for (const key of keys) {
          const data = await this.redis.hgetall(key);
          const seated = [
            data.player1_id,
            data.player2_id,
            data.player3_id,
            data.player4_id,
          ].includes(userId);
          if (seated && (data.status === 'WAITING' || data.status === 'ACTIVE')) {
            await this.redis.hset(key, 'status', 'ABORTED');
            await this.redis.expire(key, 3600);
          }
        }
      } while (cursor !== '0');
    } catch (error) {
      console.error('abortUserMatches error:', (error as Error).message);
    }
  }

  // Remove the user's ephemeral Redis state (presence, invites, leaderboard).
  private async clearUserRedisState(userId: string): Promise<void> {
    try {
      await this.redis.del(`presence:${userId}`, `invite:${userId}`);
      for (const mode of ['global', 'ranked', 'casual', 'bot']) {
        await this.redis.zrem(`leaderboard:${mode}`, userId);
      }
    } catch (error) {
      console.error('clearUserRedisState error:', (error as Error).message);
    }
  }

  // Called after a provider (Google/GitHub) has verified the user.
  // Finds the matching user, or links/creates one, then returns it.
  async validateOAuthLogin(
    input: {
      provider: string;
      providerAccountId: string;
      email?: string;
      usernameSeed: string;
    },
    linkUserId?: string,
  ) {
    // EMAIL OWNERSHIP RULE: a provider's email only sets email/emailVerified
    // on FIRST sign-in. The "add sign-in method" flow (linkUserId) ignores it
    // : linking 42 to a Google account keeps the Google email and its state.

    // If provider account exist just log them in
    const existingAccount = await this.prisma.db.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: input.provider,
          providerAccountId: input.providerAccountId,
        },
      },
      include: { user: true },
    });
    if (existingAccount) {
      // "Add method" intent: same user -> no-op, different user -> conflict.
      if (linkUserId && existingAccount.userId !== linkUserId) {
        throw new ConflictException({
          code: 'AUTH_PROVIDER_LINKED',
          message: 'This provider account is linked to another user',
        });
      }
      return existingAccount.user;
    }

    // "Add method" intent with a new provider account: link it straight to
    // the requesting user (provider identity is already vouched by OAuth).
    if (linkUserId) {
      const linked = await this.prisma.db.user.findUnique({ where: { id: linkUserId } });
      if (linked) {
        // The provider's email must not already belong to a different account
        const linkEmail = input.email ? normalizeEmail(input.email) : undefined;
        if (linkEmail) {
          const linkEmailOwner = await this.prisma.db.user.findUnique({
            where: { email: linkEmail },
          });
          if (linkEmailOwner && linkEmailOwner.id !== linkUserId) {
            throw new ConflictException({
              code: 'AUTH_EMAIL_TAKEN',
              message: 'That provider account uses an email already registered to another account',
            });
          }
        }

        await this.prisma.db.account.create({
          data: {
            id: crypto.randomUUID(),
            userId: linkUserId,
            provider: input.provider,
            providerAccountId: input.providerAccountId,
          },
        });

        // Announce the newly linked sign-in method to the user.
        await this.notifications
          .notify(linkUserId, 'profile_updated', { items: ['oauthAdd'] })
          .catch(() => {});

        return linked;
      }
      // The "add method" user can be missing (e.g. session outlived a DB wipe),
      // so fall through to a normal first-time login instead of linking a
      // non-existent userId (FK violation).
    }

    //  First time with this provider and the email already belongs to an
    //  existing user → REJECT. (The "add method" flow above is exempt.)
    const email = input.email ? normalizeEmail(input.email) : undefined;
    if (email) {
      const emailOwner = await this.prisma.db.user.findUnique({ where: { email } });
      if (emailOwner) {
        // Don't leak the exact owner : same generic message as register().
        throw new ConflictException(
          'This email is already being used. Use a different email or log in using the same method you used to create this account.',
        );
      }
    }

    // Create new. Provider-verified email fills the email field; without one
    // (GitHub/42), the account starts with an empty email, addable later via
    // Edit Profile.
    const username = await this.generateUniqueUsername(input.usernameSeed);
    const displayName = await this.generateUniqueDisplayName(username);
    const user = await this.prisma.db.user.create({
      data: {
        id: crypto.randomUUID(),
        username,
        displayName,
        email,
        emailVerified: email ? new Date() : null,
        achievement: { create: { id: crypto.randomUUID() } },
      },
    });

    await this.prisma.db.account.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
    });

    // Same seeding as register(): a fresh OAuth account has no photo either.
    await this.avatarMeta.set(user.id, { has: false, style: user.avatarStyle });

    return user;
  }

  // Signed 10-minute token carried in the OAuth `state` when a logged-in
  // user wants to ADD a provider sign-in method.
  createOAuthLinkToken(userId: string, provider: string): string {
    return this.jwt.sign({ sub: userId, p: provider, purpose: 'oauth-link' }, { expiresIn: '10m' });
  }

  // Verify a `state` token from the provider callback. Returns the userId
  // when it's ours and matches `provider`; anything else means normal login.
  resolveOAuthLinkForRequest(
    req: OAuthCallbackRequest | undefined,
    provider: string,
  ): string | undefined {
    const linkUserId = this.resolveOAuthLink(req?.query?.state, provider);
    if (!linkUserId) return undefined;
    const sessionUser = this.verifyAccessToken(
      typeof req?.cookies?.['token'] === 'string' ? req.cookies['token'] : undefined,
    );
    return sessionUser === linkUserId ? linkUserId : undefined;
  }

  // Signature check only : callers must use resolveOAuthLinkForRequest, which
  // also proves the presenter is the user named in the token.
  private resolveOAuthLink(state: unknown, provider: string): string | undefined {
    if (typeof state !== 'string' || !state) return undefined;
    try {
      const payload = this.jwt.verify<{ sub?: string; p?: string; purpose?: string }>(state);
      if (payload.purpose !== 'oauth-link' || payload.p !== provider) return undefined;
      return payload.sub;
    } catch {
      return undefined;
    }
  }

  // Unlink a provider sign-in method. The user must keep at least one other
  // way to sign in : a password OR another linked provider.
  async removeOAuthMethod(userId: string, provider: string) {
    const account = await this.prisma.db.account.findFirst({ where: { userId, provider } });
    if (!account)
      throw new NotFoundException({
        code: 'AUTH_PROVIDER_NOT_LINKED',
        message: 'That provider is not linked to this account',
      });

    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const remainingAccounts = await this.prisma.db.account.count({
      where: { userId, NOT: { provider } },
    });
    if (!user.password_hash && remainingAccounts === 0) {
      throw new ForbiddenException({
        code: 'AUTH_KEEP_ONE_SIGNIN',
        message: 'You must keep at least one sign-in method',
      });
    }

    await this.prisma.db.account.delete({ where: { id: account.id } });
    return { removed: provider };
  }

  // Turning usernames into unique seeds
  private async generateUniqueUsername(seed: string) {
    const base = seed.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
    let candidate = base;
    while (await this.prisma.db.user.findUnique({ where: { username: candidate } })) {
      candidate = `${base}_${this.randomChars(5)}`;
    }
    return candidate;
  }

  // Display names are unique too, so a freshly generated display name that
  // collides with an existing one also gets 5 random characters appended.
  private async generateUniqueDisplayName(seed: string) {
    const base = seed.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
    let candidate = base;
    while (await this.prisma.db.user.findUnique({ where: { displayName: candidate } })) {
      candidate = `${base}_${this.randomChars(5)}`;
    }
    return candidate;
  }

  // 5 random alphanumeric characters (e.g. "3kF9z"). Avoids ambiguous
  // characters (0/O, 1/l/I) so generated suffixes are easy to read aloud.
  private randomChars(length: number): string {
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }
}
