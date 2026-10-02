// Auth tunables: single source of truth. Import where enforced: change once.
export const AUTH = {
  verifyTokenTtlS: 24 * 60 * 60, // signup link (Redis `verify:`)
  resetTokenTtlS: 60 * 60, // password-reset link (Redis `reset:`)
  changeTokenTtlS: 15 * 60, // email-change link (Redis `emailchange:`)
  maxEmailChangesPerHour: 3, // per user
  challenge: {
    ttlS: 5 * 60, // 2FA login code (Redis `2fa:`)
    maxAttempts: 5,
    resendWindowS: 60 * 60,
    maxResends: 3,
  },
} as const;

// JWT scope claims. A token only works where its audience says it belongs:
// session tokens are bound to the API, oauth-link tokens (signed with their
// own OAUTH_STATE_SECRET) only to the OAuth callback. Same idea as the
// engine's `aud: 'ludo-engine'` in match/engine-token.util.ts.
export const TOKEN_ISSUER = 'ft_transcendence';
export const SESSION_TOKEN_AUDIENCE = 'ft_transcendence-api';
export const OAUTH_LINK_AUDIENCE = 'oauth-link';
export const OAUTH_LINK_TTL = '10m';
