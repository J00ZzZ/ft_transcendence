import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { RetroAuthLayout } from '../components/RetroAuthLayout'
import { navigate, useRoute } from '../router'
import { useApp } from '../store'
import '../styles/retrowave.css'
import { RETRO_AUTH_BTN, RETRO_AUTH_BTN_OUTLINE, RETRO_AUTH_DIVIDER, RETRO_AUTH_DIVIDER_LINE, RETRO_AUTH_ERROR, RETRO_AUTH_INPUT, RETRO_AUTH_LABEL, RETRO_AUTH_LINK, RETRO_AUTH_MUTED, RETRO_AUTH_SUBTITLE, RETRO_AUTH_SUCCESS, RETRO_AUTH_TITLE } from '../styles/tw'

export function Login() {
  const { t } = useTranslation()
  const { login } = useApp()
  const { query } = useRoute()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Human-readable text for ?error= codes the backend redirects here with.
  const QUERY_ERRORS: Record<string, string> = {
    'no-verified-email': t('auth.errorNoVerifiedEmail'),
    'invalid-verification-link': t('auth.errorInvalidVerificationLink'),
    'email-in-use': t('auth.errorEmailInUseOAuth'),
    'access_denied': t('auth.errorAccessDenied'),
    'oauth_failed': t('auth.errorOAuthFailed'),
    'add-email-2fa': t('auth.errorAddEmail2FA'),
  }

  // One-shot notices arriving via redirect (email verified / password reset / OAuth errors).
  const queryError = QUERY_ERRORS[query.get('error') ?? '']
  const justVerified = query.get('verified') === '1'
  const justReset = query.get('reset') === '1'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    const result = await login(identifier, password)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else if (result.pendingToken) navigate(`/2fa?token=${result.pendingToken}`)
    else navigate('/home') // 2FA off — session already established, skip the code page
  }

  return (
    <RetroAuthLayout tag={t('auth.loginTag')}>
      <form
        onSubmit={onSubmit}
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <div>
          <div className={RETRO_AUTH_TITLE}>
            RETROLUDO
          </div>
          <div className={RETRO_AUTH_SUBTITLE}>
            {t('authExtra.brandTagline')}
          </div>
        </div>
        {justVerified && (
          <div className={RETRO_AUTH_SUCCESS}>
            {t('auth.emailVerifiedNotice')}
          </div>
        )}
        {justReset && (
          <div className={RETRO_AUTH_SUCCESS}>
            {t('auth.passwordUpdatedNotice')}
          </div>
        )}
        {queryError && (
          <div className={RETRO_AUTH_ERROR}>{queryError}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div className={RETRO_AUTH_LABEL}>{t('auth.identifierLabel')}</div>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t('auth.identifierPlaceholder')}
            autoComplete="username"
            className={RETRO_AUTH_INPUT}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div className={RETRO_AUTH_LABEL}>{t('auth.passwordLabel')}</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className={RETRO_AUTH_INPUT}
          />
        </div>
        {error && (
          <div className={RETRO_AUTH_ERROR}>{error}</div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            fontSize: '13px',
          }}
        >
          <a onClick={() => navigate('/forgot-password')} className={RETRO_AUTH_LINK} style={{ fontSize: '12.5px' }}>
            {t('auth.forgotPasswordLink')}
          </a>
        </div>
        <button type="submit" disabled={submitting} className={RETRO_AUTH_BTN}>
          {submitting ? t('auth.enteringBtn') : t('auth.signInBtn')}
        </button>

        {/* OR divider */}
        <div className={RETRO_AUTH_DIVIDER}>
          <span className={RETRO_AUTH_DIVIDER_LINE} />
          {t('auth.orContinueWith')}
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
          {t('auth.newToTable')}{' '}
          <a onClick={() => navigate('/signup')} className={RETRO_AUTH_LINK}>
            {t('auth.createAccountLink')}
          </a>
        </div>
      </form>
    </RetroAuthLayout>
  )
}
