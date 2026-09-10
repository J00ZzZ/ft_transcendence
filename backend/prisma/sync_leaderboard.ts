import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

loadEnv({ path: join(__dirname, '..', '..', '.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🔄 Synchronizing database users to Redis & Leaderboard Snapshot...');

  const users = await prisma.user.findMany({
    orderBy: { rating: 'desc' },
  });

  console.log(`Found ${users.length} total users in PostgreSQL database.`);

  // Connect to Redis
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6479', 10);
  const redisPassword = process.env.REDIS_PASSWORD || 'password123';

  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
  });

  // Clear Redis leaderboards
  await redis.del('leaderboard:global', 'leaderboard:ranked', 'leaderboard:casual');

  // Populate Redis sorted sets
  for (const u of users) {
    await redis.zadd('leaderboard:global', u.rating, u.id);
    await redis.zadd('leaderboard:ranked', u.rating, u.id);
    await redis.zadd('leaderboard:casual', u.rating, u.id);
  }

  const count = await redis.zcard('leaderboard:global');
  console.log(`✅ Successfully added ${count} users to Redis leaderboard:global!`);

  // Also refresh snapshot
  await prisma.leaderboardSnapshot.deleteMany({});
  await prisma.leaderboardSnapshot.createMany({
    data: users.map((u, i) => ({
      id: randomUUID(),
      mode: 'global',
      userId: u.id,
      username: u.username,
      rating: u.rating,
      rank: i + 1,
    })),
  });

  console.log(`✅ Refreshed PostgreSQL LeaderboardSnapshot table with ${users.length} rows.`);

  await redis.quit();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Leaderboard sync failed:', err);
  process.exit(1);
});
