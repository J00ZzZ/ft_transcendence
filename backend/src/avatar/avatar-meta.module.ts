import { Module } from '@nestjs/common';
import { AvatarMetaService } from './avatar-meta.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [AvatarMetaService, PrismaService],
  // Exported so UserModule/AuthModule can write the record after their Postgres
  // writes without duplicating the Redis client.
  exports: [AvatarMetaService],
})
export class AvatarMetaModule {}
