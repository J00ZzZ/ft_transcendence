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
