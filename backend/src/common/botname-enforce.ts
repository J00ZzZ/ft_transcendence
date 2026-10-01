// Bot ids are `bot-<color>`, owned here for the backend; the engine keeps its own
// copy in socket/auth.ts.
export const BOT_PREFIX = 'bot-';

export function isBotUserId(userId: string | undefined | null): boolean {
  return !!userId && userId.startsWith(BOT_PREFIX);
}

// A human (display) name may not masquerade as a bot: reserve the `bot` stem
// followed by a separator (`bot-`, `bot `, `bot_`), case-insensitive.
export function isReservedBotName(name: string): boolean {
  return /^bot[-\s_]/i.test(name.trim());
}
