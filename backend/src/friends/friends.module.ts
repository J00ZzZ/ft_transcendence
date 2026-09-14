import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { PrismaService } from '../prisma.service';
import { PresenceModule } from '../presence/presence.module';
import { MatchModule } from '../match/match.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PresenceModule, MatchModule, NotificationModule],
  controllers: [FriendsController],
  providers: [FriendsService, PrismaService],
  exports: [FriendsService],
})
export class FriendsModule {}
