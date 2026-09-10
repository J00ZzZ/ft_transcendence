import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { navigate } from '../router'
import { LANGUAGES, useApp, type Lang } from '../store'
import { avatarBlue, sectionLabel } from '../theme'
import { UserAvatar } from './UserAvatar'

/**
 * CJK glyphs fill the em box while Latin sits at roughly half of it, so the same
 * px value renders the Latin labels optically larger. Size Latin down to match 中文.
 */
const CJK = /[　-鿿豈-﫿]/
const labelSize = (label: string) => (CJK.test(label) ? '13.5px' : '12.5px')


/** Header avatar that opens a panel for language + two-factor auth. */
export function AccountMenu() {
  const { t } = useTranslation()
  const { user, logout, lang, setLang, twoFactor, toggleTwoFactor } = useApp()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const name = user?.displayName ?? user?.username ?? 'You'

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function onSignOut() {
    setOpen(false)
    await logout()
    navigate('/login')
  }

  const pickLang = (code: Lang) => {
    setLang(code)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
        style={{
          cursor: 'pointer',
          borderRadius: '50%',
          boxShadow: open ? '0 0 0 2px #f0d18a' : '0 0 0 2px #f0d18a55',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          flex: 'none',
        }}
      >
        <UserAvatar
          username={user?.username || ''}
          avatarStyle={user?.avatarStyle}
          hasAvatarPhoto={user?.hasAvatarPhoto ?? false}
          size={40}
          fallbackStyle={avatarBlue(40, 14)}
        />
      </div>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            zIndex: 50,
            width: 246,
            padding: 8,
            borderRadius: 14,
            background: 'linear-gradient(180deg,#241b13,#1a130d)',
            border: '1px solid #4a3826',
            boxShadow: '0 24px 48px -18px rgba(0,0,0,.9)',
          }}
        >
          <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid #2a2015' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#f0e2c4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </div>
            <div style={{ color: '#a99a83', fontSize: 12 }}>{t('accountMenu.signedIn')}</div>
          </div>

          <div style={{ ...sectionLabel, padding: '12px 10px 4px' }}>{t('accountMenu.language')}</div>
          {LANGUAGES.map((l) => {
            const active = l.code === lang
            return (
              <div
                key={l.code}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pickLang(l.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 9,
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: active ? '#f4e9cf' : '#c9bda3',
                  background: active ? 'linear-gradient(180deg,#2e2317,#241a0f)' : 'transparent',
                  border: '1px solid ' + (active ? '#4a3826' : 'transparent'),
                }}
              >
                <span style={{ fontSize: 15 }}>{l.flag}</span>
                <span style={{ flex: 1, fontSize: labelSize(l.label) }}>{l.label}</span>
                {active && <span style={{ color: '#f0c24e', fontSize: '13.5px', fontWeight: 800 }}>✓</span>}
              </div>
            )
          })}

          <div style={{ ...sectionLabel, padding: '12px 10px 4px', borderTop: '1px solid #2a2015', marginTop: 6 }}>
            {t('accountMenu.security')}
          </div>
          <div
            role="menuitemcheckbox"
            aria-checked={twoFactor}
            onClick={toggleTwoFactor}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 10px',
              borderRadius: 9,
              cursor: 'pointer',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#f0e2c4' }}>{t('accountMenu.twoFactorAuth')}</div>
              <div style={{ color: '#a99a83', fontSize: '11.5px' }}>
                {twoFactor ? t('accountMenu.codeRequired') : t('accountMenu.passwordOnly')}
              </div>
            </div>
            <div
              aria-hidden
              style={{
                flex: 'none',
                width: 42,
                height: 24,
                borderRadius: 999,
                padding: 2,
                display: 'flex',
                justifyContent: twoFactor ? 'flex-end' : 'flex-start',
                background: twoFactor ? 'linear-gradient(180deg,#5fd08a,#2c8a53)' : '#20180f',
                border: '1px solid ' + (twoFactor ? '#2c8a53' : '#4a3826'),
                transition: 'background .14s',
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: twoFactor ? '#0d1b12' : '#a99a83',
                }}
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #2a2015', marginTop: 6, paddingTop: 6 }}>
            <div
              role="menuitem"
              onClick={onSignOut}
              style={{ padding: '9px 10px', borderRadius: 9, cursor: 'pointer', fontSize: '13.5px', fontWeight: 700, color: '#e8918a' }}
            >
              {t('accountMenu.signOut')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
