import type { ReactNode } from 'react'
import { GRID_BACKGROUND, SYNTHWAVE_SUN, GRID_HORIZON, PERSPECTIVE_GRID } from '../styles/tw'

/**
 * Full-bleed Retrowave auth shell matching Home.tsx background:
 * Animated 3D Synthwave Grid & Sun Background with centered glassmorphism card.
 */
export function RetroAuthLayout({
  tag,
  children,
}: {
  tag?: string
  children: ReactNode
}) {
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
      {/* Animated 3D Synthwave Grid & Sun Background (Identical to Home page) */}
      <div className={GRID_BACKGROUND}>
        <div className={SYNTHWAVE_SUN} />
        <div className={GRID_HORIZON} />
        <div className={PERSPECTIVE_GRID} />
      </div>

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
          className="w-full max-w-155 py-12 px-13 rounded-[22px] bg-[rgba(13,2,33,0.78)] backdrop-blur-xl backdrop-saturate-[1.8] [border:1.5px_solid_rgba(0,240,255,0.35)] shadow-[0_0_45px_rgba(0,240,255,0.18),0_0_90px_rgba(255,0,127,0.12),0_28px_70px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]"
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
  )
}

/** Neon cyan checkbox used by auth forms */
export function NeonCheck({ offsetTop }: { offsetTop?: boolean }) {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        marginTop: offsetTop ? 1 : undefined,
        flex: 'none',
        borderRadius: 4,
        background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.5), rgba(255, 0, 127, 0.4))',
        border: '1px solid rgba(0, 240, 255, 0.6)',
        display: 'inline-grid',
        placeItems: 'center',
        color: '#ffffff',
        fontSize: 10,
        fontWeight: 900,
        boxShadow: '0 0 8px rgba(0, 240, 255, 0.4)',
      }}
    >
      ✓
    </span>
  )
}
