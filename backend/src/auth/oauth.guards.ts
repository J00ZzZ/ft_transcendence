import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { secret, isTunnelRequest } from '../secrets';

// Both the localhost and ngrok OAuth apps are registered at once (under
// distinct passport strategy names, see auth.module.ts), so a single guard
// per provider has to pick the right one per request rather than at boot.
// This mirrors the Host-header check AuthController uses to pick the
// post-login redirect target — same signal, same reason: ngrok forwards the
// original Host header, so it tells us which OAuth app's client/callback the
// browser is actually going to complete the round trip with.
function tunnelAwareGuard(localStrategy: string, tunnelStrategy: string, provider: string) {
  const LocalGuard = AuthGuard(localStrategy);
  const TunnelGuard = AuthGuard(tunnelStrategy);

  @Injectable()
  class TunnelAwareAuthGuard implements CanActivate {
    // This class is returned from a factory and used as an exported base —
    // EVERY member must be public or `nest build` fails. (#-private fields and
    // private constructor params both trip the rule.)
    constructor(public readonly jwt: JwtService) {}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
      const req = context.switchToHttp().getRequest<Request>();
      const guard = isTunnelRequest(req.get('host')) ? new TunnelGuard() : new LocalGuard();
      const frontendUrl = isTunnelRequest(req.get('host'))
        ? (secret('NGROK_FRONTEND_URL') ?? 'https://polka-bless-wing.ngrok-free.dev')
        : (secret('FRONTEND_URL') ?? 'https://localhost:8443');

      // If the provider returned an OAuth error directly (e.g. ?error=access_denied)
      if (req.query?.error) {
        const res = context.switchToHttp().getResponse<Response>();
        const errParam = req.query.error === 'access_denied' ? 'access_denied' : 'oauth_failed';
        res.redirect(`${frontendUrl}/login?error=${errParam}`);
        return false;
      }

      // "Add a sign-in method" intent: when the browser already holds a valid
      // access-token cookie, treat this OAuth startup as a LINK — sign a
      // short-lived oauth-link token into the provider `state` so the callback
      // links the provider account to the logged-in user instead of logging
      // them in (or creating a new account). No cookie = normal login (no state).
      let state: string | undefined;
      const accessToken = req.cookies?.['token'];
      if (typeof accessToken === 'string') {
        try {
          const payload = this.jwt.verify(accessToken) as { sub?: string };
          if (payload.sub) {
            state = this.jwt.sign(
              { sub: payload.sub, p: provider, purpose: 'oauth-link' },
              { expiresIn: '10m' },
            );
          }
        } catch {
          /* invalid/expired access token -> normal login */
        }
      }

      const opts = (guard as any).options ?? {};
      (guard as any).options = state ? { ...opts, state } : { ...opts, state: undefined };

      try {
        const result = guard.canActivate(context);

        // Fast paths — a boolean can't carry the strategy rejection; observables
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
