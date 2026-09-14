import type { CSSProperties, MouseEvent } from 'react';

const REST_BORDER = 'rgba(0, 240, 255, 0.3)';
const HOVER_BORDER = 'var(--accent-cyan)';
const HOVER_GLOW = '0 0 14px rgba(0, 240, 255, 0.35)';

export function railButtonStyle(active: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ...(active
      ? {
          background: 'rgba(255, 0, 127, 0.2)',
          border: '1.5px solid #ff007f',
          boxShadow: '0 0 16px rgba(255, 0, 127, 0.4)',
        }
      : {
          background: 'rgba(255, 255, 255, 0.04)',
          border: `1px solid ${REST_BORDER}`,
          boxShadow: 'none',
        }),
  };
}

type RestEdge = { borderColor: string; boxShadow: string };

export function railHoverHandlers(
  active: boolean,
  rest: RestEdge = { borderColor: REST_BORDER, boxShadow: 'none' },
) {
  return {
    onMouseEnter: (e: MouseEvent<HTMLButtonElement>) => {
      if (active) return;
      e.currentTarget.style.borderColor = HOVER_BORDER;
      e.currentTarget.style.boxShadow = HOVER_GLOW;
    },
    onMouseLeave: (e: MouseEvent<HTMLButtonElement>) => {
      if (active) return;
      e.currentTarget.style.borderColor = rest.borderColor;
      e.currentTarget.style.boxShadow = rest.boxShadow;
    },
  };
}
