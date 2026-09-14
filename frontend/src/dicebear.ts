import { createAvatar } from '@dicebear/core';
import { avataaars, bottts, identicon } from '@dicebear/collection';

// Each @dicebear/collection export is its own Style<Options> type (different
// option keys), so the union can't be passed to the generic createAvatar.
// Resolve to one concrete style and let createAvatar infer that style's type.
type StyleKey = 'avataaars' | 'bottts' | 'identicon';

const isStyleKey = (s: string | null | undefined): s is StyleKey =>
  s === 'avataaars' || s === 'bottts' || s === 'identicon';

export function dicebearAvatar(seed: string, style?: string | null): string {
  const key: StyleKey = isStyleKey(style) ? style : 'bottts';
  const options = { seed };
  switch (key) {
    case 'avataaars':
      return createAvatar(avataaars, options).toDataUri();
    case 'identicon':
      return createAvatar(identicon, options).toDataUri();
    default:
      return createAvatar(bottts, options).toDataUri();
  }
}
