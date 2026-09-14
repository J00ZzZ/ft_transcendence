// Bot ids are `bot-<color>`, owned here for the backend; the engine keeps its own
// copy in socket/auth.ts. See docs/backend/backend-database-schema-system.md (Bots).
export const BOT_PREFIX = 'bot-';

export function isBotUserId(userId: string | undefined | null): boolean {
  return !!userId && userId.startsWith(BOT_PREFIX);
}
