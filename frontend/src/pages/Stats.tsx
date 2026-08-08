import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAllIds, getEngagement } from '../lib/surety'
import { mapWithConcurrency } from '../lib/concurrency'
import { NETWORKS as NETWORK_REGISTRY, useNetwork } from '../lib/network'
import { getRecentValidatorCount } from '../lib/validators'
import type { Engagement, StatusValue } from '../lib/types'
import { STATUS_LABEL } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { Card } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { AnimatedCounter } from '../components/ui/AnimatedCounter'
import { formatGen, formatUnixDate, shortAddress, splitTitle } from '../lib/format'

const STATUS_ORDER: StatusValue[] = [
  'created',
  'accepted',
  'declined',
  'submitted',
  'released',
  'rejected',
  'disputed',
  'expired',
  'refunded',
]
const LOCKED_STATUSES: StatusValue[] = ['created', 'accepted', 'submitted', 'disputed', 'rejected']
const REFUNDED_STATUSES: StatusValue[] = ['declined', 'expired', 'refunded']

const STATUS_BAR_COLOR: Record<StatusValue, string> = {
  created: 'bg-ink/20',
  accepted: 'bg-sky-400',
  declined: 'bg-ink/10',
  submitted: 'bg-violet-400',
  released: 'bg-emerald-400',
  rejected: 'bg-red-400',
  disputed: 'bg-coral-400',
  expired: 'bg-ink/10',
  refunded: 'bg-ink/10',
}

export function Stats() {
  const network = useNetwork()
  const [engagements, setEngagements] = useState<Engagement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validatorCount, setValidatorCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setEngagements(null)
    setError(null)
    ;(async () => {
      try {
        const ids = await listAllIds()
        const items = await mapWithConcurrency(ids, 1, getEngagement)
        if (!cancelled) setEngagements(items)
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load stats')
      }
    })()
    return () => {
      cancelled = true
    }
    // network is a dependency so switching networks re-fetches against the newly selected contract
  }, [network])

  useEffect(() => {
    let cancelled = false
    setValidatorCount(null)
    getRecentValidatorCount(network).then((n) => {
      if (!cancelled) setValidatorCount(n)
    })
    return () => {
      cancelled = true
    }
  }, [network])

  const total = engagements?.length ?? 0
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<StatusValue, number>
  for (const e of engagements ?? []) counts[e.status] = (counts[e.status] ?? 0) + 1

  const sumWhere = (statuses: StatusValue[]) =>
    (engagements ?? []).filter((e) => statuses.includes(e.status)).reduce((sum, e) => sum + BigInt(e.amount), 0n)
  const totalReleased = sumWhere(['released'])
  const totalLocked = sumWhere(LOCKED_STATUSES)
  const totalRefunded = sumWhere(REFUNDED_STATUSES)
  const totalVolume = totalReleased + totalLocked + totalRefunded

  // "refunded" engagements were rejected first, so they count as judged too -
  // otherwise a settled rejection would silently vanish from these rates the
  // moment its appeal window closes.
  const judged = counts.released + counts.rejected + counts.disputed + counts.refunded
  const approvalRate = judged > 0 ? Math.round((counts.released / judged) * 100) : null
  const disputeRate = judged > 0 ? Math.round(((counts.rejected + counts.disputed + counts.refunded) / judged) * 100) : null

  const uniqueParticipants = new Set(
    (engagements ?? []).flatMap((e) => [e.depositor.toLowerCase(), e.counterparty.toLowerCase()]),
  ).size

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 text-left">
        <p className="label-mono text-xs text-coral-600">Live on {NETWORK_REGISTRY[network].label}</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Transparency</h1>
        <p className="mt-4 max-w-xl text-ink-soft">Read live from the contract - nothing aggregated off-chain.</p>
        {engagements !== null && total > 0 && (
          <p className="mt-2 text-sm text-ink-soft">
            {total} engagement{total === 1 ? '' : 's'} &middot; {formatGen(totalVolume)} processed all-time
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {engagements === null && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      )}

      {engagements !== null && (
        <>
          <p className="label-mono mb-3 text-xs text-ink-soft">Activity</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-6">
              <p className="font-display text-3xl font-bold text-ink">
                <AnimatedCounter to={total} />
              </p>
              <p className="mt-1 text-sm text-ink-soft">Total engagements</p>
            </Card>
            <Card className="p-6">
              <p className="font-display text-3xl font-bold text-ink">
                <AnimatedCounter to={uniqueParticipants} />
              </p>
              <p className="mt-1 text-sm text-ink-soft">Unique participants</p>
            </Card>
            <Card className="p-6">
              <p className="font-display text-3xl font-bold text-ink">
                {approvalRate === null ? '—' : <AnimatedCounter to={approvalRate} suffix="%" />}
              </p>
              <p className="mt-1 text-sm text-ink-soft">Approval rate among judged engagements</p>
            </Card>
          </div>

          <p className="label-mono mb-3 mt-8 text-xs text-ink-soft">GEN flows</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-6">
              <p className="font-display text-3xl font-bold text-ink">{formatGen(totalReleased)}</p>
              <p className="mt-1 text-sm text-ink-soft">Released to counterparties</p>
            </Card>
            <Card className="p-6">
              <p className="font-display text-3xl font-bold text-ink">{formatGen(totalLocked)}</p>
              <p className="mt-1 text-sm text-ink-soft">Currently locked in escrow</p>
            </Card>
            <Card className="p-6">
              <p className="font-display text-3xl font-bold text-ink">{formatGen(totalRefunded)}</p>
              <p className="mt-1 text-sm text-ink-soft">Refunded to depositors</p>
            </Card>
          </div>

          <Card className="mt-8 p-5 text-sm text-ink-soft">
            {validatorCount ?? NETWORK_REGISTRY[network].chain.defaultNumberOfInitialValidators} independent
            validators judge each verdict, reading evidence live and reaching consensus via GenLayer&apos;s
            Optimistic Democracy - not a single model, and nothing trusted at face value.{' '}
            <Link to="/docs#concepts" className="text-coral-600 underline hover:text-coral-700">
              How consensus works
            </Link>
          </Card>

          <Card className="mt-4 p-6">
            <p className="label-mono mb-4 text-xs text-ink-soft">By status</p>
            {total === 0 ? (
              <p className="text-sm text-ink-soft">No engagements yet.</p>
            ) : (
              <div className="space-y-3">
                {STATUS_ORDER.map((s) => (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-ink-soft">{STATUS_LABEL[s]}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/5">
                      <div
                        className={`h-full rounded-full ${STATUS_BAR_COLOR[s]}`}
                        style={{ width: total > 0 ? `${(counts[s] / total) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-medium text-ink">{counts[s]}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {disputeRate !== null && (
            <p className="mt-3 text-xs text-ink-soft">
              {disputeRate}% of judged engagements were disputed, rejected, or ultimately refunded after an
              unresolved rejection.
            </p>
          )}

          <div className="mt-10">
            <p className="label-mono mb-4 text-xs text-ink-soft">All engagements</p>
            {total === 0 ? (
              <p className="text-sm text-ink-soft">No engagements yet.</p>
            ) : (
              <ul className="space-y-3">
                {[...(engagements ?? [])]
                  .sort((a, b) => b.id - a.id)
                  .map((eng) => {
                    const { title } = splitTitle(eng.deliverable_spec)
                    return (
                    <li key={eng.id}>
                      <Link to={`/app/engagement/${eng.id}`}>
                        <Card interactive className="p-5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate text-lg font-semibold text-ink">
                                #{eng.id} - {title}
                              </p>
                              <p className="mt-1 text-xs text-ink-soft">
                                {formatGen(eng.amount)} &middot; deadline {formatUnixDate(eng.deadline)}
                              </p>
                              <p className="mt-1 font-mono text-xs text-ink-soft/70">
                                depositor {shortAddress(eng.depositor)} &middot; counterparty{' '}
                                {shortAddress(eng.counterparty)}
                              </p>
                            </div>
                            <StatusBadge status={eng.status} />
                          </div>
                        </Card>
                      </Link>
                    </li>
                  )})}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
