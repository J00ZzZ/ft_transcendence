import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { RetroAuthLayout } from '../components/RetroAuthLayout'
import { navigate, useRoute } from '../router'
import { useApp } from '../store'
import { passwordError } from '../validatePassword'
import '../styles/retrowave.css'
import { RETRO_AUTH_BTN, RETRO_AUTH_ERROR, RETRO_AUTH_INPUT, RETRO_AUTH_LABEL, RETRO_AUTH_LINK, RETRO_AUTH_MUTED, RETRO_AUTH_SUBTITLE, RETRO_AUTH_TITLE } from '../styles/tw'

/**
 * Step two of password reset. Reached from the emailed link, which carries
 * ?token=<resetToken>. Collects a new password (validated against the same
 * policy as signup) and, on success, sends the user to /login.
 */
export function ResetPassword() {
  const { t } = useTranslation()
  const { resetPassword } = useApp()
  const { query } = useRoute()
  const token = query.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // A link with no token is unusable — send them to request a fresh one.
  if (!token) {
    return (
      <RetroAuthLayout tag={t('auth.linkProblemTag')}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={RETRO_AUTH_TITLE} style={{ fontSize: 24 }}>
            {t('auth.invalidLinkTitle')}
          </div>
          <div className={RETRO_AUTH_MUTED} style={{ lineHeight: 1.5, fontSize: '14px' }}>
            {t('auth.invalidLinkDesc')}
          </div>
          <div className={RETRO_AUTH_MUTED} style={{ fontSize: '13px' }}>
            <a onClick={() => navigate('/forgot-password')} className={RETRO_AUTH_LINK}>
              {t('auth.requestNewLinkBtn')}
            </a>
          </div>
        </div>
      </RetroAuthLayout>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const pwError = passwordError(password)
    if (pwError) {
      setError(pwError)
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setSubmitting(true)
    setError(null)
    const err = await resetPassword(token, password)
    setSubmitting(false)
    if (err) setError(err)
    else navigate('/login?reset=1')
  }

  return (
    <RetroAuthLayout tag={t('auth.chooseNewPasswordTag')}>
      <form
        onSubmit={onSubmit}
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <div>
          <div className={RETRO_AUTH_TITLE} style={{ fontSize: 24 }}>
            {t('auth.newPasswordTitle')}
          </div>
          <div className={RETRO_AUTH_SUBTITLE}>
            {t('auth.newPasswordDesc')}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div className={RETRO_AUTH_LABEL}>{t('auth.newPasswordLabel')}</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.passwordPlaceholderSignup')}
            autoComplete="new-password"
            autoFocus
            className={RETRO_AUTH_INPUT}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div className={RETRO_AUTH_LABEL}>{t('auth.confirmPasswordLabel')}</div>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={RETRO_AUTH_INPUT}
          />
        </div>
        {error && (
          <div className={RETRO_AUTH_ERROR}>{error}</div>
        )}
        <button type="submit" disabled={submitting} className={RETRO_AUTH_BTN}>
          {submitting ? t('auth.savingBtn') : t('auth.updatePasswordBtn')}
        </button>
      </form>
    </RetroAuthLayout>
  )
}
