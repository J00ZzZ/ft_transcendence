import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Shell } from './components/Shell'
import { Friends } from './pages/Friends'
import { Game } from './pages/Game'
import { Home } from './pages/Home'
import { Leaderboard } from './pages/Leaderboard'
import { Lobby } from './pages/Lobby'
import { LudoLobby } from './pages/LudoLobby'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Profile } from './pages/Profile'
import { TwoFactor } from './pages/TwoFactor'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { LegalPage } from './pages/LegalPage'
import { navigate, useRoute } from './router'
import { AppProvider, useApp } from './store'
import { NotificationsProvider, useNotifications } from './hooks/useNotifications'
import { NotificationToasts } from './components/NotificationToast'

/** Screens that render inside the app shell (rail + header). */
const SHELL_ROUTES: Record<string, () => ReactNode> = {}

/** Full-bleed screens (no shell). */
const FULL_ROUTES: Record<string, () => ReactNode> = {
  '/home': () => <Home />,
  '/leaderboard': () => <Leaderboard />,
  '/friends': () => <Friends />,
  '/profile': () => <Profile />,
  '/login': () => <Login />,
  '/signup': () => <Signup />,
  '/2fa': () => <TwoFactor />,
  '/forgot-password': () => <ForgotPassword />,
  '/reset-password': () => <ResetPassword />,
  '/gamelobby': () => <LudoLobby />,
  '/gamelobby/table': () => <Lobby />,	
  '/game': () => <Game />,
  '/privacy': () => <LegalPage initialDoc="privacy" />,
  '/terms': () => <LegalPage initialDoc="terms" />,
  // '/results': () => <Results />,
}

/** Public routes, can be reached wihout a session */
const PUBLIC_ROUTES = new Set([
  '/login',
  '/signup',
  '/2fa',
  '/forgot-password',
  '/reset-password',
  '/privacy',
  '/terms',
])

function Screen() {
  const { path, query } = useRoute()
  const { user, authReady } = useApp()
  const { toasts, dismissToast } = useNotifications()
  const known = path in SHELL_ROUTES || path in FULL_ROUTES
  const isPublic = PUBLIC_ROUTES.has(path)
  // Account-action arrivals via link/redirect: a result notice (verified /
  // reset / error) or a one-time token (a reset or 2FA link). These belong to a
  // *specific account action*, not the logged-in session, so a logged-in user
  // must still see them instead of being bounced to /home — e.g. verifying (or
  // resetting) account B while account A happens to be logged in in this browser.
  const hasNotice = !!(
    query.get('verified') ||
    query.get('reset') ||
    query.get('error') ||
    query.get('token')
  )

  useEffect(() => {
    // Wait for the /me session check. Else, a refresh while logged in
    // would bounce to /login before the cookie has been verified
    if (!authReady) return
    if (!known) navigate(user ? '/home' : '/login', { replace: true })
    else if (!user && !isPublic) navigate('/login', { replace: true })
    else if (user && isPublic && !hasNotice) navigate('/home', { replace: true })
  }, [authReady, known, user, isPublic, hasNotice])

  if (!authReady) return null
  if (!known || (!user && !isPublic) || (user && isPublic && !hasNotice)) return null

  return (
    <>
      {path in SHELL_ROUTES ? <Shell>{SHELL_ROUTES[path]()}</Shell> : FULL_ROUTES[path]()}
      {user && <NotificationToasts toasts={toasts} onDismiss={dismissToast} />}
    </>
  )
}

function GlobalNotifications() {
  const { toasts, dismissToast } = useNotifications()
  return <NotificationToasts toasts={toasts} onDismiss={dismissToast} />
}

export default function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('retro_theme') || 'synthwave'
    document.documentElement.setAttribute('data-theme', savedTheme)
    document.body.setAttribute('data-theme', savedTheme)
  }, [])

  return (
    <AppProvider>
      <NotificationsProvider>
        <Screen />
      </NotificationsProvider>
    </AppProvider>
  )
}
