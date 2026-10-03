import { IsUUID } from 'class-validator';

export class InviteFriendDto {
  // Required and UUID-shaped so an empty or malformed body fails validation at
  // the HTTP boundary instead of silently skipping the friendship check in
  // MatchPlayerService.inviteFriendToGame (fail closed).
  @IsUUID()
  friendId!: string;
}
