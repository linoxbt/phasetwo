import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listEngagementsFor, getEngagement } from '../lib/surety'
import { mapWithConcurrency } from '../lib/concurrency'
import { useNetwork } from '../lib/network'
import type { Engagement } from '../lib/types'
import { formatGen, splitTitle } from '../lib/format'
import { StatusBadge } from './StatusBadge'
import { Card } from './ui/Card'

/** Shows when `engagement` is part of a milestone plan (its own parent_id
 * is set, or another engagement links to it as parent) - siblings share
 * depositor+counterparty, so listing the depositor's engagements and
 * filtering client-side finds them without any new contract method.
 * Renders nothing if the engagement isn't part of a multi-engagement plan. */
export function MilestonePlanCard({ engagement }: { engagement: Engagement }) {
  const network = useNetwork()
  const [siblings, setSiblings] = useState<Engagement[] | null>(null)
  // Separate from siblings===null, which also means the ordinary "not part
  // of a plan" case - conflating the two would either hide a real fetch
  // failure or spam an error banner on every standalone engagement.
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSiblings(null)
    setError(false)
    ;(async () => {
      try {
        const ids = await listEngagementsFor(engagement.depositor)
        const items = await mapWithConcurrency(ids, 1, getEngagement)
        const rootId = engagement.parent_id || engagement.id
        const plan = items.filter((e) => e.id === rootId || e.parent_id === rootId)
        if (!cancelled) setSiblings(plan.length > 1 ? plan.sort((a, b) => a.id - b.id) : null)
      } catch {
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [engagement.depositor, engagement.id, engagement.parent_id, network])

  // This engagement explicitly claims to be part of a plan (a non-zero
  // parent_id, or something else already pointed at it as one) - a failed
  // lookup here is worth surfacing, unlike for a genuinely standalone
  // engagement where silence is the correct, common-case rendering.
  if (error && engagement.parent_id !== 0) {
    return (
      <Card className="mt-8 p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">Milestone plan</h2>
        <p className="text-sm text-ink-soft">Couldn&apos;t load the rest of this plan - try again shortly.</p>
      </Card>
    )
  }

  if (!siblings) return null

  const releasedCount = siblings.filter((s) => s.status === 'released').length
  const releasedTotal = siblings.filter((s) => s.status === 'released').reduce((sum, s) => sum + s.amount, 0n)
  const grandTotal = siblings.reduce((sum, s) => sum + s.amount, 0n)

  return (
    <Card className="mt-8 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Milestone plan</h2>
        <span className="text-xs text-ink-soft">
          {releasedCount}/{siblings.length} released &middot; {formatGen(releasedTotal)} of {formatGen(grandTotal)}
        </span>
      </div>
      <ul className="space-y-2">
        {siblings.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
            {s.id === engagement.id ? (
              <span className="font-medium text-ink">
                #{s.id} - {splitTitle(s.deliverable_spec).title} (this one)
              </span>
            ) : (
              <Link to={`/app/engagement/${s.id}`} className="text-coral-600 underline hover:text-coral-700">
                #{s.id} - {splitTitle(s.deliverable_spec).title}
              </Link>
            )}
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-ink-soft">{formatGen(s.amount)}</span>
              <StatusBadge status={s.status} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
