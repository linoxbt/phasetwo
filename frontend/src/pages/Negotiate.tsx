import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '../lib/wallet'
import { listEngagementsFor, getEngagement } from '../lib/surety'
import { mapWithConcurrency } from '../lib/concurrency'
import { useNetwork } from '../lib/network'
import { useSecureMessaging, tryDecryptComment } from '../lib/commentCrypto'
import type { Engagement } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState, EmptyIcon } from '../components/ui/EmptyState'
import { shortAddress, formatUnixDate, splitTitle, parseSpec } from '../lib/format'

interface Suggestion {
  engagement: Engagement
  author: `0x${string}`
  text: string
  createdAt: number
}

export function Negotiate() {
  const { address, provider, connect } = useWallet()
  const network = useNetwork()
  const { keypair, unlocking, error: unlockError, unlock } = useSecureMessaging(address, provider)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address || !keypair) {
      setSuggestions(null)
      return
    }
    let cancelled = false
    setSuggestions(null)
    setError(null)
    ;(async () => {
      try {
        const ids = await listEngagementsFor(address)
        const items = await mapWithConcurrency(ids, 1, getEngagement)
        const found: Suggestion[] = []
        for (const eng of items) {
          const role: 'depositor' | 'counterparty' =
            eng.depositor.toLowerCase() === address.toLowerCase() ? 'depositor' : 'counterparty'
          for (const c of eng.comments) {
            const decoded = tryDecryptComment(c.text, keypair.secretKeyHex, role)
            if (decoded.kind === 'suggestion') {
              found.push({ engagement: eng, author: c.author, text: decoded.plaintext, createdAt: c.created_at })
            }
          }
        }
        found.sort((a, b) => b.createdAt - a.createdAt)
        if (!cancelled) setSuggestions(found)
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load negotiations')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address, keypair, network])

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <EmptyState
          icon={<EmptyIcon />}
          title="Connect your wallet"
          description="Connect a wallet to see suggested changes on your engagements."
          action={<Button onClick={connect}>Connect Wallet</Button>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="label-mono text-xs text-coral-600">Negotiate</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">Suggested changes</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Every "suggest changes" comment you&apos;ve posted or received, across every engagement - each one is a
        private, end-to-end encrypted message, only decryptable by you.
      </p>

      {!keypair ? (
        <Card className="mt-6 p-5 text-sm">
          <p className="mb-3 text-ink-soft">
            Suggestions live inside encrypted comment threads. Enable secure messaging with your wallet to decrypt
            and see them here.
          </p>
          <Button size="sm" variant="secondary" loading={unlocking} onClick={unlock}>
            Enable secure messaging
          </Button>
          {unlockError && <p className="mt-2 text-sm text-red-600">{unlockError}</p>}
        </Card>
      ) : (
        <div className="mt-6">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {suggestions === null && !error && <p className="text-sm text-ink-soft">Loading...</p>}
          {suggestions !== null && suggestions.length === 0 && (
            <EmptyState
              icon={<EmptyIcon />}
              title="Nothing here yet"
              description="Suggested changes on your engagements will show up here."
            />
          )}
          <ul className="space-y-3">
            {suggestions?.map((s, i) => {
              const { title } = splitTitle(s.engagement.deliverable_spec)
              const isDepositor = s.engagement.depositor.toLowerCase() === address.toLowerCase()
              return (
                <li key={i}>
                  <Card className="p-5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/app/engagement/${s.engagement.id}`}
                        className="text-sm font-semibold text-ink underline decoration-ink/20 hover:text-coral-600 hover:decoration-coral-600"
                      >
                        #{s.engagement.id} - {title}
                      </Link>
                      <StatusBadge status={s.engagement.status} />
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-ink">{s.text}</p>
                    <p className="mt-2 text-xs text-ink-soft/70">
                      {shortAddress(s.author)} &middot; {formatUnixDate(s.createdAt)}
                    </p>
                    {isDepositor && s.engagement.status === 'created' && (
                      <Link
                        to="/app/create"
                        state={{
                          prefill: {
                            counterparty: s.engagement.counterparty,
                            ...parseSpec(s.engagement.deliverable_spec),
                          },
                        }}
                        className="mt-3 inline-block text-xs text-coral-600 underline hover:text-coral-700"
                      >
                        Recreate this engagement with new terms
                      </Link>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
