import { IsString, Length } from 'class-validator';

// The token arrives in the POST body, never in the URL. An emailed link points
// at the SPA (`/verify-email#token=...`), and a URL fragment is not sent to the
// server, so the token cannot end up in nginx's access or error log.
export class VerifyEmailDto {
  // 32 random bytes hex-encoded; same shape for the signup and email-change
  // links. Strict length so a malformed body never reaches Redis.
  @IsString()
  @Length(64, 64)
  token!: string;
}
