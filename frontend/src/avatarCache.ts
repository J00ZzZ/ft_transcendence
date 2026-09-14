import { useSyncExternalStore } from 'react';

// Client avatar state, keyed by the immutable user id: the state the server last
// announced per user, a change stamp per user, and the ids whose image failed to
// load. See docs/avatar-system.md.

export type AvatarOverride = { has: boolean; style?: string | null; v?: number };

const overrides = new Map<string, AvatarOverride>();
const attempts = new Map<string, number>();
const broken = new Set<string>();
const listeners = new Set<() => void>();

let revision = 0;

function emit(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = (): number => revision;

// Re-render on any avatar-state change; the values themselves are read below.
export function useAvatarRevision(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// The server announced this user's avatar state (SSE avatar_changed, or our own
// upload/delete). Clears any "broken" verdict so a re-upload gets one more try.
// The stamp becomes the URL's `?v=`; see docs/avatar-system.md.
export function applyAvatarChange(userId: string, override: AvatarOverride): void {
  if (!userId) return;
  const v = override.v ?? Date.now();
  overrides.set(userId, { ...override, v });
  attempts.set(userId, v);
  broken.delete(userId);
  emit();
}

export function getAvatarOverride(userId: string | undefined): AvatarOverride | undefined {
  return userId ? overrides.get(userId) : undefined;
}

export function getAvatarAttempt(userId: string | undefined): number {
  return userId ? (attempts.get(userId) ?? 0) : 0;
}

// A failed load: a 404 because there is no photo, or a 200 whose bytes the
// browser cannot decode. Either way there is nothing to show, so record it and
// stop asking for this user this session.
export function markAvatarBroken(userId: string): void {
  if (!userId || broken.has(userId)) return;
  broken.add(userId);
  emit();
}

export function isAvatarBroken(userId: string | undefined): boolean {
  return userId ? broken.has(userId) : false;
}
