import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '../lib/wallet'
import { listEngagementsFor, getEngagement } from '../lib/surety'
import { markAllSeen, getNotificationLog, clearNotificationLog, isNotificationRead, type NotificationEntry } from '../lib/activity'
import { mapWithConcurrency } from '../lib/concurrency'
import { useNetwork } from '../lib/network'
import { STATUS_LABEL, type StatusValue } from '../lib/types'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState, EmptyIcon } from '../components/ui/EmptyState'

export function Notifications() {
  const { address, connect } = useWallet()
  const network = useNetwork()
  const [log, setLog] = useState<NotificationEntry[]>([])
  const [readState, setReadState] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (!address) return
    setLog(getNotificationLog(address))
    // Opening the inbox is what clears the badge, same as visiting My
    // Engagements - fetch current statuses so "read" reflects reality even
    // for changes that happened while this tab was closed.
    ;(async () => {
      try {
        const ids = await listEngagementsFor(address)
        const items = await mapWithConcurrency(ids, 1, getEngagement)
        markAllSeen(address, items)
      } catch {
        // best-effort - the log still renders from what's already stored
      } finally {
        const entries = getNotificationLog(address)
        setLog(entries)
        setReadState(Object.fromEntries(entries.map((e, i) => [i, isNotificationRead(address, e)])))
      }
    })()
  }, [address, network])

  function handleClear() {
    if (!address) return
    clearNotificationLog(address)
    setLog([])
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <EmptyState
          icon={<EmptyIcon />}
          title="Connect your wallet"
          description="Connect a wallet to see your notification history."
          action={<Button onClick={connect}>Connect Wallet</Button>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="label-mono text-xs text-coral-600">Notifications</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">History</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Every status change on your engagements, most recent first - stored on this device only.
          </p>
        </div>
        {log.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Clear history
          </Button>
        )}
      </div>

      {log.length === 0 ? (
        <EmptyState icon={<EmptyIcon />} title="Nothing yet" description="Status changes on your engagements will show up here." />
      ) : (
        <ul className="space-y-3">
          {log.map((entry, i) => {
            const label = STATUS_LABEL[entry.status as StatusValue] ?? entry.status
            const read = readState[i] ?? true
            return (
              <li key={`${entry.engagementId}-${entry.timestamp}`}>
                <Link to={`/app/engagement/${entry.engagementId}`}>
                  <Card interactive className="flex items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {!read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500" />}
                      <div className="min-w-0">
                        <p className={`truncate text-sm ${read ? 'text-ink-soft' : 'font-medium text-ink'}`}>
                          #{entry.engagementId}
                          {entry.title ? ` - ${entry.title}` : ''}
                        </p>
                        <p className="text-xs text-ink-soft/70">now {label.toLowerCase()}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-ink-soft/60">{new Date(entry.timestamp).toLocaleString()}</span>
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
