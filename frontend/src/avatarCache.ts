import { useSyncExternalStore } from 'react'

// Per-username avatar cache-busting store. An `avatar_changed` SSE event bumps
// the version for that username; every open <UserAvatar> for that user then
// re-renders with a fresh `?t=<version>` on /api/user/<username>/avatar — so
// photo changes propagate to all clients in near-real-time instead of showing
// a stale photo (or a stale 404→dicebear fallback) until the next reload.
const versions = new Map<string, number>()
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

export function bumpAvatarVersion(username: string): void {
  if (!username) return
  versions.set(username, (versions.get(username) ?? 0) + 1)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAvatarVersion(username: string): number {
  return useSyncExternalStore(
    subscribe,
    () => versions.get(username) ?? 0,
    () => versions.get(username) ?? 0,
  )
}
