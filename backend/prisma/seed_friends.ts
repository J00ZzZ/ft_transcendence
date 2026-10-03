import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pairKey } from '../src/friends/friendship-pair';

loadEnv({ path: join(__dirname, '..', '..', '.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

// Friendship seed script: clears all friendships, then links every user to
// up to 8 others (accepted, both directions) and guarantees the two target
// accounts 10+ friends. Run manually with ts-node.
async function main() {
  console.log('♟ Seeding rich allied friendships roster...');

  const allUsers = await prisma.user.findMany();
  console.log(`Found ${allUsers.length} total users in DB.`);

  const targetUsernames = ['harleyhxng', 'harleynghxedu'];
  const targets = allUsers.filter((u) => targetUsernames.includes(u.username));

  // If targets not found by exact username, take the first 2 users
  const mainUsers = targets.length > 0 ? targets : allUsers.slice(0, 2);

  // Clear existing friendships for all users to ensure fresh pair rows
  await prisma.friendship.deleteMany({});

  const createdFriendships: Array<{
    id: string;
    pairKey: string;
    user1Id: string;
    user2Id: string;
    user1Status: 'accepted';
    user2Status: 'accepted';
    user1StatusAt: Date;
    user2StatusAt: Date;
  }> = [];
  const addedPairs = new Set<string>();

  const addFriendship = (a: string, b: string) => {
    const key = pairKey(a, b);
    if (addedPairs.has(key)) return;
    const at = new Date();
    createdFriendships.push({
      id: randomUUID(),
      pairKey: key,
      user1Id: a,
      user2Id: b,
      user1Status: 'accepted',
      user2Status: 'accepted',
      user1StatusAt: at,
      user2StatusAt: at,
    });
    addedPairs.add(key);
  };

  for (const mainUser of allUsers) {
    // Select 6-10 other users as friends
    const otherUsers = allUsers.filter((u) => u.id !== mainUser.id);
    const selectedFriends = otherUsers.slice(0, 8);

    for (const friend of selectedFriends) {
      addFriendship(mainUser.id, friend.id);
    }
  }

  // Ensure harleyhxng and harleynghxedu have at least 10 active friends
  for (const target of mainUsers) {
    const others = allUsers.filter((u) => u.id !== target.id);
    for (const other of others.slice(0, 12)) {
      addFriendship(target.id, other.id);
    }
  }

  await prisma.friendship.createMany({
    data: createdFriendships,
  });

  console.log(
    `✅ Successfully established ${createdFriendships.length} accepted allied friendships!`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Friend seeding failed:', err);
  process.exit(1);
});
