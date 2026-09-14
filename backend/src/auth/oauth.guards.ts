import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { requireSecret, isTunnelRequest } from '../secrets';

// Per-mode frontend origin for OAuth redirects (local vs ngrok tunnel). Both
// are required by the make env preflight, so no hardcoded fallback here.
const LOCAL_FRONTEND_URL = requireSecret('FRONTEND_URL');
const NGROK_FRONTEND_URL = requireSecret('NGROK_FRONTEND_URL');

// Builds one guard class per OAuth provider. Chooses the local vs ngrok
// strategy per request from the Host header. Used on /api/auth/<provider> routes.
function tunnelAwareGuard(localStrategy: string, tunnelStrategy: string, provider: string) {
  const LocalGuard = AuthGuard(localStrategy);
  const TunnelGuard = AuthGuard(tunnelStrategy);

  @Injectable()
  // Guard that runs the right provider strategy and redirects OAuth failures
  // back to the frontend login page with an `error` query param.
  class TunnelAwareAuthGuard implements CanActivate {
    // This class is returned from a factory and used as an exported base :
    // EVERY member must be public or `nest build` fails. (#-private fields and
    // private constructor params both trip the rule.)
    constructor(public readonly jwt: JwtService) {}

    // Entry point called by Nest on the /api/auth/<provider> route: picks the
    // strategy, injects oauth-link state when needed, and handles rejections.
    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
      const req = context.switchToHttp().getRequest<Request>();
      const tunnel = isTunnelRequest(req.get('host'));
      const guard = tunnel ? new TunnelGuard() : new LocalGuard();
      const frontendUrl = tunnel ? NGROK_FRONTEND_URL : LOCAL_FRONTEND_URL;

      // If the provider returned an OAuth error directly (e.g. ?error=access_denied)
      if (req.query.error) {
        const res = context.switchToHttp().getResponse<Response>();
        const errParam = req.query.error === 'access_denied' ? 'access_denied' : 'oauth_failed';
        res.redirect(`${frontendUrl}/login?error=${errParam}`);
        return false;
      }

      // "Add a sign-in method" intent: with a valid access-token cookie, sign
      // a short-lived oauth-link token into the provider `state` so the
      // callback links the provider to the logged-in user. No cookie = login.
      let state: string | undefined;
      const accessToken = req.cookies['token'];
      if (typeof accessToken === 'string') {
        try {
          const payload = this.jwt.verify<{ sub?: string }>(accessToken);
          if (payload.sub) {
            state = this.jwt.sign(
              { sub: payload.sub, p: provider, purpose: 'oauth-link' },
              { expiresIn: '10m' },
            );
          }
        } catch {
          // invalid/expired access token -> normal login
        }
      }

      // `guard.options` isn't part of the public AuthGuard type, so read/write
      // it through a narrow structural type instead of `any`.
      const guardWithOptions = guard as { options?: Record<string, unknown> };
      const opts = guardWithOptions.options ?? {};
      guardWithOptions.options = state ? { ...opts, state } : { ...opts, state: undefined };

      try {
        const result = guard.canActivate(context);

        // Fast paths : a boolean can't carry the strategy rejection; observables
        // are passed through untouched.
        if (typeof result === 'boolean') {
          if (!result) {
            const res = context.switchToHttp().getResponse<Response>();
            res.redirect(`${frontendUrl}/login?error=access_denied`);
            return false;
          }
          return result;
        }
        if (result instanceof Observable) return result;

        // Promise path: handle strategy rejection or conflict exceptions by redirecting to login.
        return result.catch((err: unknown) => {
          const res = context.switchToHttp().getResponse<Response>();
          if (err instanceof ConflictException) {
            res.redirect(`${frontendUrl}/login?error=email-in-use`);
            return false;
          }
          res.redirect(`${frontendUrl}/login?error=access_denied`);
          return false;
        });
      } catch (err: unknown) {
        const res = context.switchToHttp().getResponse<Response>();
        if (err instanceof ConflictException) {
          res.redirect(`${frontendUrl}/login?error=email-in-use`);
          return false;
        }
        res.redirect(`${frontendUrl}/login?error=access_denied`);
        return false;
      }
    }
  }

  return TunnelAwareAuthGuard;
}

@Injectable()
export class GoogleAuthGuard extends tunnelAwareGuard('google', 'google-tunnel', 'google') {}

@Injectable()
export class GithubAuthGuard extends tunnelAwareGuard('github', 'github-tunnel', 'github') {}

@Injectable()
export class FortyTwoAuthGuard extends tunnelAwareGuard('42', '42-tunnel', '42') {}
