import { useEffect, useState } from 'react'
import type { TransactionHash } from 'genlayer-js/types'
import { getReadClient, TransactionStatus } from '../lib/genlayer-client'
import { getActiveChain } from '../lib/network'
import { Button } from './ui/Button'

export type TxLifecycle = 'pending' | 'confirming' | 'confirmed' | 'reverted' | 'no_verdict' | 'unresolved'

interface Props {
  hash: `0x${string}` | null
  onSettled?: (ok: boolean) => void
  /** How long to keep polling before showing "still processing" instead of
   * a false "failed". request_release needs much longer than a plain write -
   * judgment involves 5 validators independently fetching evidence and
   * calling an LLM, and can take several minutes under load or after a
   * validator round times out and retries internally. */
  budgetMs?: number
}

const DEFAULT_BUDGET_MS = 5 * 60 * 1000

// GenLayer's own consensus round can end without ever producing a verdict -
// a leader or validator set that doesn't respond in time, most commonly.
// genlayer-js treats these as "decided" (waitForTransactionReceipt returns
// them normally, not as an error), so they have to be checked for explicitly
// rather than assumed to mean success just because no exception was thrown.
const NO_VERDICT_STATUSES = new Set(['LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT', 'UNDETERMINED', 'CANCELED'])

const LABEL: Record<TxLifecycle, string> = {
  pending: 'Submitting transaction...',
  confirming: 'Waiting for validator consensus...',
  confirmed: 'Confirmed',
  reverted: 'Transaction failed',
  no_verdict: 'No verdict reached',
  unresolved: 'Still processing',
}

export function explorerUrl(hash: string): string {
  return `${getActiveChain().blockExplorers?.default.url ?? ''}/tx/${hash}`
}

export function explorerAddressUrl(address: string): string {
  return `${getActiveChain().blockExplorers?.default.url ?? ''}/address/${address}`
}

/** genlayer-js's waitForTransactionReceipt only ever throws for two reasons:
 * it gave up polling before the target status was reached, or a read
 * request itself failed (rate limit, network blip). It never throws to
 * signal a genuine on-chain failure - that's only ever knowable from a
 * successfully-returned receipt's execution result. So any exception here
 * just means "try again", never "this failed" - we keep re-polling in short
 * chunks until either a real receipt comes back or the whole budget runs out.
 *
 * Waits for FINALIZED, not ACCEPTED - ACCEPTED means validator consensus
 * landed, but a contract read (get_engagement etc.) isn't guaranteed to
 * reflect the write until it's actually finalized. Settling for ACCEPTED
 * here meant onSettled fired - and the page refetched - before the new
 * state was reliably queryable, so callers like Accept/Decline showed a
 * "Confirmed" checkmark while the page kept displaying the pre-transaction
 * status forever (no retry after that one early refetch). */
async function waitResilient(hash: TransactionHash, budgetMs: number) {
  const deadline = Date.now() + budgetMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      return await getReadClient().waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        retries: 5,
        interval: 3000,
      })
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error('Still processing - check back in a few minutes.')
}

function evaluateReceipt(receipt: any): { state: 'confirmed' | 'reverted' | 'no_verdict'; message: string | null } {
  const statusName = receipt?.status_name ?? receipt?.statusName
  if (NO_VERDICT_STATUSES.has(statusName)) {
    return {
      state: 'no_verdict',
      message: `Validators didn't reach a verdict this round (${statusName.replace(/_/g, ' ').toLowerCase()}) - a known, retryable network condition, not a rejection. Try again.`,
    }
  }
  const execResult = receipt?.txExecutionResultName ?? receipt?.tx_execution_result_name
  if (execResult === 'FINISHED_WITH_ERROR') {
    return { state: 'reverted', message: 'Contract execution reverted - see the transaction in the explorer for details.' }
  }
  return { state: 'confirmed', message: null }
}

export function TxStatus({ hash, onSettled, budgetMs = DEFAULT_BUDGET_MS }: Props) {
  const [state, setState] = useState<TxLifecycle>('pending')
  const [message, setMessage] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!hash) return
    let cancelled = false
    setState('confirming')
    setMessage(null)

    waitResilient(hash as TransactionHash, budgetMs)
      .then((receipt: any) => {
        if (cancelled) return
        const { state: outcome, message: msg } = evaluateReceipt(receipt)
        setState(outcome)
        setMessage(msg)
        onSettled?.(outcome === 'confirmed')
      })
      .catch(() => {
        if (cancelled) return
        setState('unresolved')
        setMessage('This is taking longer than usual - it may still complete. Check its latest status, or come back in a few minutes.')
        onSettled?.(false)
      })

    return () => {
      cancelled = true
    }
  }, [hash, budgetMs])

  async function checkNow() {
    if (!hash) return
    setChecking(true)
    try {
      const tx: any = await getReadClient().getTransaction({ hash: hash as TransactionHash })
      const statusName = tx?.statusName ?? tx?.status_name
      const isDecided = statusName === 'FINALIZED' || NO_VERDICT_STATUSES.has(statusName)
      if (isDecided) {
        const { state: outcome, message: msg } = evaluateReceipt(tx)
        setState(outcome)
        setMessage(msg)
        onSettled?.(outcome === 'confirmed')
      } else {
        setMessage(`Still ${String(statusName ?? 'pending').toLowerCase()} - check again shortly.`)
      }
    } catch (err: any) {
      setMessage(err?.message ?? 'Could not check status - try again.')
    } finally {
      setChecking(false)
    }
  }

  if (!hash) return null

  return (
    <div className="rounded-xl border border-ink/10 bg-cream p-4 text-sm">
      <div className="flex items-center gap-2">
        {(state === 'pending' || state === 'confirming') && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-coral-500 border-t-transparent" />
        )}
        {state === 'confirmed' && <span className="text-emerald-600">&#10003;</span>}
        {state === 'reverted' && <span className="text-red-600">&#10007;</span>}
        {(state === 'no_verdict' || state === 'unresolved') && <span className="text-amber-600">&#8635;</span>}
        <span className="font-medium text-ink">{LABEL[state]}</span>
      </div>
      {message && <p className={`mt-1 ${state === 'reverted' ? 'text-red-600' : 'text-ink-soft'}`}>{message}</p>}
      {state === 'unresolved' && (
        <Button size="sm" variant="secondary" loading={checking} onClick={checkNow} className="mt-2">
          Check now
        </Button>
      )}
      <a
        href={explorerUrl(hash)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block truncate font-mono text-xs text-ink-soft underline hover:text-ink"
      >
        {hash}
      </a>
    </div>
  )
}
