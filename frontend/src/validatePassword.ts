// Client-side mirror of the backend password policy (backend
// dto/password.rules.ts)
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 72;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export function passwordError(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (pw.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  if (!PASSWORD_REGEX.test(pw))
    return 'Password needs an uppercase letter, a lowercase letter, a number, and a special character';
  return null;
}
