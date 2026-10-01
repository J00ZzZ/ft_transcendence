import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  // Address to resend a signup verification link to. The response is identical
  // whether or not this address needs verification (no account enumeration).
  @IsEmail()
  email!: string;
}
