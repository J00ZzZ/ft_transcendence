import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TwoFactorDto } from './dto/twofactor.dto';
import { TwoFactorSettingDto } from './dto/two-factor-setting.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleAuthGuard, GithubAuthGuard, FortyTwoAuthGuard } from './oauth.guards';
import { requireSecret, isTunnelRequest } from '../secrets';

// Access-token cookie: JwtStrategy reads this exact name. Short-lived.
const ACCESS_COOKIE = 'token';
const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 min, matches JwtModule expiresIn
// Refresh-token cookie: only the auth routes need it, so it's scoped to
// /api/auth rather than sent on every API call. Long-lived.
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_PATH = '/api/auth';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches SessionService TTL
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const LOCAL_FRONTEND_URL = requireSecret('FRONTEND_URL');
const NGROK_FRONTEND_URL = requireSecret('NGROK_FRONTEND_URL');

// Picked per request from the Host header : a tunnel and a local client can
// both be live against the same backend (same signal oauth.guards.ts uses).
function frontendUrlFor(req: Request): string {
  return isTunnelRequest(req.get('host')) ? NGROK_FRONTEND_URL : LOCAL_FRONTEND_URL;
}

function originFromRequest(req: Request): string {
  const forwarded = req.headers['x-forwarded-proto'];
  const forwardedProto = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  const proto = forwardedProto || req.protocol || 'https';
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional fallback for missing Host header
  return `${proto}://${req.get('host') || 'localhost:8443'}`;
}

@Controller('api/auth')
// HTTP routes for everything auth-related: register/login/2FA, session
// refresh/logout, profile updates, and the OAuth login/callback routes.
// Delegates the actual work to AuthService.
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Each register call sends a real email, so the route is tightly throttled
  // against account spam / mail bombing.
  @Throttle({ default: { limit: 3, ttl: HOUR_MS } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, originFromRequest(req));
  }

  // The emailed verification link opens in a browser tab, so it answers with a
  // redirect to the SPA rather than JSON.
  @Get('verify-email')
  async verifyEmail(@Req() req: Request, @Res() res: Response, @Query('token') token?: string) {
    const ok = await this.authService.verifyEmail(token ?? '');
    res.redirect(
      `${originFromRequest(req)}/login?${ok ? 'verified=1' : 'error=invalid-verification-link'}`,
    );
  }

  // Factor one. 2FA off → session cookies; 2FA on → { pendingToken }, no
  // session. Brute-force surface, so tightly throttled.
  @Throttle({ default: { limit: 5, ttl: MINUTE_MS } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    if (result.twoFactorRequired) {
      return { twoFactorRequired: true, pendingToken: result.pendingToken };
    }
    // LoginResult is discriminated on twoFactorRequired, so the early return
    // above narrows this to the session variant.
    this.setSessionCookies(res, result.accessToken, result.refreshToken);
    return { twoFactorRequired: false, user: result.user };
  }

  // Factor two. Throttled because challenge-level attempt caps can be
  // sidestepped by starting new challenges; this bounds how fast.
  @Throttle({ default: { limit: 5, ttl: MINUTE_MS } })
  @Post('2fa/verify')
  @HttpCode(200)
  async verifyTwoFactor(@Body() dto: TwoFactorDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.authService.completeTwoFactor(
      dto.pendingToken,
      dto.code,
    );
    this.setSessionCookies(res, accessToken, refreshToken);
    return { user };
  }

  // Silent re-auth via refresh cookie only. Looser throttle on purpose :
  // apiFetch calls this automatically on any 401 (multi-tab users burst).
  @Throttle({ default: { limit: 30, ttl: MINUTE_MS } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.authService.refresh(
      req.cookies[REFRESH_COOKIE],
    );
    this.setSessionCookies(res, accessToken, refreshToken);
    return { user };
  }

  // Password reset step one. Always answers with the same generic message
  // (no account enumeration) : but sends a real email, so it's throttled.
  @Throttle({ default: { limit: 3, ttl: HOUR_MS } })
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto.email, originFromRequest(req));
  }

  // Password reset, step two: the emailed token + a new password.
  // The reset token is a 32-byte random value, so guessing it is not feasible;
  // this rate limit only removes the option of trying at speed.
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE_MS } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Revoke the refresh token server-side so it can't be reused, then drop
    // both cookies. clearCookie must repeat the path the cookie was set with.
    await this.authService.logout(req.cookies[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    // The JWT only carries the immutable username. displayName is editable, so
    // fetch the live value from the DB each time (one indexed row read).
    const profile = await this.authService.getProfile((req.user as { id: string }).id);
    return { user: profile.user };
  }

  // ---- Get full profile (used by the Edit-Profile card) ----
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: Request) {
    return this.authService.getProfile((req.user as { id: string }).id);
  }

  // ---- Complete profile update (username / email / 2FA method) ----
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const result = await this.authService.updateProfile((req.user as { id: string }).id, dto);
    return {
      user: result.user,
      emailVerificationSent: result.emailVerificationSent,
      oauthRedirectUrl: result.oauthRedirectUrl,
    };
  }

  // ---- Change password while logged in ----
  @UseGuards(JwtAuthGuard)
  @Patch('profile/password')
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      (req.user as { id: string }).id,
      dto.currentPassword,
      dto.newPassword,
      req.cookies[REFRESH_COOKIE],
    );
  }

  // ---- Permanently delete the account (password-verified) ----
  @UseGuards(JwtAuthGuard)
  @Delete('profile')
  @HttpCode(200)
  async deleteAccount(
    @Req() req: Request,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.deleteAccount((req.user as { id: string }).id, dto);
    // Drop both session cookies so the (now-deleted) browser ends logged out.
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
    return { message: 'Account permanently deleted' };
  }

  // ---- 2FA preference (logged-in user toggles their own) ----
  @UseGuards(JwtAuthGuard)
  @Get('2fa')
  getTwoFactor(@Req() req: Request) {
    return this.authService.getTwoFactorSetting((req.user as { id: string }).id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('2fa')
  setTwoFactor(@Req() req: Request, @Body() dto: TwoFactorSettingDto) {
    return this.authService.setTwoFactorSetting((req.user as { id: string }).id, dto.enabled);
  }

  // ---- Google OAuth ----
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.finishOAuth(req, res);
  }

  // ---- GitHub OAuth ----
  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubAuth() {}

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  githubCallback(@Req() req: Request, @Res() res: Response) {
    return this.finishOAuth(req, res);
  }

  // ---- 42 OAuth ----
  @Get('42')
  @UseGuards(FortyTwoAuthGuard)
  fortyTwoAuth() {}

  @Get('42/callback')
  @UseGuards(FortyTwoAuthGuard)
  fortyTwoCallback(@Req() req: Request, @Res() res: Response) {
    return this.finishOAuth(req, res);
  }

  // OAuth passes factor one (the provider vouched for them). If the user keeps
  // 2FA on, we still email a code and hand off to the SPA's /2fa page; if they
  // turned it off, we set the session here and go straight to the app.
  private async finishOAuth(req: Request, res: Response) {
    const user = req.user as
      | {
          id: string;
          username: string;
          email: string | null;
          twoFactorEnabled: boolean;
        }
      | undefined;
    const frontendUrl = frontendUrlFor(req);

    if (!user) {
      res.redirect(`${frontendUrl}/login?error=access_denied`);
      return;
    }

    // "Add a sign-in method" flow: the strategy already linked the provider
    // via the oauth-link `state`. Send the user back to /profile : no new
    // session, nothing logged in or out.
    const linkUserId = this.authService.resolveOAuthLinkForRequest(
      req,
      this.providerForRoute(req.path),
    );
    if (linkUserId && user.id === linkUserId) {
      res.redirect(`${frontendUrl}/profile`);
      return;
    }

    // No-email OAuth (GitHub/42): 2FA needs a code destination, so block only
    // that case : users can add an email later via Edit Profile.
    if (user.twoFactorEnabled && !user.email) {
      res.redirect(`${frontendUrl}/login?error=add-email-2fa`);
      return;
    }
    if (!user.twoFactorEnabled) {
      const { accessToken, refreshToken } = await this.authService.issueSession(
        user.id,
        user.username,
      );
      this.setSessionCookies(res, accessToken, refreshToken);
      res.redirect(`${frontendUrl}/home`);
      return;
    }
    // Reaching here means 2FA is on and the earlier `!user.email` guard passed,
    // so the code destination exists. TS can't infer that across the branches,
    // so guard once more before using it.
    if (!user.email) {
      res.redirect(`${frontendUrl}/login?error=add-email-2fa`);
      return;
    }
    const { pendingToken } = await this.authService.startTwoFactor(user.id, user.email);
    res.redirect(`${frontendUrl}/2fa?token=${pendingToken}`);
  }

  private providerForRoute(path: string): string {
    if (path.includes('/github/')) return 'github';
    if (path.includes('/google/')) return 'google';
    return '42';
  }

  // Write the access-token (15 min, path /) and refresh-token (7 days,
  // path /api/auth) httpOnly cookies after a successful login.
  private setSessionCookies(res: Response, accessToken: string, refreshToken: string) {
    const base = {
      httpOnly: true as const,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
    // Access token: path '/' so it rides along on every /api call for verification.
    res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: ACCESS_MAX_AGE_MS });
    // Refresh token: path /api/auth so it's only sent to refresh + logout.
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      path: REFRESH_PATH,
      maxAge: REFRESH_MAX_AGE_MS,
    });
  }
}
