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
import { EmptyState, EmptyIcon } from '../components/ui/EmptyState'
import { formatGen, formatUnixDate, shortAddress, splitTitle } from '../lib/format'

const STATUS_ORDER: StatusValue[] = [
  'created',
  'accepted',
  'submitted',
  'disputed',
  'released',
  'rejected',
  'declined',
  'expired',
  'refunded',
]
const LOCKED_STATUSES: StatusValue[] = ['created', 'accepted', 'submitted', 'disputed', 'rejected']
const REFUNDED_STATUSES: StatusValue[] = ['declined', 'expired', 'refunded']

// Status is a fixed, reserved palette (good/warning/critical/neutral), not an
// open categorical set - kept identical to StatusBadge.tsx's mapping
// everywhere else in the app so a segment here always means the same color
// it does on a badge. In-progress states step through a neutral ramp;
// released is the one "good" outcome; rejected is the one "critical" one;
// disputed is the contested/warning state; the three ways an engagement
// closes without payment share a single muted tone.
const STATUS_FILL: Record<StatusValue, string> = {
  created: 'bg-ink/25',
  accepted: 'bg-sky-400',
  submitted: 'bg-violet-400',
  disputed: 'bg-coral-400',
  released: 'bg-emerald-400',
  rejected: 'bg-red-400',
  declined: 'bg-ink/12',
  expired: 'bg-ink/12',
  refunded: 'bg-ink/12',
}

function pct(part: number | bigint, whole: number | bigint): number {
  const p = typeof part === 'bigint' ? Number(part) : part
  const w = typeof whole === 'bigint' ? Number(whole) : whole
  return w > 0 ? (p / w) * 100 : 0
}

/** A single part-to-whole horizontal bar, gapped and end-rounded per the
 * dataviz mark spec, with a per-segment hover tooltip - the tooltip is a
 * convenience, every value it shows also lives in the legend below. */
function PartToWholeBar({
  segments,
}: {
  segments: { key: string; widthPct: number; fill: string; label: string; valueLabel: string }[]
}) {
  const visible = segments.filter((s) => s.widthPct > 0)
  if (visible.length === 0) {
    return <div className="h-3 w-full rounded-[4px] bg-ink/5" />
  }
  return (
    <div className="flex h-3 w-full gap-[2px]">
      {visible.map((s, i) => (
        <div
          key={s.key}
          className="group/seg relative h-full"
          style={{ width: `${s.widthPct}%`, minWidth: s.widthPct > 0 ? '3px' : 0 }}
        >
          <div
            className={`h-full w-full ${s.fill} transition-[filter] duration-150 group-hover/seg:brightness-110 ${
              i === 0 ? 'rounded-l-[4px]' : ''
            } ${i === visible.length - 1 ? 'rounded-r-[4px]' : ''}`}
          />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs opacity-0 shadow-lg transition-opacity duration-150 group-hover/seg:opacity-100">
            <span className="font-semibold text-paper">{s.valueLabel}</span>{' '}
            <span className="text-paper/70">{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function LegendSwatch({ fill }: { fill: string }) {
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${fill}`} />
}

function StatTile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <Card className="p-6">
      <p className="font-display text-3xl font-bold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-sm text-ink-soft">{label}</p>
    </Card>
  )
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

  const uniqueParticipants = new Set(
    (engagements ?? []).flatMap((e) => [e.depositor.toLowerCase(), e.counterparty.toLowerCase()]),
  ).size

  const flowSegments = [
    { key: 'released', widthPct: pct(totalReleased, totalVolume), fill: 'bg-emerald-400', label: 'released', valueLabel: formatGen(totalReleased) },
    { key: 'locked', widthPct: pct(totalLocked, totalVolume), fill: 'bg-sky-400', label: 'locked in escrow', valueLabel: formatGen(totalLocked) },
    { key: 'refunded', widthPct: pct(totalRefunded, totalVolume), fill: 'bg-ink/20', label: 'refunded', valueLabel: formatGen(totalRefunded) },
  ]

  const statusSegments = STATUS_ORDER.map((s) => ({
    key: s,
    widthPct: pct(counts[s], total),
    fill: STATUS_FILL[s],
    label: STATUS_LABEL[s].toLowerCase(),
    valueLabel: String(counts[s]),
  }))

  const validatorsShown = validatorCount ?? NETWORK_REGISTRY[network].chain.defaultNumberOfInitialValidators

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-coral-500" />
        </span>
        <p className="label-mono text-xs text-coral-600">Live on {NETWORK_REGISTRY[network].label}</p>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Transparency</h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Every figure below is read live from the contract at request time - nothing aggregated, cached, or computed
        off-chain.
      </p>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {engagements === null && !error && (
        <div className="mt-10 space-y-8">
          <Skeleton className="h-24 w-72 rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      )}

      {engagements !== null && (
        <>
          {/* Hero figure - the one number this dashboard leads with. */}
          <div className="mt-10">
            <p className="label-mono text-xs text-ink-soft">Total volume processed</p>
            <p className="mt-2 font-sans text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
              {total === 0 ? '0 GEN' : formatGen(totalVolume)}
            </p>
            <p className="mt-2 text-sm text-ink-soft">
              across {total} engagement{total === 1 ? '' : 's'} since launch
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile value={<AnimatedCounter to={total} />} label="Total engagements" />
            <StatTile value={<AnimatedCounter to={uniqueParticipants} />} label="Unique participants" />
            <StatTile
              value={approvalRate === null ? '—' : <AnimatedCounter to={approvalRate} suffix="%" />}
              label="Approval rate"
            />
            <StatTile value={<AnimatedCounter to={validatorsShown} />} label="Validators per verdict" />
          </div>

          {/* GEN flow - part-to-whole of the total volume above. */}
          <Card className="mt-8 p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <p className="label-mono text-xs text-ink-soft">GEN flows</p>
              <p className="text-xs text-ink-soft/70">share of total volume</p>
            </div>
            <PartToWholeBar segments={flowSegments} />
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {flowSegments.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-sm">
                  <LegendSwatch fill={s.fill} />
                  <span className="tabular-nums font-medium text-ink">{s.valueLabel}</span>
                  <span className="text-ink-soft">{s.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Status distribution - a fixed, reserved status palette, not an open categorical set. */}
          <Card className="mt-4 p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <p className="label-mono text-xs text-ink-soft">By status</p>
              <p className="text-xs text-ink-soft/70">{total} total</p>
            </div>
            {total === 0 ? (
              <p className="text-sm text-ink-soft">No engagements yet.</p>
            ) : (
              <>
                <PartToWholeBar segments={statusSegments} />
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                  {statusSegments.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 text-sm">
                      <LegendSwatch fill={s.fill} />
                      <span className="capitalize text-ink-soft">{s.label}</span>
                      <span className="tabular-nums font-medium text-ink">{s.valueLabel}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card className="mt-4 p-5 text-sm text-ink-soft">
            <span className="font-medium text-ink">{validatorsShown} independent validators</span> judge each
            verdict, reading evidence live and reaching consensus via GenLayer&apos;s Optimistic Democracy - not a
            single model, and nothing trusted at face value.{' '}
            <Link to="/docs#concepts" className="text-coral-600 underline hover:text-coral-700">
              How consensus works
            </Link>
          </Card>

          {/* Full record - every engagement, reachable without hovering anything above. */}
          <div className="mt-10">
            <p className="label-mono mb-4 text-xs text-ink-soft">All engagements</p>
            {total === 0 ? (
              <EmptyState icon={<EmptyIcon />} title="No engagements yet" description="The first one will show up here." />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink/8 text-xs text-ink-soft">
                        <th className="label-mono px-5 py-3 font-medium">ID</th>
                        <th className="label-mono px-5 py-3 font-medium">Title</th>
                        <th className="label-mono px-5 py-3 text-right font-medium">Amount</th>
                        <th className="label-mono px-5 py-3 font-medium">Parties</th>
                        <th className="label-mono px-5 py-3 font-medium">Deadline</th>
                        <th className="label-mono px-5 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...engagements]
                        .sort((a, b) => b.id - a.id)
                        .map((eng) => {
                          const { title } = splitTitle(eng.deliverable_spec)
                          return (
                            <tr key={eng.id} className="border-b border-ink/6 transition-colors last:border-0 hover:bg-ink/[0.02]">
                              <td className="px-5 py-3 align-middle">
                                <Link
                                  to={`/app/engagement/${eng.id}`}
                                  className="font-mono text-xs text-ink-soft hover:text-coral-600"
                                >
                                  #{eng.id}
                                </Link>
                              </td>
                              <td className="px-5 py-3 align-middle">
                                <Link
                                  to={`/app/engagement/${eng.id}`}
                                  className="max-w-[220px] truncate font-medium text-ink hover:text-coral-600"
                                >
                                  {title}
                                </Link>
                              </td>
                              <td className="px-5 py-3 text-right align-middle tabular-nums text-ink">
                                {formatGen(eng.amount)}
                              </td>
                              <td className="px-5 py-3 align-middle font-mono text-xs text-ink-soft/80">
                                {shortAddress(eng.depositor)} &rarr; {shortAddress(eng.counterparty)}
                              </td>
                              <td className="px-5 py-3 align-middle text-xs text-ink-soft">
                                {formatUnixDate(eng.deadline)}
                              </td>
                              <td className="px-5 py-3 align-middle">
                                <StatusBadge status={eng.status} />
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}
