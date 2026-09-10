/**
 * Bot identity, in one place.
 *
 * AI seats are persisted as real User rows (ids "bot-red", "bot-green", ...)
 * because GameParticipant.user_id is an FK to User.id — see the upsert in
 * match.postgame.service.ts. That means "is this a bot?" is a question the
 * match, achievement and leaderboard code all have to ask, and every copy of
 * the answer is a chance for them to disagree.
 */
export const BOT_PREFIX = 'bot-';

export function isBotUserId(userId: string | undefined | null): boolean {
  return !!userId && userId.startsWith(BOT_PREFIX);
}
