import { IsBoolean } from 'class-validator';

export class TwoFactorSettingDto {
  // true = require an email code at every login; false = skip it.
  @IsBoolean()
  enabled!: boolean;
}
