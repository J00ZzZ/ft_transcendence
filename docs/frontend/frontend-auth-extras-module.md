# Frontend — Auth Extras (2FA, Password Reset)

## Table of Contents

- [Overview](#overview) — Two-factor authentication and password reset pages
- [Files](#files) — Source file inventory
- [Pages](#pages) — Individual page descriptions

---

## Overview

These pages handle post-password authentication flows:

1. **TwoFactor** (`/2fa`) — 6-digit code entry after password login or OAuth when 2FA is enabled.
2. **ForgotPassword** (`/forgot-password`) — Step one of password reset; collects email and requests a reset link.
3. **ResetPassword** (`/reset-password`) — Step two of password reset; redeems emailed token with a new password.

All three are full-bleed routes (no shell) and are public (no session required).

---

## Files

| File | Role |
|------|------|
| `src/pages/TwoFactor.tsx` | 2FA code entry page |
| `src/pages/ForgotPassword.tsx` | Password reset step 1 — email input |
| `src/pages/ResetPassword.tsx` | Password reset step 2 — new password form |
| `src/components/RetroAuthLayout.tsx` | Layout wrapper for all auth pages |
| `src/store.tsx` | `verify2fa`, `forgotPassword`, `resetPassword` actions |
| `src/validatePassword.ts` | Client-side password validation (mirrors backend policy) |

---

## Pages

### TwoFactor (`/2fa`)

Reached with `?token=<pendingToken>` after password login or OAuth when the account has 2FA enabled.

- Displays a 6-digit code input (numeric, auto-focused).
- Calls `POST /api/auth/2fa/verify` with `pendingToken` and `code`.
- On success, navigates to `/home`.
- On failure, shows error message.

**Route params:** `token` query param = the `pendingToken` from login response.

### Password reset flow

```mermaid
flowchart TD
    A["User clicks 'Forgot password'"] --> B["ForgotPassword page (/forgot-password)"]
    B --> C["POST /api/auth/forgot-password (email)"]
    C --> D["Backend emails a one-time reset link"]
    D --> E["User opens /reset-password?token=..."]
    E --> F["ResetPassword page — new password + confirm"]
    F --> G["POST /api/auth/reset-password (token, password)"]
    G --> H["Redirect to /login?reset=1"]
    H --> I["User signs in with the new password"]
```

### 2FA flow

```mermaid
flowchart TD
    A["Login with password / OAuth"] --> B{"Account has 2FA enabled?"}
    B -- "No" --> C["Session created — go to /home"]
    B -- "Yes" --> D["Backend emails a 6-digit code"]
    D --> E["Redirect to /2fa?token=pendingToken"]
    E --> F["Enter code → POST /api/auth/2fa/verify"]
    F --> G{"Code correct?"}
    G -- "Yes" --> C
    G -- "No" --> H["Show error, retry"]
```

---

### ForgotPassword (`/forgot-password`)

Step one of password reset.

- Email input with validation.
- Calls `POST /api/auth/forgot-password` with the email.
- Always shows the same success message (no account enumeration).
- On success, shows "check your inbox" confirmation with a link back to `/login`.

---

### ResetPassword (`/reset-password`)

Step two of password reset.

- Reached from the emailed link: `?token=<resetToken>`.
- New password + confirm password fields.
- Validates password against the same policy as signup (12+ chars, upper, lower, number, special).
- Calls `POST /api/auth/reset-password` with `token` and `password`.
- On success, navigates to `/login?reset=1`.
- If no `token` query param, shows an "invalid reset link" error.

**Route params:** `token` query param = the 64-char hex reset token from the email.

---

## Password Policy

Both `ForgotPassword` and `ResetPassword` enforce the same policy as registration:

```typescript
// frontend/src/validatePassword.ts
export function passwordError(password: string): string | null {
  if (password.length < 12 || password.length > 72) return 'Password must be 12-72 characters'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/\d/.test(password)) return 'Password must contain a number'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a special character'
  return null
}
```

---

## Dependencies

| Dependency | Purpose |
|-----------|---------|
| `store.tsx` | `verify2fa`, `forgotPassword`, `resetPassword` actions |
| `router.tsx` | `navigate`, `useRoute` for token query params |
| `validatePassword.ts` | Client-side password validation |
| `RetroAuthLayout.tsx` | Centered card layout wrapper |
| `theme.ts` | `btnGold`, `goldText`, `input`, `label` styles |