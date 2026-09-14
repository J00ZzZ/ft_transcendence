import { IsString, Length, MinLength, MaxLength, Matches } from 'class-validator';
import { PASSWORD_MIN, PASSWORD_MAX, PASSWORD_REGEX, PASSWORD_MESSAGE } from './password.rules';

export class ResetPasswordDto {
  // 32 random bytes hex-encoded, issued by the forgot-password step.
  @IsString()
  @Length(64, 64)
  token!: string;

  // Same policy as registration (shared from password.rules.ts).
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password!: string;
}
