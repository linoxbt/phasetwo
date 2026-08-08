/**
 * Client-side "changed since your last visit" tracking - there's no backend
 * to push notifications from, so this only surfaces a difference the next
 * time the app polls or the user opens a page, not a real-time alert.
 */
const KEY_PREFIX = 'phasetwo:lastseen:'

type LastSeenMap = Record<number, string>

function keyFor(address: string): string {
  return `${KEY_PREFIX}${address.toLowerCase()}`
}

function readLastSeen(address: string): LastSeenMap {
  try {
    const raw = window.localStorage.getItem(keyFor(address))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeLastSeen(address: string, map: LastSeenMap): void {
  try {
    window.localStorage.setItem(keyFor(address), JSON.stringify(map))
  } catch {
    // storage unavailable/full - activity tracking degrades silently
  }
}

export function markSeen(address: string, engagementId: number, status: string): void {
  const map = readLastSeen(address)
  map[engagementId] = status
  writeLastSeen(address, map)
}

export function markAllSeen(address: string, engagements: { id: number; status: string }[]): void {
  const map = readLastSeen(address)
  for (const e of engagements) map[e.id] = e.status
  writeLastSeen(address, map)
}

/** Engagements whose current status differs from (or is missing from) what
 * was last recorded as seen - a brand new engagement counts as activity.
 * Doesn't mark anything seen itself, so it's safe to call repeatedly (e.g.
 * on every poll) without losing track of what's actually new. */
export function getUnseenChanges(
  address: string,
  engagements: { id: number; status: string }[],
): { id: number; status: string }[] {
  const map = readLastSeen(address)
  return engagements.filter((e) => map[e.id] !== e.status)
}

export function hasUnseenChanges(address: string, engagements: { id: number; status: string }[]): boolean {
  return getUnseenChanges(address, engagements).length > 0
}
