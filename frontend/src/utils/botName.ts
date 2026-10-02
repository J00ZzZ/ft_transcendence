const COLOR_KEYS = {
  red: 'lobby.colorRed',
  green: 'lobby.colorGreen',
  yellow: 'lobby.colorYellow',
  blue: 'lobby.colorBlue',
} as const;

// Engine bot ids, optionally carrying the assistant name the lobby gave that
// seat as a trailing "(Name)": "bot-red (Siri)". Identity is the `bot-<color>`
// stem, so only the color word is localized; the name is kept unchanged.
const BOT_ID = /^bot-(red|green|yellow|blue)(?:\s*\(([^()]*)\))?$/i;

/**
 * `bot-<color>` engine ids to a localized "bot-<translated color>", keeping any
 * "(assistant)" suffix: "bot-red (Siri)" -> "bot-rouge (Siri)". Any other
 * string is returned unchanged.
 */
export function localizedBotName(
  t: (key: string, options?: Record<string, unknown>) => string,
  raw?: string,
): string {
  if (!raw) return raw ?? '';
  const m = raw.match(BOT_ID);
  if (!m) return raw;
  const color = m[1].toLowerCase() as keyof typeof COLOR_KEYS;
  const label = `${t('common.bot').toLowerCase()}-${t(COLOR_KEYS[color]).toLowerCase()}`;
  const name = m[2]?.trim();
  return name ? `${label} (${name})` : label;
}
