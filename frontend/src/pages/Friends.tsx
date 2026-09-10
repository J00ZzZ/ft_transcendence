import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { postApi } from '../api'
import { UserAvatar } from '../components/UserAvatar'
import { RetroNavbar } from '../components/RetroNavbar'
import { RankBadge } from '../components/RankBadge'
import { getRankTier } from '../utils/ranks'
import type { PlayerColor } from '../game/types'
import { navigate } from '../router'
import { useApp } from '../store'
import { STATUS_STYLE, type PresenceStatus } from '../theme'
import { retroAudio } from '../utils/audio'
import '../styles/retrowave.css'
import {
	CRT_SCREEN,
	GRID_BACKGROUND,
	SYNTHWAVE_SUN,
	PERSPECTIVE_GRID,
	GRID_HORIZON,
	HERO_SECTION,
	HERO_TITLE,
	BADGE_BAR,
	RETRO_BADGE,
	RETRO_WINDOW,
	WINDOW_HEADER,
	WINDOW_CONTROLS,
	WINDOW_BTN_MIN,
	WINDOW_BTN_MAX,
	WINDOW_BODY,
	RETRO_BTN,
} from '../styles/tw'

type Friend = {
  id: string
  username: string
  displayName?: string
  avatarStyle: any
  hasAvatarPhoto?: boolean
  rating: number
  friendsSince: string
  status: PresenceStatus
}

type FriendRequest = {
  id: string
  userId: string
  username: string
  displayName?: string
  avatarStyle: any
  hasAvatarPhoto?: boolean
  createdAt: string
}

type BlockedUser = {
  id: string
  username: string
  displayName?: string
  avatarStyle: any
  hasAvatarPhoto?: boolean
  rating: number
  blockedSince: string
}

const STATUS_KEYS: Record<PresenceStatus, string> = {
  online: 'friends.online',
  playing: 'friends.inGame',
  offline: 'friends.offline',
}

export function Friends() {
  const { t } = useTranslation()
  const { setActiveMatch } = useApp()

  // ------------------------------------------------------------------------
  // CRT CONTROLS
  // ------------------------------------------------------------------------
  const [crtEnabled, setCrtEnabled] = useState(true)

  useEffect(() => {
    const savedCrt = localStorage.getItem('retro_crt')
    if (savedCrt === 'false') {
      setCrtEnabled(false)
    }
  }, [])

  const toggleCrt = () => {
    const next = !crtEnabled
    setCrtEnabled(next)
    localStorage.setItem('retro_crt', next ? 'true' : 'false')
    retroAudio.playUiBeep(440, 0.05)
  }

  // ------------------------------------------------------------------------
  // STATE MANAGEMENT
  // ------------------------------------------------------------------------
  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [blocked, setBlocked] = useState<BlockedUser[]>([])
  const [leaderboardMap, setLeaderboardMap] = useState<Record<string, number>>({})
  const [activeTab, setActiveTab] = useState<'friends' | 'blocked'>('friends')
  const [filterQuery, setFilterQuery] = useState('')
  const [searchUsername, setSearchUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [invitingId, setInvitingId] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const [fRes, rRes, bRes, lRes] = await Promise.all([
        fetch('/api/friends', { credentials: 'include' }),
        fetch('/api/friends/requests', { credentials: 'include' }),
        fetch('/api/friends/blocked', { credentials: 'include' }),
        fetch('/api/leaderboard?mode=global&limit=50', { credentials: 'include' }),
      ])
      if (fRes.ok && rRes.ok) {
        const friendsData = await fRes.json()
        const requestsData = await rRes.json()
        const sorted = (Array.isArray(friendsData) ? friendsData : []).sort((a: Friend, b: Friend) => {
          // Sort online/in-game first, then by rating descending
          const isOnlineA = a.status === 'online' || a.status === 'playing' ? 1 : 0
          const isOnlineB = b.status === 'online' || b.status === 'playing' ? 1 : 0
          if (isOnlineA !== isOnlineB) return isOnlineB - isOnlineA
          return (b.rating || 0) - (a.rating || 0)
        })
        setFriends(sorted)
        setRequests(requestsData.received || [])
      }
      if (bRes && bRes.ok) {
        const blockedData = await bRes.json()
        setBlocked(blockedData || [])
      }
      if (lRes && lRes.ok) {
        const lData = await lRes.json()
        if (lData?.entries) {
          const map: Record<string, number> = {}
          lData.entries.forEach((e: { username: string; rank: number }) => {
            map[e.username] = e.rank
          })
          setLeaderboardMap(map)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 15_000)
    return () => clearInterval(id)
  }, [])

  const handleAddFriend = async () => {
    setMsg(null)
    const target = searchUsername.trim()
    if (!target) return

    try {
      const userRes = await fetch(`/api/user/${target}`)
      if (!userRes.ok) {
        retroAudio.playUiBeep(320, 0.08)
        setMsg({ text: t('friends.userNotFound'), type: 'error' })
        return
      }
      const userData = await userRes.json()

      const reqRes = await fetch(`/api/friends/request/${userData.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      })
      if (!reqRes.ok) {
        let errorMsg = t('friends.couldNotSendRequest')
        try {
          const errorData = await reqRes.json()
          errorMsg = errorData.message || errorMsg
        } catch (err) { }
        retroAudio.playUiBeep(320, 0.08)
        setMsg({ text: `${errorMsg}`, type: 'error' })
        return
      }

      retroAudio.playUiBeep(880, 0.06)
      setMsg({ text: t('friends.requestSent'), type: 'success' })
      setSearchUsername('')
      fetchData()
    } catch (e) {
      retroAudio.playUiBeep(320, 0.08)
      setMsg({ text: t('friends.genericError'), type: 'error' })
    }
  }

  const handleAccept = async (requestId: string) => {
    retroAudio.playUiBeep(880, 0.06)
    await fetch(`/api/friends/accept/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    })
    fetchData()
  }

  const handleDecline = async (requestId: string) => {
    retroAudio.playUiBeep(440, 0.06)
    await fetch(`/api/friends/decline/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    })
    fetchData()
  }

  const handleInvite = async (friendId: string) => {
    setInvitingId(friendId)
    setMsg(null)
    retroAudio.playUiBeep(780, 0.06)
    try {
      const res = await postApi<{
        gameId: string
        token: string
        engineUrl: string
        color: PlayerColor
        inviteCode?: string
        mode: 'pvp' | 'pve' | 'hotseat'
        playerCount: number
      }>('/api/friends/' + friendId + '/invite')
      setActiveMatch(res)
      navigate(`/game?gameId=${res.gameId}`)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : t('friends.genericError'), type: 'error' })
      setInvitingId(null)
    }
  }

  const handleRemove = async (friendId: string) => {
    retroAudio.playUiBeep(440, 0.06)
    await fetch(`/api/friends/remove/${friendId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    })
    fetchData()
  }

  const handleBlock = async (friendId: string) => {
    retroAudio.playUiBeep(320, 0.08)
    await fetch(`/api/friends/block/${friendId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    })
    fetchData()
  }

  const handleUnblock = async (targetUserId: string) => {
    retroAudio.playUiBeep(640, 0.06)
    await fetch(`/api/friends/unblock/${targetUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    })
    fetchData()
  }

  const onlineFriendsCount = friends.filter((f) => f.status === 'online' || f.status === 'playing').length
  const filteredFriends = friends.filter((f) => f.username.toLowerCase().includes(filterQuery.toLowerCase().trim()))

  return (
    <>
      {/* Animated 3D Synthwave Grid & Sun Background */}
      <div className={GRID_BACKGROUND}>
        <div className={SYNTHWAVE_SUN} />
        <div className={GRID_HORIZON} />
        <div className={PERSPECTIVE_GRID} />
      </div>

      {/* CRT Monitor Overlay FX Container */}
      <div
        className={`${CRT_SCREEN} crt-screen ${crtEnabled ? 'relative' : ''}`}
        id="crtScreen"
        style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Dynamic Full-Width Seated Sidebar & Content Layout Container */}
        <div className="w-full min-h-screen px-6 py-8 flex flex-row items-start justify-center gap-7 relative z-10 box-border">
          {/* Left-Seated Navigation Dock */}
          <aside className="shrink-0 w-[88px] xl:w-[270px] sticky top-8" style={{ margin: 0, padding: 0 }}>
            <RetroNavbar
              activeRoute="/friends"
              crtEnabled={crtEnabled}
              toggleCrt={toggleCrt}
            />
          </aside>

          {/* Main Content Flow */}
          <div className="flex-1 w-full min-w-0 sticky top-8" style={{ margin: 0, padding: 0 }}>
            {/* Top Hero Banner */}
            <header className={HERO_SECTION} style={{ marginTop: 0, padding: '16px 0 16px', marginBottom: 12, flexShrink: 0 }}>
            <h1 className={HERO_TITLE} style={{ fontSize: '1.45rem', margin: 0, letterSpacing: '1.5px' }}>
              {t('friends.networkTitle')}
            </h1>

            {/* Metric Telemetry Strip */}
            <div className={BADGE_BAR} style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                className={RETRO_BADGE}
                style={{
                  border: '1px solid #00ff88',
                  color: '#00ff88',
                  background: 'rgba(0, 255, 136, 0.12)',
                  boxShadow: '0 0 10px rgba(0, 255, 136, 0.25)',
                  fontSize: '0.74rem',
                  padding: '4px 12px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 'bold',
                }}
              >
                {t('friends.badgeOnline', { count: onlineFriendsCount })}
              </span>
              <span
                className={RETRO_BADGE}
                style={{
                  border: '1px solid var(--accent-cyan)',
                  color: 'var(--accent-cyan)',
                  background: 'rgba(0, 240, 255, 0.12)',
                  fontSize: '0.74rem',
                  padding: '4px 12px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 'bold',
                }}
              >
                {t('friends.badgeFriends', { count: friends.length })}
              </span>
              <span
                className={RETRO_BADGE}
                style={{
                  border: requests.length > 0 ? '1.5px solid var(--accent-pink)' : '1px dashed rgba(255,255,255,0.2)',
                  color: requests.length > 0 ? '#ff007f' : 'var(--text-muted)',
                  background: requests.length > 0 ? 'rgba(255, 0, 127, 0.18)' : 'transparent',
                  boxShadow: requests.length > 0 ? '0 0 14px rgba(255, 0, 127, 0.4)' : 'none',
                  fontSize: '0.74rem',
                  padding: '4px 12px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-display)',
                  fontWeight: 'bold',
                }}
              >
                {t('friends.badgeRequests', { count: requests.length })}
              </span>
              {blocked.length > 0 && (
                <span
                  className={RETRO_BADGE}
                  style={{
                    border: '1px solid rgba(255, 0, 85, 0.4)',
                    color: '#ff0055',
                    background: 'rgba(255, 0, 85, 0.1)',
                    fontSize: '0.74rem',
                    padding: '4px 12px',
                    borderRadius: 4,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 'bold',
                  }}
                >
                  {t('friends.badgeBlocked', { count: blocked.length })}
                </span>
              )}
            </div>
          </header>

          {/* Full-Width Unified Retro Window Container */}
          <section
            className={RETRO_WINDOW}
            style={{
              width: '100%',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {/* Window Header */}
            <div
              className={WINDOW_HEADER}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 18px',
                fontSize: '0.85rem',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'bold', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
                <span>{t('friends.friendsListTitle')}</span>
              </div>
              <div className={WINDOW_CONTROLS} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={WINDOW_BTN_MIN} />
                <span className={WINDOW_BTN_MAX} />
              </div>
            </div>

            {/* Window Body (2-Column Fixed Viewport Grid) */}
            <div
              className={WINDOW_BODY}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.65fr) minmax(330px, 1fr)',
                gap: 16,
                padding: '14px 18px 16px',
                flex: 1,
                overflow: 'hidden',
                minHeight: 0,
              }}
            >
              {/* ════════════════════════════════════════════════════════════════
                  LEFT COLUMN: Allied Operatives / Restricted Pilots List
                 ════════════════════════════════════════════════════════════════ */}
              <div
                className="retro-window"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'linear-gradient(180deg, rgba(20, 6, 46, 0.86), rgba(10, 2, 28, 0.94))',
                  backdropFilter: 'blur(32px) saturate(220%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(220%)',
                  border: '1px solid rgba(0, 240, 255, 0.35)',
                  boxShadow: '0 28px 70px rgba(0, 0, 0, 0.8), 0 0 32px rgba(0, 240, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 0 20px rgba(255, 0, 127, 0.08)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  minHeight: 0,
                }}
              >
                {/* Tab Switcher Header */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      className={RETRO_BTN}
                      onClick={() => {
                        retroAudio.playUiBeep(520, 0.04)
                        setActiveTab('friends')
                      }}
                      style={{
                        padding: '5px 14px',
                        fontSize: '0.76rem',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 900,
                        borderRadius: 4,
                        color: activeTab === 'friends' ? '#ffffff' : 'var(--text-muted)',
                        background: activeTab === 'friends' ? 'rgba(0, 240, 255, 0.25)' : 'transparent',
                        borderColor: activeTab === 'friends' ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.15)',
                        boxShadow: activeTab === 'friends' ? '0 0 10px rgba(0, 240, 255, 0.35)' : 'none',
                      }}
                    >
                      {t('friends.tabFriendsCount', { count: friends.length })}
                    </button>
                    <button
                      className={RETRO_BTN}
                      onClick={() => {
                        retroAudio.playUiBeep(520, 0.04)
                        setActiveTab('blocked')
                      }}
                      style={{
                        padding: '5px 14px',
                        fontSize: '0.76rem',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 900,
                        borderRadius: 4,
                        color: activeTab === 'blocked' ? '#ffffff' : 'var(--text-muted)',
                        background: activeTab === 'blocked' ? 'rgba(255, 0, 85, 0.22)' : 'transparent',
                        borderColor: activeTab === 'blocked' ? '#ff0055' : 'rgba(255, 255, 255, 0.15)',
                        boxShadow: activeTab === 'blocked' ? '0 0 10px rgba(255, 0, 85, 0.35)' : 'none',
                      }}
                    >
                      {t('friends.tabBlockedCount', { count: blocked.length })}
                    </button>
                  </div>

                  {activeTab === 'friends' && (
                    <div style={{ position: 'relative' }}>
                      <input
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        placeholder={t('friends.searchFriendsInput')}
                        style={{
                          background: 'rgba(5, 2, 18, 0.85)',
                          border: '1px solid rgba(0, 240, 255, 0.35)',
                          borderRadius: 4,
                          color: '#ffffff',
                          padding: '4px 10px',
                          fontSize: '0.72rem',
                          fontFamily: 'var(--font-display)',
                          outline: 'none',
                          width: 170,
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Tab Body (Internally Scrollable) */}
                <div
                  style={{
                    padding: '12px 16px',
                    flex: 1,
                    overflowY: 'auto',
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {loading ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--accent-yellow)', fontSize: '0.85rem', fontFamily: 'var(--font-display)' }}>
                      {t('friends.scanningFrequencies')}
                    </div>
                  ) : activeTab === 'friends' ? (
                    /* ─── TAB 1: ALLIED FRIENDS STREAM ─── */
                    filteredFriends.length === 0 ? (
                      <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem', fontFamily: 'var(--font-display)' }}>
                        {filterQuery ? t('friends.noMatchingFriends', { query: filterQuery }) : t('friends.noFriendsTransmitPrompt')}
                      </div>
                    ) : (
                      filteredFriends.map((f) => {
                        const fRank = leaderboardMap[f.username]
                        const fTier = getRankTier(f.rating, fRank)
                        const fStatus = STATUS_STYLE[f.status] || STATUS_STYLE.offline
                        return (
                          <div
                            key={f.id}
                            className="retro-friend-card"
                            onClick={() => {
                              retroAudio.playUiBeep(640, 0.04)
                              navigate(`/profile?u=${f.username}`)
                            }}
                            title={`Click to view ${f.username}'s Pilot Profile`}
                          >
                            {/* Left: Avatar + Callsign + Presence */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                              <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div
                                  style={{
                                    padding: 2,
                                    borderRadius: 6,
                                    background: `linear-gradient(135deg, ${fTier.color}, var(--accent-cyan))`,
                                    boxShadow: `0 0 10px ${fTier.glow}`,
                                  }}
                                >
                                  <UserAvatar
                                    username={f.username}
                                    hasAvatarPhoto={f.hasAvatarPhoto}
                                    avatarStyle={f.avatarStyle}
                                    size={42}
                                    fallbackStyle={{
                                      width: 42,
                                      height: 42,
                                      borderRadius: 4,
                                      background: 'rgba(10, 2, 28, 0.95)',
                                      color: 'var(--accent-cyan)',
                                      display: 'grid',
                                      placeItems: 'center',
                                      fontWeight: 900,
                                      fontSize: '1rem',
                                    }}
                                  />
                                </div>
                                <span
                                  style={{
                                    position: 'absolute',
                                    right: -2,
                                    bottom: -2,
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: fStatus.color,
                                    border: '2px solid #0d0221',
                                    boxShadow: `0 0 6px ${fStatus.color}`,
                                  }}
                                />
                              </div>

                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: '0.94rem',
                                    fontWeight: 900,
                                    color: '#ffffff',
                                    fontFamily: 'var(--font-display)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    letterSpacing: '0.02em',
                                  }}
                                >
                                  {f.displayName || f.username}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: fStatus.color, fontFamily: 'var(--font-display)', fontWeight: 'bold', marginTop: 2 }}>
                                  ● {t(STATUS_KEYS[f.status] ?? STATUS_KEYS.offline).toUpperCase()}
                                </div>
                              </div>
                            </div>

                            {/* Middle: Rating + Rank Badge */}
                            <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 6 }}>
                              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                                {f.rating}
                              </div>
                              <div style={{ marginTop: 3 }}>
                                <RankBadge tier={fTier} fontSize="10px" padding="2px 7px" />
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <button
                                className={RETRO_BTN}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleInvite(f.id)
                                }}
                                disabled={invitingId === f.id}
                                style={{
                                  padding: '5px 12px',
                                  fontSize: '0.72rem',
                                  fontFamily: 'var(--font-display)',
                                  fontWeight: 900,
                                  background: 'linear-gradient(90deg, #ff007f, #9d00ff)',
                                  color: '#ffffff',
                                  borderColor: '#ff007f',
                                  boxShadow: '0 0 10px rgba(255, 0, 127, 0.4)',
                                  opacity: invitingId === f.id ? 0.6 : 1,
                                  borderRadius: 4,
                                }}
                                title="Challenge Operative to Match"
                              >
                                {invitingId === f.id ? t('friends.invitingBtnState') : t('friends.challengeBtn')}
                              </button>

                              <button
                                className={RETRO_BTN}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemove(f.id)
                                }}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.72rem',
                                  fontFamily: 'var(--font-display)',
                                  fontWeight: 900,
                                  color: '#ffffff',
                                  borderColor: 'rgba(255, 255, 255, 0.2)',
                                  background: 'rgba(255, 255, 255, 0.06)',
                                  borderRadius: 4,
                                }}
                                title="Remove Comrade"
                              >
                                {t('friends.removeComradeBtn')}
                              </button>

                              <button
                                className={RETRO_BTN}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleBlock(f.id)
                                }}
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '0.72rem',
                                  fontFamily: 'var(--font-display)',
                                  fontWeight: 900,
                                  color: '#ffffff',
                                  borderColor: 'rgba(255, 0, 85, 0.5)',
                                  background: 'rgba(255, 0, 85, 0.14)',
                                  borderRadius: 4,
                                }}
                                title="Block Pilot"
                              >
                                {t('friends.blockPilotBtn')}
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )
                  ) : (
                    /* ─── TAB 2: BLOCKED LIST ─── */
                    blocked.length === 0 ? (
                      <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem', fontFamily: 'var(--font-display)' }}>
                        {t('friends.noRestrictedPilots')}
                      </div>
                    ) : (
                      blocked.map((b) => (
                        <div
                          key={b.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            borderRadius: 6,
                            background: 'rgba(255, 0, 85, 0.08)',
                            border: '1.5px solid rgba(255, 0, 85, 0.28)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <UserAvatar
                              username={b.username}
                              hasAvatarPhoto={b.hasAvatarPhoto}
                              size={38}
                              fallbackStyle={{
                                width: 38,
                                height: 38,
                                borderRadius: 4,
                                background: 'rgba(10, 2, 28, 0.95)',
                                color: '#ff0055',
                                display: 'grid',
                                placeItems: 'center',
                                fontWeight: 900,
                              }}
                            />
                            <div>
                              <div style={{ fontWeight: 900, fontSize: '0.9rem', color: '#ffffff', fontFamily: 'var(--font-display)' }}>
                                {b.displayName || b.username}
                              </div>
                              <div style={{ color: '#ff0055', fontSize: '0.68rem', fontFamily: 'var(--font-display)', marginTop: 2 }}>
                                {t('friends.restrictedSince', { date: new Date(b.blockedSince).toLocaleDateString() })}
                              </div>
                            </div>
                          </div>

                          <button
                            className={RETRO_BTN}
                            onClick={() => handleUnblock(b.id)}
                            style={{
                              padding: '5px 14px',
                              fontSize: '0.72rem',
                              fontFamily: 'var(--font-display)',
                              borderRadius: 4,
                            }}
                          >
                            {t('friends.unblockActionBtn')}
                          </button>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>

              {/* ════════════════════════════════════════════════════════════════
                  RIGHT COLUMN: Transmit Module + Dedicated Bottom-Right Incoming Panel
                 ════════════════════════════════════════════════════════════════ */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                {/* Top Right Card: ADD FRIEND */}
                <div
                  className="retro-window"
                  style={{
                    background: 'linear-gradient(180deg, rgba(20, 6, 46, 0.86), rgba(10, 2, 28, 0.94))',
                    backdropFilter: 'blur(32px) saturate(220%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(220%)',
                    border: '1px solid rgba(0, 240, 255, 0.35)',
                    boxShadow: '0 28px 70px rgba(0, 0, 0, 0.8), 0 0 32px rgba(0, 240, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 0 20px rgba(255, 0, 127, 0.08)',
                    borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: '0.82rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-display)', fontWeight: 900, letterSpacing: '1px' }}>
                    {t('friends.addFriendTitle')}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      value={searchUsername}
                      onChange={(e) => setSearchUsername(e.target.value)}
                      placeholder={t('friends.enterUsernamePrompt')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddFriend()
                      }}
                      style={{
                        background: 'rgba(5, 2, 18, 0.95)',
                        border: '1.5px solid rgba(0, 240, 255, 0.45)',
                        borderRadius: 4,
                        color: '#ffffff',
                        padding: '10px 12px',
                        fontSize: '0.85rem',
                        fontFamily: 'var(--font-display)',
                        outline: 'none',
                        letterSpacing: '0.04em',
                      }}
                    />
                    <button
                      className={RETRO_BTN}
                      onClick={handleAddFriend}
                      style={{
                        padding: '9px 16px',
                        fontSize: '0.78rem',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 900,
                        background: 'rgba(0, 240, 255, 0.22)',
                        color: '#ffffff',
                        borderColor: 'var(--accent-cyan)',
                        boxShadow: '0 0 12px rgba(0, 240, 255, 0.3)',
                        borderRadius: 4,
                      }}
                    >
                      {t('friends.sendFriendRequestBtn')}
                    </button>
                  </div>

                  {msg && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 4,
                        background: msg.type === 'error' ? 'rgba(255, 0, 85, 0.16)' : 'rgba(0, 255, 136, 0.16)',
                        border: `1px solid ${msg.type === 'error' ? '#ff0055' : '#00ff88'}`,
                        color: msg.type === 'error' ? '#ff0055' : '#00ff88',
                        fontSize: '0.74rem',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 'bold',
                      }}
                    >
                      {msg.type === 'error' ? '✕ ' : '✓ '}
                      {msg.text}
                    </div>
                  )}
                </div>

                {/* Bottom Right Card: Dedicated FRIEND REQUESTS Card */}
                <div
                  className="retro-window"
                  style={{
                    flex: 1,
                    background: 'linear-gradient(180deg, rgba(20, 6, 46, 0.86), rgba(10, 2, 28, 0.94))',
                    backdropFilter: 'blur(32px) saturate(220%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(220%)',
                    border: '1px solid rgba(0, 240, 255, 0.35)',
                    boxShadow: '0 28px 70px rgba(0, 0, 0, 0.8), 0 0 32px rgba(0, 240, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 0 20px rgba(255, 0, 127, 0.08)',
                    borderRadius: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    minHeight: 0,
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: requests.length > 0 ? 'var(--accent-pink)' : 'var(--text-muted)',
                          boxShadow: requests.length > 0 ? '0 0 8px var(--accent-pink)' : 'none',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-main)',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 900,
                          letterSpacing: '1px',
                        }}
                      >
                        {t('friends.friendRequestsBoxTitle', { count: requests.length })}
                      </span>
                    </div>

                    {requests.length > 0 && (
                      <span
                        style={{
                          fontSize: '0.66rem',
                          padding: '2px 7px',
                          borderRadius: 3,
                          background: 'linear-gradient(90deg, #ff007f, #9d00ff)',
                          color: '#ffffff',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 900,
                          boxShadow: '0 0 8px rgba(255, 0, 127, 0.4)',
                        }}
                      >
                        {t('friends.badgeNewTag')}
                      </span>
                    )}
                  </div>

                  {/* Card Scrollable Content */}
                  <div
                    style={{
                      padding: '12px 14px',
                      flex: 1,
                      overflowY: 'auto',
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 9,
                    }}
                  >
                    {requests.length === 0 ? (
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-muted)',
                          fontSize: '0.76rem',
                          fontFamily: 'var(--font-display)',
                          textAlign: 'center',
                          gap: 6,
                          padding: '20px 10px',
                        }}
                      >
                        <span style={{ fontSize: '1.2rem', color: 'rgba(255, 255, 255, 0.2)' }}>✦</span>
                        <span>{t('friends.noPendingRequestsPrompt')}</span>
                      </div>
                    ) : (
                      requests.map((r) => (
                        <div
                          key={r.id}
                          className="retro-friend-card"
                          style={{
                            padding: '9px 12px',
                            gap: 10,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <UserAvatar
                              username={r.username}
                              hasAvatarPhoto={r.hasAvatarPhoto}
                              avatarStyle={r.avatarStyle}
                              size={34}
                              fallbackStyle={{
                                width: 34,
                                height: 34,
                                borderRadius: 4,
                                background: 'rgba(10, 2, 28, 0.95)',
                                color: 'var(--accent-pink)',
                                display: 'grid',
                                placeItems: 'center',
                                fontWeight: 900,
                              }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '0.86rem',
                                  fontWeight: 900,
                                  color: 'var(--text-main)',
                                  fontFamily: 'var(--font-display)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                 {r.displayName || r.username}
                              </div>
                              <div style={{ color: 'var(--accent-cyan)', fontSize: '0.64rem', fontFamily: 'var(--font-display)', marginTop: 1 }}>
                                {t('friends.sentYouRequestText')}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              className={RETRO_BTN}
                              onClick={() => handleAccept(r.id)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.7rem',
                                fontFamily: 'var(--font-display)',
                                fontWeight: 900,
                                background: '#00ff88',
                                color: '#0d0221',
                                borderColor: '#00ff88',
                                borderRadius: 3,
                              }}
                              title="Accept Friend Request"
                            >
                              {t('friends.acceptActionBtn')}
                            </button>
                            <button
                              className={RETRO_BTN}
                              onClick={() => handleDecline(r.id)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.7rem',
                                fontFamily: 'var(--font-display)',
                                borderRadius: 3,
                              }}
                              title="Ignore Request"
                            >
                              {t('friends.ignoreActionBtn')}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </>
)
}

