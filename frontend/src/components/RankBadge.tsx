import React from 'react'
import { useTranslation } from 'react-i18next'
import type { RankTier } from '../utils/ranks'
import { BADGE_MAMEE_AURA, BADGE_MILO_AURA } from '../styles/tw'

interface RankBadgeProps {
  tier: RankTier
  fontSize?: string | number
  padding?: string
  style?: React.CSSProperties
  className?: string
  showCrosshairs?: boolean
  showParticles?: boolean
}

export function RankBadge({
  tier,
  fontSize,
  padding,
  style,
  className = '',
  showCrosshairs = true,
  showParticles = true,
}: RankBadgeProps) {
  const { t } = useTranslation()
  const isMamee = tier.key === 'mamee'
  const isMilo = tier.key === 'milo'
  const isPaddle = tier.key === 'paddle' || tier.key === 'super'
  const isHoney = tier.key === 'honey'
  const isChoki = tier.key === 'choki'

  const tierName = t(`ranks.${tier.key}`, tier.name)

  const tierClass = isMamee
    ? `${BADGE_MAMEE_AURA} relative [z-index:1] [margin:6px_8px_3px] bg-[linear-gradient(180deg,rgba(45,8,20,.96)_0%,rgba(20,3,10,.98)_100%)] text-white [border:1.5px_solid_#ff3d00] [text-shadow:0_0_6px_#ffffff,0_-2px_10px_#ffdd00,0_-4px_18px_#ff3d00,0_-8px_24px_#ff1744] shadow-[0_0_14px_rgba(255,61,0,.9),0_-6px_18px_rgba(255,170,0,.85),0_-14px_28px_rgba(255,23,68,.75),0_-20px_36px_rgba(255,230,0,.5),inset_0_0_12px_rgba(255,170,0,.6),inset_0_-2px_6px_rgba(255,23,68,.7)] [animation:mamee-flame-steady-glow_2.8s_ease-in-out_infinite_alternate]`
    : isMilo
      ? `${BADGE_MILO_AURA} relative [z-index:1] [margin:6px_8px_3px] bg-[linear-gradient(135deg,rgba(38,5,58,.98),rgba(16,2,30,.99))] [border:1.5px_solid_#ff00ff] text-white shadow-[0_0_16px_rgba(189,0,255,.85),0_-5px_20px_rgba(255,0,255,.75),0_-10px_28px_rgba(0,240,255,.5),inset_0_0_12px_rgba(255,0,255,.5)] [text-shadow:0_0_6px_#ffffff,0_0_14px_#ff00ff,0_0_24px_#bd00ff] [animation:milo-plasma-pulse_2.4s_ease-in-out_infinite_alternate]`
      : isPaddle
        ? 'relative overflow-hidden bg-[linear-gradient(135deg,rgba(6,32,54,.98),rgba(2,16,32,.99))] [border:1.5px_solid_#00f0ff] text-white shadow-[0_0_16px_rgba(0,240,255,.8),0_-4px_18px_rgba(255,0,234,.65),0_4px_18px_rgba(255,230,0,.45),inset_0_0_10px_rgba(0,240,255,.45)] [text-shadow:0_0_6px_#ffffff,0_0_14px_#00f0ff,0_0_22px_#ff00ea] [animation:paddle-rainbow-border_2.4s_linear_infinite_alternate]'
        : isHoney
          ? 'relative bg-[linear-gradient(135deg,rgba(38,30,6,.95),rgba(20,15,3,.98))] [border:1.5px_solid_#ffd700] text-white shadow-[0_0_14px_rgba(255,215,0,.65),inset_0_0_8px_rgba(255,215,0,.35)] [text-shadow:0_0_6px_#ffffff,0_0_10px_#ffd700] [animation:honey-starlight-pulse_2.4s_infinite_alternate]'
          : isChoki
            ? 'relative bg-[linear-gradient(135deg,rgba(28,18,10,.95),rgba(16,10,5,.98))] [border:1.5px_solid_#d7a15c] text-white shadow-[0_0_10px_rgba(215,161,92,.5)] [text-shadow:0_0_6px_#ffffff,0_0_8px_#d7a15c]'
            : ''

  const crosshairColor = isMamee
    ? '#ffe600'
    : isMilo
      ? '#ff00ff'
      : isPaddle
        ? '#00f0ff'
        : isHoney
          ? '#ffd700'
          : '#d7a15c'

  return (
    <span
      className={`${tierClass} ${className}`}
      style={{
        position: 'relative',
        fontSize: fontSize ?? (isMamee ? '12px' : '11.5px'),
        padding: padding ?? (isMamee ? '5px 16px' : '4px 14px'),
        fontFamily: 'var(--font-display)',
        fontWeight: 900,
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        lineHeight: 1,
        borderRadius: isMamee ? 6 : 4,
        userSelect: 'none',
        cursor: 'default',
        boxSizing: 'border-box',
        ...style,
      }}
      title={t('ranks.rankTierTooltip', { name: tierName })}
    >
      {/* Floating Animated Ember Particles (MAMEE MONSTER ONLY) */}
      {isMamee && showParticles && (
        <>
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_10%,#ffe600_50%,#ff3d00_100%)] shadow-[0_0_6px_#ffe600,0_0_12px_#ff3d00] [animation:mamee-spark-rise_var(--spark-dur,2s)_infinite_ease-out]"
            style={{
              width: 3,
              height: 3,
              left: '12%',
              top: '2px',
              animationDelay: '0s',
              ['--spark-dur' as string]: '2.2s',
              ['--spark-drift' as string]: '-6px',
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_10%,#ffe600_50%,#ff3d00_100%)] shadow-[0_0_6px_#ffe600,0_0_12px_#ff3d00] [animation:mamee-spark-rise_var(--spark-dur,2s)_infinite_ease-out]"
            style={{
              width: 2.5,
              height: 2.5,
              left: '32%',
              top: '0px',
              animationDelay: '0.5s',
              ['--spark-dur' as string]: '1.9s',
              ['--spark-drift' as string]: '4px',
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_10%,#ffe600_50%,#ff3d00_100%)] shadow-[0_0_6px_#ffe600,0_0_12px_#ff3d00] [animation:mamee-spark-rise_var(--spark-dur,2s)_infinite_ease-out]"
            style={{
              width: 3.5,
              height: 3.5,
              left: '52%',
              top: '1px',
              animationDelay: '1.1s',
              ['--spark-dur' as string]: '2.4s',
              ['--spark-drift' as string]: '-4px',
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_10%,#ffe600_50%,#ff3d00_100%)] shadow-[0_0_6px_#ffe600,0_0_12px_#ff3d00] [animation:mamee-spark-rise_var(--spark-dur,2s)_infinite_ease-out]"
            style={{
              width: 2,
              height: 2,
              left: '72%',
              top: '0px',
              animationDelay: '0.8s',
              ['--spark-dur' as string]: '1.8s',
              ['--spark-drift' as string]: '5px',
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_10%,#ffe600_50%,#ff3d00_100%)] shadow-[0_0_6px_#ffe600,0_0_12px_#ff3d00] [animation:mamee-spark-rise_var(--spark-dur,2s)_infinite_ease-out]"
            style={{
              width: 3,
              height: 3,
              left: '88%',
              top: '2px',
              animationDelay: '1.4s',
              ['--spark-dur' as string]: '2.1s',
              ['--spark-drift' as string]: '-5px',
            }}
          />
        </>
      )}

      {/* Floating Animated Plasma Particles (MILO DINOSAUR ONLY) */}
      {isMilo && showParticles && (
        <>
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_15%,#00f0ff_50%,#ff00ff_85%,#bd00ff_100%)] shadow-[0_0_6px_#00f0ff,0_0_12px_#ff00ff] [animation:milo-spark-rise_var(--spark-dur,2.2s)_infinite_ease-out]"
            style={{
              width: 3,
              height: 3,
              left: '14%',
              top: '2px',
              animationDelay: '0s',
              ['--spark-dur' as string]: '2.3s',
              ['--spark-drift' as string]: '-5px',
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_15%,#00f0ff_50%,#ff00ff_85%,#bd00ff_100%)] shadow-[0_0_6px_#00f0ff,0_0_12px_#ff00ff] [animation:milo-spark-rise_var(--spark-dur,2.2s)_infinite_ease-out]"
            style={{
              width: 2.5,
              height: 2.5,
              left: '35%',
              top: '1px',
              animationDelay: '0.6s',
              ['--spark-dur' as string]: '2.0s',
              ['--spark-drift' as string]: '4px',
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_15%,#00f0ff_50%,#ff00ff_85%,#bd00ff_100%)] shadow-[0_0_6px_#00f0ff,0_0_12px_#ff00ff] [animation:milo-spark-rise_var(--spark-dur,2.2s)_infinite_ease-out]"
            style={{
              width: 3.5,
              height: 3.5,
              left: '54%',
              top: '0px',
              animationDelay: '1.2s',
              ['--spark-dur' as string]: '2.5s',
              ['--spark-drift' as string]: '-4px',
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_15%,#00f0ff_50%,#ff00ff_85%,#bd00ff_100%)] shadow-[0_0_6px_#00f0ff,0_0_12px_#ff00ff] [animation:milo-spark-rise_var(--spark-dur,2.2s)_infinite_ease-out]"
            style={{
              width: 2,
              height: 2,
              left: '74%',
              top: '1px',
              animationDelay: '0.4s',
              ['--spark-dur' as string]: '1.9s',
              ['--spark-drift' as string]: '5px',
            }}
          />
          <span
            className="absolute rounded-full pointer-events-none z-[3] opacity-95 bg-[radial-gradient(circle,#ffffff_15%,#00f0ff_50%,#ff00ff_85%,#bd00ff_100%)] shadow-[0_0_6px_#00f0ff,0_0_12px_#ff00ff] [animation:milo-spark-rise_var(--spark-dur,2.2s)_infinite_ease-out]"
            style={{
              width: 3,
              height: 3,
              left: '90%',
              top: '2px',
              animationDelay: '1.5s',
              ['--spark-dur' as string]: '2.2s',
              ['--spark-drift' as string]: '-6px',
            }}
          />
        </>
      )}

      {/* Subtle Rainbow Prism Sheen (PADDLE POP ONLY) */}
      {isPaddle && showParticles && (
        <span className="absolute top-0 left-[-130%] w-3/4 h-full bg-[linear-gradient(90deg,transparent,rgba(0,240,255,.45)_15%,rgba(255,0,234,.7)_35%,rgba(255,255,255,.95)_50%,rgba(255,230,0,.75)_65%,rgba(0,255,136,.5)_85%,transparent)] [transform:skewX(-24deg)] pointer-events-none [animation:paddle-prism-sweep_2.4s_cubic-bezier(0.2,0.8,0.2,1)_infinite] z-[1]" />
      )}

      {/* Absolute Symmetrical 4-Corner HUD Crosshairs */}
      {showCrosshairs && (
        <>
          <span
            style={{
              position: 'absolute',
              top: 1,
              left: 3,
              fontSize: '0.62rem',
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
              color: crosshairColor,
              opacity: 0.85,
              pointerEvents: 'none',
            }}
          >
            ⌜
          </span>
          <span
            style={{
              position: 'absolute',
              top: 1,
              right: 3,
              fontSize: '0.62rem',
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
              color: crosshairColor,
              opacity: 0.85,
              pointerEvents: 'none',
            }}
          >
            ⌝
          </span>
          <span
            style={{
              position: 'absolute',
              bottom: 1,
              left: 3,
              fontSize: '0.62rem',
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
              color: crosshairColor,
              opacity: 0.85,
              pointerEvents: 'none',
            }}
          >
            ⌞
          </span>
          <span
            style={{
              position: 'absolute',
              bottom: 1,
              right: 3,
              fontSize: '0.62rem',
              lineHeight: 1,
              fontFamily: 'var(--font-mono)',
              color: crosshairColor,
              opacity: 0.85,
              pointerEvents: 'none',
            }}
          >
            ⌟
          </span>
        </>
      )}

      {/* Dead-Centered Text */}
      <span
        style={{
          display: 'inline-block',
          textAlign: 'center',
          width: '100%',
          zIndex: 2,
        }}
      >
        {tierName}
      </span>
    </span>
  )
}
