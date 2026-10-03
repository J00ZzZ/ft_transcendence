import { IsIn } from 'class-validator';

export class LanguageSettingDto {
  // UI language for transactional email (en/fr/ms).
  @IsIn(['en', 'fr', 'ms'])
  language!: string;
}
