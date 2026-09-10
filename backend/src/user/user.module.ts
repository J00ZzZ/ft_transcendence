import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaService } from '../prisma.service';
import { PresenceModule } from '../presence/presence.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PresenceModule, NotificationModule],
  controllers: [UserController],
  providers: [UserService, PrismaService],
  exports: [UserService],
})
export class UserModule {}
