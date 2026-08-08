import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { listEngagementsFor, getEngagement } from '../lib/surety'
import { mapWithConcurrency } from '../lib/concurrency'
import { useNetwork } from '../lib/network'
import type { Engagement } from '../lib/types'
import { AddressReputation } from '../components/AddressReputation'
import { StatusBadge } from '../components/StatusBadge'
import { Card } from '../components/ui/Card'
import { EngagementCardSkeleton } from '../components/ui/Skeleton'
import { EmptyState, EmptyIcon } from '../components/ui/EmptyState'
import { formatGen, formatUnixDate, shortAddress, splitTitle } from '../lib/format'

export function Profile() {
  const { address } = useParams<{ address: string }>()
  const network = useNetwork()
  const [engagements, setEngagements] = useState<Engagement[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const valid = !!address && /^0x[a-fA-F0-9]{40}$/.test(address)

  useEffect(() => {
    if (!valid) return
    let cancelled = false
    setEngagements(null)
    setError(null)
    ;(async () => {
      try {
        const ids = await listEngagementsFor(address as `0x${string}`)
        const items = await mapWithConcurrency(ids, 1, getEngagement)
        if (!cancelled) setEngagements(items.sort((a, b) => b.id - a.id))
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load history')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address, valid, network])

  if (!valid) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24">
        <EmptyState icon={<EmptyIcon />} title="Invalid address" description="This isn't a valid wallet address." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <p className="label-mono text-xs text-coral-600">Profile</p>
      <h1 className="mt-3 truncate font-mono text-2xl font-bold tracking-tight text-ink">{address}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Public track record read live from the contract - same data behind{' '}
        <Link to="/stats" className="text-coral-600 underline hover:text-coral-700">
          Transparency
        </Link>
        , filtered to this address.
      </p>

      <div className="mt-8">
        <AddressReputation address={address as `0x${string}`} linkToProfile={false} />
      </div>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

      {engagements === null && !error && (
        <div className="mt-8 space-y-3">
          <EngagementCardSkeleton />
          <EngagementCardSkeleton />
        </div>
      )}

      {engagements !== null && engagements.length === 0 && (
        <div className="mt-8">
          <EmptyState icon={<EmptyIcon />} title="No engagements yet" description="This address hasn't been party to any engagement." />
        </div>
      )}

      {engagements !== null && engagements.length > 0 && (
        <ul className="mt-8 space-y-3">
          {engagements.map((eng) => {
            const role = eng.depositor.toLowerCase() === address!.toLowerCase() ? 'Depositor' : 'Counterparty'
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
                          {role}
                        </span>
                        <p className="truncate text-lg font-semibold text-ink">
                          #{eng.id} - {title}
                        </p>
                        <p className="mt-1 text-xs text-ink-soft">
                          {formatGen(eng.amount)} &middot; deadline {formatUnixDate(eng.deadline)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-ink-soft/70">
                          with {shortAddress(role === 'Depositor' ? eng.counterparty : eng.depositor)}
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
      )}
    </div>
  )
}
