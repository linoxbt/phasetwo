import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '../lib/wallet'
import { listEngagementsFor, getEngagement } from '../lib/surety'
import { mapWithConcurrency } from '../lib/concurrency'
import { useNetwork } from '../lib/network'
import type { Engagement } from '../lib/types'
import { MilestonePlanCard } from '../components/MilestonePlanCard'
import { Button } from '../components/ui/Button'
import { EmptyState, EmptyIcon } from '../components/ui/EmptyState'
import { EngagementCardSkeleton } from '../components/ui/Skeleton'

export function Milestones() {
  const { address, connect } = useWallet()
  const network = useNetwork()
  const [roots, setRoots] = useState<Engagement[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) {
      setRoots(null)
      return
    }
    let cancelled = false
    setRoots(null)
    setError(null)
    ;(async () => {
      try {
        const ids = await listEngagementsFor(address)
        const items = await mapWithConcurrency(ids, 1, getEngagement)
        // A plan's root is any engagement with no parent that's either
        // itself linked-to (another item's parent_id points at it) or is
        // linked to something else (its own parent_id is set, in which case
        // the actual root is that parent).
        const rootIds = new Set<number>()
        for (const e of items) {
          if (e.parent_id) rootIds.add(e.parent_id)
        }
        const rootEngagements = items.filter((e) => rootIds.has(e.id))
        if (!cancelled) setRoots(rootEngagements.sort((a, b) => b.id - a.id))
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load milestone plans')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address, network])

  if (!address) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24">
        <EmptyState
          icon={<EmptyIcon />}
          title="Connect your wallet"
          description="Connect a wallet to see your milestone plans."
          action={<Button onClick={connect}>Connect Wallet</Button>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="label-mono text-xs text-coral-600">Milestones</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">Your milestone plans</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Deposits you split into installments - each one is a fully independent engagement.
          </p>
        </div>
        <Link to="/app/create">
          <Button size="sm">Create a plan</Button>
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {roots === null && !error && (
        <div className="space-y-3">
          <EngagementCardSkeleton />
          <EngagementCardSkeleton />
        </div>
      )}

      {roots !== null && roots.length === 0 && (
        <EmptyState
          icon={<EmptyIcon />}
          title="No milestone plans yet"
          description="Split a deposit into installments when creating an engagement."
          action={
            <Link to="/app/create">
              <Button>Create Engagement</Button>
            </Link>
          }
        />
      )}

      <div className="space-y-6">
        {roots?.map((root) => <MilestonePlanCard key={root.id} engagement={root} />)}
      </div>
    </div>
  )
}
