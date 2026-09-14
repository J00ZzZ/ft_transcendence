import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  // Where to send the reset link. The response is identical whether or not
  // this address is registered, so nothing here reveals account existence.
  @IsEmail()
  email!: string;
}
