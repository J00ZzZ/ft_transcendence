import { useState, useEffect } from 'react'
import { dicebearAvatar } from '../dicebear'
import { useAvatarVersion } from '../avatarCache'

type UserAvatarProps = {
  username: string
  size: number
  fallbackStyle?: any
  avatarStyle?: any
  style?: any
  cacheBuster?: number
  hasAvatarPhoto?: boolean
}

export function UserAvatar({ username, size, fallbackStyle, avatarStyle, style, cacheBuster, hasAvatarPhoto }: UserAvatarProps) {
  const [error, setError] = useState(false)
  // Live avatar-change propagation: bumped by the `avatar_changed` SSE event.
  // Used as the img `key` so a bump remounts the <img> and re-fetches the photo.
  // The avatar endpoint serves Cache-Control: no-store, so the refetch is fresh.
  const liveVersion = useAvatarVersion(username)

  // Reset error state if username or cache buster changes
  useEffect(() => {
    setError(false)
  }, [username, cacheBuster])

  if (!username) {
    return (
      <div style={{ ...fallbackStyle, width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style, flex: 'none' }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size * 0.55}
          height={size * 0.55}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: fallbackStyle.color || '#a99a83', opacity: 0.8 }}
        >
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
    )
  }

  // Known to have no photo → never ask. Otherwise try it, with `error` still
  // guarding the case where a photo exists but fails to load.
  const src = (hasAvatarPhoto === false || error)
    ? dicebearAvatar(username, avatarStyle)
    : `/api/user/${username}/avatar${cacheBuster ? `?t=${cacheBuster}` : ''}`

  return (
    <img
      key={liveVersion}
      src={src}
      onError={error ? undefined : () => setError(true)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'block',
        flex: 'none',
        ...style,
      }}
      alt={`${username}'s avatar`}
    />
  )
}
