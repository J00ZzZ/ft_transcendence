import type { PlayerColor } from '../game/types';

const COLOR_KEYS = {
  red: 'lobby.colorRed',
  green: 'lobby.colorGreen',
  yellow: 'lobby.colorYellow',
  blue: 'lobby.colorBlue',
} as const;

/** `PlayerColor` to its localized colour word through the shared `lobby.color*` keys:
 *  `red` -> `Rouge` in French, `Merah` in Malay. A label shown in all caps upper-cases
 *  the result. */
export function localizedColor(
  t: (key: string, options?: Record<string, unknown>) => string,
  color: PlayerColor,
): string {
  return t(COLOR_KEYS[color]);
}

// Engine bot ids, optionally carrying the assistant name the lobby gave that
// seat as a trailing "(Name)": "bot-red (Siri)". Identity is the `bot-<color>`
// stem, so only the color word is localized; the name is kept unchanged.
const BOT_ID = /^bot-(red|green|yellow|blue)(?:\s*\(([^()]*)\))?$/i;

/** `bot-<color>` engine ids to a localized "bot-<translated color>", keeping any "(assistant)"
 *  suffix: "bot-red (Siri)" -> "bot-rouge (Siri)". Every other string is returned unchanged. */
export function localizedBotName(
  t: (key: string, options?: Record<string, unknown>) => string,
  raw?: string,
): string {
  if (!raw) return raw ?? '';
  const m = raw.match(BOT_ID);
  if (!m) return raw;
  const color = m[1].toLowerCase() as keyof typeof COLOR_KEYS;
  const label = `${t('common.bot').toLowerCase()}-${t(COLOR_KEYS[color]).toLowerCase()}`;
  // Group 2 exists only when the "(Name)" suffix matched, so it is undefined at
  // runtime although the RegExpMatchArray type reports `string`.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const name = m[2]?.trim();
  return name ? `${label} (${name})` : label;
}

/** Locale-independent DiceBear seed for a seat. A bot label seeds from the assistant name it
 *  carries (`bot-<color> (<assistant>)` -> `<assistant>`), so one bot generates one avatar
 *  on every screen. See docs/frontend/frontend-i18n-utilities-system.md. */
export function avatarSeed(name?: string): string {
  const m = (name ?? '').match(BOT_ID);
  if (!m) return name ?? '';
  // Group 2 exists only when the "(Name)" suffix matched (see localizedBotName above).
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return m[2]?.trim() || m[0];
}
