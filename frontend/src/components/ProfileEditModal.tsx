import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { getApi, patchApi } from '../api'
import { passwordError } from '../validatePassword'
import { useApp } from '../store'
import { DeleteAccountModal } from './DeleteAccountModal'
import { RETRO_BTN } from '../styles/tw'

const OTP = { '42': '/forty_two.png', github: '/github.png', google: '/google.png' } as const
const PROVIDERS = ['google', 'github', '42'] as const

type Providers = string[]
interface ProfileResp {
  user?: { id: string; username: string; displayName?: string; email?: string | null; providers?: Providers; hasPassword?: boolean }
  emailVerificationSent?: boolean
  oauthRedirectUrl?: string
  message?: string
}

function fieldLabel(style: CSSProperties): CSSProperties {
  return { ...style, display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-display)' }
}
function inputStyle(): CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box', padding: '7px 9px', marginBottom: 12, borderRadius: 4,
    background: 'rgba(0,0,0,0.4)', color: 'var(--text-main)',
    border: '1px solid var(--border-color)', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
  }
}

export function ProfileEditModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { user, setUser } = useApp()

  const [username] = useState(user?.username ?? '')
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [email, setEmail] = useState('')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [providers, setProviders] = useState<Providers>([])
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  // Load the full profile (linked providers + email) on open.
  useEffect(() => {
    let cancelled = false
    getApi<ProfileResp>('/api/auth/profile').catch(() => null).then((data) => {
      if (cancelled || !data?.user) return
      setDisplayName(data.user.displayName ?? data.user.username ?? '')
      setEmail(data.user.email ?? '')
      setProviders(data.user.providers ?? [])
      setHasPassword(!!data.user.hasPassword)
      setTwoFactorEnabled(!!(data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled)
    })
    return () => { cancelled = true }
  }, [])

  const handleSave = async () => {
    setBusy(true); setError(''); setNotice('')
    const body: Record<string, unknown> = {}
    if (displayName.trim() && displayName.trim() !== (user?.displayName ?? user?.username)) body.displayName = displayName.trim()
    if (email.trim()) body.email = email.trim()
    body.twoFactorEnabled = twoFactorEnabled
    const isPasswordChange = !!(currentPassword || newPassword || confirmPassword)
    if (isPasswordChange) {
      const pwErr = newPassword ? passwordError(newPassword) : t('profileEdit.newPasswordRequired')
      if (pwErr) { setBusy(false); setError(pwErr); return }
      if (newPassword !== confirmPassword) {
        setBusy(false); setError(t('profileEdit.passwordMismatch')); return
      }
    }
    try {
      const data = await patchApi<ProfileResp>('/api/auth/profile', body)
      if (data?.user) {
        setUser(data.user as never)
        setProviders(data.user.providers ?? [])
        setTwoFactorEnabled(!!(data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled)
        if (!data.user.email && email.trim()) setEmail(email.trim())
      }
      if (data?.emailVerificationSent) setNotice(t('profileEdit.emailVerificationSent'))
      if (data?.message) setNotice(data.message)
      if (isPasswordChange) {
        const pwBody: Record<string, string> = { newPassword }
        if (hasPassword) pwBody.currentPassword = currentPassword
        const pwResp = await patchApi<{ message?: string }>('/api/auth/profile/password', pwBody)
        if (pwResp?.message) setNotice(pwResp.message)
        // Password change keeps the CURRENT session alive — stay signed in.
        setHasPassword(true)
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
        return
      }
      // Clear password fields after a successful non-password save.
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? ''
      setError(/last sign-in|keep at least one/i.test(msg) ? t('profileEdit.lastMethod')
        : /linked to another user/i.test(msg) ? t('profileEdit.providerTaken')
        : /email.*(?:already|registered)/i.test(msg) ? t('profileEdit.emailTaken')
        : /display name.*(?:taken|already)/i.test(msg) ? t('profileEdit.displayNameTaken')
        : t('profileEdit.genericError'))
    } finally {
      setBusy(false)
    }
  }

  const addOAuth = (provider: string) => {
    // Open the provider login directly in a new tab (same as the login page).
    // The oauth-link `state` is auto-signed by the guard from the session cookie.
    window.open(`/api/auth/${provider}`, '_blank')
  }

  const removeOAuth = async (provider: string) => {
    setBusy(true); setError('')
    try {
      await patchApi<ProfileResp>('/api/auth/profile', { oauthToRemove: provider })
      setProviders((p) => p.filter((x) => x !== provider))
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? ''
      setError(/last sign-in|keep at least one/i.test(msg) ? t('profileEdit.lastMethod') : t('profileEdit.genericError'))
    } finally { setBusy(false) }
  }

  const overlay: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(5,2,18,0.72)', backdropFilter: 'blur(4px)',
  }
  const panel: CSSProperties = {
    width: 'min(92vw, 560px)', maxHeight: '88vh', overflowY: 'auto', borderRadius: 10,
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    boxShadow: 'var(--box-shadow)', padding: 22,
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 900, fontSize: '0.95rem', fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>
            {t('profileEdit.title')}
          </div>
          <button className={RETRO_BTN} onClick={onClose} style={{ padding: '3px 9px', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
            {t('profileEdit.close')}
          </button>
        </div>

        <label style={fieldLabel({ color: 'var(--text-muted)' })}>{t('profileEdit.username')}</label>
        <input style={{ ...inputStyle(), background: 'rgba(0,0,0,0.25)', color: 'var(--text-muted)', cursor: 'not-allowed' }} value={username} readOnly disabled />
        <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginBottom: 12 }}>
          {t('profileEdit.usernameLocked')}
        </div>

        <label style={fieldLabel({ color: 'var(--text-muted)' })}>{t('profileEdit.displayName')}</label>
        <input style={inputStyle()} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('profileEdit.displayNamePlaceholder')} />

        <label style={fieldLabel({ color: 'var(--text-muted)' })}>{t('profileEdit.email')}</label>
        <input style={inputStyle()} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('profileEdit.emailPlaceholder')} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>{t('profileEdit.twoFactor')}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{t('profileEdit.twoFactorDesc')}</div>
          </div>
          <button
            className={RETRO_BTN}
            onClick={() => setTwoFactorEnabled((v) => !v)}
            style={{ padding: '2px 9px', fontSize: '0.66rem', color: 'var(--accent-cyan)' }}
          >
            {twoFactorEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', margin: '10px 0', paddingTop: 10 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-main)', marginBottom: 8 }}>
            {hasPassword ? t('profileEdit.password') : t('profileEdit.passwordSet')}
          </div>
          {hasPassword && (
            <>
            <label style={fieldLabel({ color: 'var(--text-muted)' })}>{t('profileEdit.currentPassword')}</label>
            <input style={inputStyle()} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t('profileEdit.currentPasswordPlaceholder')} />
            </>
          )}
          <label style={fieldLabel({ color: 'var(--text-muted)' })}>{t('profileEdit.newPassword')}</label>
          <input style={inputStyle()} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('profileEdit.newPasswordPlaceholder')} autoComplete="new-password" />
          <label style={fieldLabel({ color: 'var(--text-muted)' })}>{t('profileEdit.confirmPassword')}</label>
          <input style={inputStyle()} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t('profileEdit.confirmPasswordPlaceholder')} autoComplete="new-password" />
          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginBottom: 12 }}>
            {t('profileEdit.passwordHint')}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', margin: '10px 0', paddingTop: 10 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-main)', marginBottom: 8 }}>
            {t('profileEdit.oauthMethods')}
          </div>
          {PROVIDERS.map((p) => {
            const linked = providers.includes(p)
            return (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <img src={OTP[p]} alt={p} style={{ width: 18, height: 18 }} />
                <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-main)', fontFamily: 'var(--font-display)', textTransform: 'capitalize' }}>
                  {p === '42' ? '42' : p}
                </span>
                <span style={{ fontSize: '0.62rem', color: linked ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                  {linked ? t('profileEdit.linked') : t('profileEdit.notLinked')}
                </span>
                <button
                  className={RETRO_BTN}
                  disabled={busy}
                  onClick={() => (linked ? removeOAuth(p) : addOAuth(p))}
                  style={{ padding: '2px 8px', fontSize: '0.62rem', color: linked ? '#ff0055' : 'var(--accent-cyan)' }}
                >
                  {linked ? t('profileEdit.remove') : t('profileEdit.add')}
                </button>
              </div>
            )
          })}
        </div>

        {notice && <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', margin: '4px 0 8px' }}>{notice}</div>}
        {error && <div style={{ fontSize: '0.7rem', color: '#ff0055', margin: '4px 0 8px' }}>{error}</div>}

        <button
          className={RETRO_BTN}
          disabled={busy}
          onClick={handleSave}
          style={{ width: '100%', padding: '10px', fontSize: '0.8rem', fontWeight: 900 }}
        >
          {busy ? t('profileEdit.saving') : t('profileEdit.save')}
        </button>

        <button
          className={RETRO_BTN}
          disabled={busy}
          onClick={() => setDeleteOpen(true)}
          style={{ width: '100%', padding: '10px', fontSize: '0.8rem', fontWeight: 900, color: 'var(--accent-cyan)', marginTop: 8 }}
        >
          {t('profileEdit.deleteAccountBtn')}
        </button>

        {deleteOpen && <DeleteAccountModal onClose={() => setDeleteOpen(false)} hasPassword={hasPassword} />}
      </div>
    </div>
  )
}