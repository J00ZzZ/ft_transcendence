import type { ReactNode } from 'react';
import { GRID_BACKGROUND } from '../styles/tw';

/**
 * Full-bleed retrowave auth shell: shared cityscape background plus a glass card.
 */
export function RetroAuthLayout({ tag, children }: { tag?: string; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-main)',
        overflowX: 'hidden',
      }}
    >
      {/* Synthwave cityscape background */}
      <div className={GRID_BACKGROUND} />

      {/* Centered glassmorphism card wrapper */}
      <div
        className="max-h-screen overflow-y-auto"
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          padding: '24px 20px',
          width: '100%',
          maxWidth: 'calc(620px + 2vw)',
          boxSizing: 'border-box',
        }}
      >
        {/* Glass card */}
        <div
          className="w-full max-w-155 rounded-[22px] bg-[rgba(13,2,33,0.78)] px-13 py-12 shadow-[0_0_45px_rgba(0,240,255,0.18),0_0_90px_rgba(255,0,127,0.12),0_28px_70px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl backdrop-saturate-[1.8] [border:1.5px_solid_rgba(0,240,255,0.35)]"
          style={{
            width: '100%',
            maxWidth: 'calc(620px + 2vw)',
            padding: 'calc(3rem + 1vh) 3.25rem',
            boxSizing: 'border-box',
          }}
        >
          {children}
        </div>

        {/* Tag line below card */}
        {tag && (
          <div className="mt-5 [font-family:var(--font-mono)] text-[11.5px] tracking-[0.34em] text-[rgba(0,240,255,0.5)] uppercase">
            {tag}
          </div>
        )}
      </div>
    </div>
  );
}

// Decorative neon checkbox glyph. Signup pairs it with a hidden real input, so
// it takes `checked` plus any focus classes the caller needs.
export function NeonCheck({
  offsetTop,
  checked,
  className,
}: {
  offsetTop?: boolean;
  checked?: boolean;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        width: 16,
        height: 16,
        marginTop: offsetTop ? 1 : undefined,
        flex: 'none',
        borderRadius: 4,
        background: checked
          ? 'linear-gradient(135deg, rgba(0, 240, 255, 0.5), rgba(255, 0, 127, 0.4))'
          : 'transparent',
        border: '1px solid rgba(0, 240, 255, 0.6)',
        display: 'inline-grid',
        placeItems: 'center',
        color: '#ffffff',
        fontSize: 10,
        fontWeight: 900,
        boxShadow: checked ? '0 0 8px rgba(0, 240, 255, 0.4)' : 'none',
      }}
    >
      {checked ? '✓' : ''}
    </span>
  );
}
