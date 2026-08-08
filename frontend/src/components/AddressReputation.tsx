import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listEngagementsFor, getEngagement } from '../lib/surety'
import { mapWithConcurrency } from '../lib/concurrency'
import { useNetwork } from '../lib/network'
import type { Engagement } from '../lib/types'
import { shortAddress } from '../lib/format'
import { Card } from './ui/Card'
import { Skeleton } from './ui/Skeleton'

interface Stats {
  total: number
  asDepositor: number
  asCounterparty: number
  approvalRate: number | null
  disputeRate: number | null
}

function computeStats(address: `0x${string}`, engagements: Engagement[]): Stats {
  const total = engagements.length
  const asDepositor = engagements.filter((e) => e.depositor.toLowerCase() === address.toLowerCase()).length
  const asCounterparty = total - asDepositor

  // Matches the Transparency page's math: "refunded" started as a rejection,
  // so it counts as judged too - otherwise a settled rejection would
  // silently vanish from these rates the moment its appeal window closes.
  const judged = engagements.filter((e) => ['released', 'rejected', 'disputed', 'refunded'].includes(e.status)).length
  const released = engagements.filter((e) => e.status === 'released').length
  const contested = engagements.filter((e) => ['rejected', 'disputed', 'refunded'].includes(e.status)).length

  return {
    total,
    asDepositor,
    asCounterparty,
    approvalRate: judged > 0 ? Math.round((released / judged) * 100) : null,
    disputeRate: judged > 0 ? Math.round((contested / judged) * 100) : null,
  }
}

/** Compact, reusable reputation summary for a single address - counts and
 * judged-outcome rates derived entirely from existing view methods, same
 * math the Transparency page (Stats.tsx) already uses for the whole
 * contract, just filtered to one address. */
export function AddressReputation({
  address,
  linkToProfile = true,
}: {
  address: `0x${string}`
  linkToProfile?: boolean
}) {
  const network = useNetwork()
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStats(null)
    setError(null)
    ;(async () => {
      try {
        const ids = await listEngagementsFor(address)
        const items = await mapWithConcurrency(ids, 1, getEngagement)
        if (!cancelled) setStats(computeStats(address, items))
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load reputation')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address, network])

  if (error) return null

  if (!stats) {
    return <Skeleton className="h-20 rounded-2xl" />
  }

  const body = (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-ink-soft">{shortAddress(address)}</p>
        {stats.total === 0 && <p className="text-xs text-ink-soft">No history yet</p>}
      </div>
      {stats.total > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="font-display text-lg font-bold text-ink">{stats.total}</p>
            <p className="text-[11px] text-ink-soft">
              engagement{stats.total === 1 ? '' : 's'} ({stats.asDepositor} created, {stats.asCounterparty} worked)
            </p>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-ink">{stats.approvalRate === null ? '—' : `${stats.approvalRate}%`}</p>
            <p className="text-[11px] text-ink-soft">approval rate</p>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-ink">{stats.disputeRate === null ? '—' : `${stats.disputeRate}%`}</p>
            <p className="text-[11px] text-ink-soft">dispute rate</p>
          </div>
        </div>
      )}
    </Card>
  )

  if (!linkToProfile) return body
  return (
    <Link to={`/app/profile/${address}`} className="block transition-opacity hover:opacity-80">
      {body}
    </Link>
  )
}
