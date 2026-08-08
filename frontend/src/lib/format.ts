import { formatEther } from 'viem'

export function shortAddress(address: string | null | undefined): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatGen(amount: number | bigint): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(amount))
  return `${formatEther(value)} GEN`
}

export function formatUnixDate(unixSeconds: number): string {
  if (!unixSeconds) return '-'
  return new Date(unixSeconds * 1000).toLocaleString()
}

export function formatUnixDateUTC(unixSeconds: number): string {
  if (!unixSeconds) return '-'
  const formatted = new Date(unixSeconds * 1000).toLocaleString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return `${formatted} UTC`
}

export function isPast(unixSeconds: number): boolean {
  return Date.now() >= unixSeconds * 1000
}

/** For a rejected engagement, when the appeal window closes and whether it
 * already has. `rejectedAt`/`windowSeconds` are both 0 for an engagement
 * that was never rejected. */
export function appealWindowStatus(
  rejectedAt: number,
  windowSeconds: number,
): { closesAt: number; isOpen: boolean } {
  const closesAt = rejectedAt + windowSeconds
  return { closesAt, isOpen: !isPast(closesAt) }
}

/** The contract only stores one `deliverable_spec` string - CreateEngagement
 * writes it as `title\n\ndescription` so lists can show a real title instead
 * of a truncated wall of text. Older engagements with no blank-line split
 * just show their full spec as the title, so this stays backward compatible. */
export function splitTitle(spec: string): { title: string; description: string } {
  const idx = spec.indexOf('\n\n')
  if (idx === -1) return { title: spec.trim(), description: '' }
  return { title: spec.slice(0, idx).trim(), description: spec.slice(idx + 2).trim() }
}

/** Reverses CreateEngagement.tsx's spec assembly (title / description /
 * "Verification criteria:\n..." / "Delivery method: ..." joined by blank
 * lines) - used to pre-fill the create form when recreating an engagement
 * with new terms. */
export function parseSpec(spec: string): {
  title: string
  description: string
  verificationCriteria: string
  deliveryMethod: string
} {
  const parts = spec.split('\n\n')
  const vcPart = parts.find((p) => p.startsWith('Verification criteria:')) ?? ''
  const dmPart = parts.find((p) => p.startsWith('Delivery method:')) ?? ''
  return {
    title: (parts[0] ?? '').trim(),
    description: (parts[1] ?? '').trim(),
    verificationCriteria: vcPart.replace(/^Verification criteria:\n?/, '').trim(),
    deliveryMethod: dmPart.replace(/^Delivery method:\s*/, '').trim(),
  }
}
