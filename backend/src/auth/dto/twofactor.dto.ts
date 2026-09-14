import { IsString, Length, Matches } from 'class-validator';

export class TwoFactorDto {
  // 32 random bytes hex-encoded, issued by the login/OAuth step.
  @IsString()
  @Length(64, 64)
  pendingToken!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
