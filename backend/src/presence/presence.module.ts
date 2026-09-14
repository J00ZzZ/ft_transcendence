import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';
import { NotificationModule } from '../notification/notification.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [NotificationModule],
  controllers: [PresenceController],
  providers: [PresenceService, PrismaService],
  exports: [PresenceService],
})
export class PresenceModule {}
