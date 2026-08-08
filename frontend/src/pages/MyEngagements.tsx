import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '../lib/wallet'
import { listEngagementsFor, getEngagement } from '../lib/surety'
import { markAllSeen } from '../lib/activity'
import { mapWithConcurrency } from '../lib/concurrency'
import { useNetwork } from '../lib/network'
import type { Engagement, StatusValue } from '../lib/types'
import { STATUS_LABEL } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { EmptyState, EmptyIcon } from '../components/ui/EmptyState'
import { EngagementCardSkeleton } from '../components/ui/Skeleton'
import { IconArrowRight } from '../components/icons'
import { formatGen, formatUnixDate, shortAddress, splitTitle } from '../lib/format'

const STATUS_FILTERS: Array<StatusValue | 'all'> = [
  'all',
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

export function MyEngagements() {
  const { address, connect } = useWallet()
  const network = useNetwork()
  const [engagements, setEngagements] = useState<Engagement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusValue | 'all'>('all')

  useEffect(() => {
    if (!address) {
      setEngagements(null)
      return
    }
    let cancelled = false
    setEngagements(null)
    setError(null)
    ;(async () => {
      try {
        const ids = await listEngagementsFor(address)
        const items = await mapWithConcurrency(ids, 1, getEngagement)
        markAllSeen(address, items)
        if (!cancelled) setEngagements(items.sort((a, b) => b.id - a.id))
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load engagements')
      }
    })()
    return () => {
      cancelled = true
    }
    // network is a dependency so switching networks re-fetches against the newly selected contract
  }, [address, network])

  const filtered = useMemo(() => {
    if (!engagements) return null
    const q = query.trim().toLowerCase()
    return engagements.filter((eng) => {
      if (statusFilter !== 'all' && eng.status !== statusFilter) return false
      if (!q) return true
      return (
        eng.deliverable_spec.toLowerCase().includes(q) ||
        String(eng.id).includes(q) ||
        eng.depositor.toLowerCase().includes(q) ||
        eng.counterparty.toLowerCase().includes(q)
      )
    })
  }, [engagements, query, statusFilter])

  if (!address) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24">
        <EmptyState
          icon={<EmptyIcon />}
          title="Connect your wallet"
          description="Connect a wallet to see engagements where you're the depositor or counterparty."
          action={<Button onClick={connect}>Connect Wallet</Button>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">My Engagements</h1>
        <Link to="/app/create">
          <Button icon={<IconArrowRight width={16} height={16} />}>Create Engagement</Button>
        </Link>
      </div>

      {engagements !== null && engagements.length > 0 && (
        <div className="mb-8 space-y-3">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by spec, id, or address..."
          />
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`label-mono rounded-full border px-3.5 py-1.5 text-[11px] transition-colors ${
                  statusFilter === s ? 'border-ink bg-ink text-paper' : 'border-ink/10 text-ink-soft hover:border-ink/25'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {engagements === null && !error && (
        <div className="space-y-3">
          <EngagementCardSkeleton />
          <EngagementCardSkeleton />
        </div>
      )}

      {engagements !== null && engagements.length === 0 && (
        <EmptyState
          icon={<EmptyIcon />}
          title="No engagements yet"
          description="Create one to lock a deposit against a deliverable spec."
          action={
            <Link to="/app/create">
              <Button>Create your first engagement</Button>
            </Link>
          }
        />
      )}

      {engagements !== null && engagements.length > 0 && filtered?.length === 0 && (
        <EmptyState icon={<EmptyIcon />} title="No matches" description="Try a different search or status filter." />
      )}

      <ul className="space-y-3">
        {filtered?.map((eng) => {
          const role = eng.depositor.toLowerCase() === address.toLowerCase() ? 'Depositor' : 'Counterparty'
          const { title } = splitTitle(eng.deliverable_spec)
          return (
            <li key={eng.id}>
              <Link to={`/app/engagement/${eng.id}`}>
                <Card interactive className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <span
                        className={`label-mono mb-1.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] ${
                          role === 'Depositor' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {role === 'Depositor' ? 'You created this' : "You're the counterparty"}
                      </span>
                      <p className="truncate text-lg font-semibold text-ink">
                        #{eng.id} - {title}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {formatGen(eng.amount)} &middot; deadline {formatUnixDate(eng.deadline)}
                      </p>
                      <p className="mt-1 font-mono text-xs text-ink-soft/70">
                        depositor {shortAddress(eng.depositor)} &middot; counterparty {shortAddress(eng.counterparty)}
                      </p>
                    </div>
                    <StatusBadge status={eng.status} />
                  </div>
                </Card>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
