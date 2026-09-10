import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { RetroAuthLayout, NeonCheck } from '../components/RetroAuthLayout'
import { navigate } from '../router'
import { useApp } from '../store'
import { passwordError } from '../validatePassword'
import '../styles/retrowave.css'
import { RETRO_AUTH_BTN, RETRO_AUTH_BTN_OUTLINE, RETRO_AUTH_DIVIDER, RETRO_AUTH_DIVIDER_LINE, RETRO_AUTH_ERROR, RETRO_AUTH_INPUT, RETRO_AUTH_LABEL, RETRO_AUTH_LINK, RETRO_AUTH_MUTED, RETRO_AUTH_SUBTITLE, RETRO_AUTH_TITLE } from '../styles/tw'

export function Signup() {
  const { t } = useTranslation()
  const { register } = useApp()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    // Mirror the backend rule (RegisterDto) so weak passwords fail instantly
    // rather than round-tripping to a 400. The server still re-checks.
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
    const err = await register(username, password, email.trim())
    setSubmitting(false)
    if (err) setError(err)
    else setSent(true) // no session yet — the account activates via the emailed link
  }

  if (sent) {
    return (
      <RetroAuthLayout tag={t('auth.oneMoreStep')}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={RETRO_AUTH_TITLE} style={{ fontSize: 24 }}>
            {t('auth.checkInboxTitle')}
          </div>
          <div className={RETRO_AUTH_MUTED} style={{ lineHeight: 1.5, fontSize: '14px' }}>
            {t('auth.verificationSentPrefix')}{' '}
            <b style={{ color: '#00f0ff' }}>{email}</b>.{' '}
            {t('auth.verificationSentSuffix')}
          </div>
          <div className={RETRO_AUTH_MUTED} style={{ fontSize: '13px' }}>
            {t('auth.doneVerifying')}{' '}
            <a onClick={() => navigate('/login')} className={RETRO_AUTH_LINK}>
              {t('auth.signInLink')}
            </a>
          </div>
        </div>
      </RetroAuthLayout>
    )
  }

  return (
    <RetroAuthLayout tag={t('auth.signupTag')}>
      <form
        onSubmit={onSubmit}
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div>
          <div className={RETRO_AUTH_TITLE} style={{ fontSize: 24 }}>
            {t('auth.createSeatTitle')}
          </div>
          <div className={RETRO_AUTH_SUBTITLE}>
            {t('auth.claimSeatDesc')}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className={RETRO_AUTH_LABEL}>{t('auth.usernameLabel')}</div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('auth.usernamePlaceholder')}
            autoComplete="username"
            className={RETRO_AUTH_INPUT}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className={RETRO_AUTH_LABEL}>{t('auth.emailLabel')}</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholderSignup')}
            autoComplete="email"
            required
            className={RETRO_AUTH_INPUT}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className={RETRO_AUTH_LABEL}>{t('auth.passwordLabel')}</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholderSignup')}
              autoComplete="new-password"
              className={RETRO_AUTH_INPUT}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className={RETRO_AUTH_LABEL}>{t('auth.confirmLabel')}</div>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className={RETRO_AUTH_INPUT}
            />
          </div>
        </div>
        {error && (
          <div className={RETRO_AUTH_ERROR}>{error}</div>
        )}
        <label
          className={RETRO_AUTH_MUTED}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 9,
            cursor: 'pointer',
            lineHeight: 1.4,
          }}
        >
          <NeonCheck offsetTop />
          {t('auth.agreeTerms')}
        </label>
        <button type="submit" disabled={submitting} className={RETRO_AUTH_BTN}>
          {submitting ? t('auth.creatingBtn') : t('auth.createAccountBtn')}
        </button>

        {/* OR divider */}
        <div className={RETRO_AUTH_DIVIDER}>
          <span className={RETRO_AUTH_DIVIDER_LINE} />
          {t('auth.orSignUpWith')}
          <span className={RETRO_AUTH_DIVIDER_LINE} />
        </div>

        {/* OAuth buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { name: '42', icon: '/forty_two.png', path: '/api/auth/42' },
            { name: 'GitHub', icon: '/github.png', path: '/api/auth/github' },
            { name: 'Google', icon: '/google.png', path: '/api/auth/google' },
          ].map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => { window.location.href = p.path }}
              className={RETRO_AUTH_BTN_OUTLINE}
            >
              <img src={p.icon} alt={p.name} style={{ width: 18, height: 18, objectFit: 'contain' }} />
              {p.name}
            </button>
          ))}
        </div>

        <div className={RETRO_AUTH_MUTED} style={{ textAlign: 'center' }}>
          {t('auth.alreadyHaveSeat')}{' '}
          <a onClick={() => navigate('/login')} className={RETRO_AUTH_LINK}>
            {t('auth.signInLink')}
          </a>
        </div>
      </form>
    </RetroAuthLayout>
  )
}
