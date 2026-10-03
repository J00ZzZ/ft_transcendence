// Client-side mirror of the backend's `@IsEmail()` gate (class-validator, used
// by RegisterDto and UpdateProfileDto). Deliberately loose : it only rejects
// obviously malformed values (`no@at`, `a@b`, embedded spaces), so it can never
// block an address the server would accept. The backend stays authoritative.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
