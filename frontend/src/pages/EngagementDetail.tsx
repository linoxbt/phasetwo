import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { TransactionHash } from 'genlayer-js/types'
import type { EIP1193Provider } from 'viem'
import { formatEther } from 'viem'
import { useWallet } from '../lib/wallet'
import {
  getEngagement,
  acceptEngagement,
  declineEngagement,
  submitDeliverable,
  requestRelease,
  raiseDispute,
  refundExpired,
  settleRejected,
  getAppealWindowSeconds,
  addComment,
  getPubkey,
} from '../lib/surety'
import { getReadClient } from '../lib/genlayer-client'
import { getLastJudgmentTx } from '../lib/judgmentTx'
import { deriveKeypair, ensureRegistered, encryptComment, tryDecryptComment, useSecureMessaging } from '../lib/commentCrypto'
import { AddressReputation } from '../components/AddressReputation'
import { MilestonePlanCard } from '../components/MilestonePlanCard'
import { withRetry } from '../lib/retry'
import { useNetwork, getActiveChain } from '../lib/network'
import { markSeen } from '../lib/activity'
import type { Comment, Engagement, StatusValue } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { TxStatus, explorerUrl, explorerAddressUrl } from '../components/TxStatus'
import { getContractAddress } from '../lib/genlayer-client'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Textarea } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Skeleton } from '../components/ui/Skeleton'
import { IconScale } from '../components/icons'
import { formatGen, formatUnixDate, isPast, shortAddress, splitTitle, parseSpec, appealWindowStatus } from '../lib/format'


export function EngagementDetail() {
  const { id } = useParams<{ id: string }>()
  const engagementId = Number(id)
  const { address, provider } = useWallet()
  const network = useNetwork()

  const [eng, setEng] = useState<Engagement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null)
  const [lastReleaseTx, setLastReleaseTx] = useState<`0x${string}` | null>(null)
  const [isJudging, setIsJudging] = useState(false)
  const [canAppeal, setCanAppeal] = useState(false)
  const [appealWindowSeconds, setAppealWindowSeconds] = useState<number | null>(null)
  const [suggestingChange, setSuggestingChange] = useState(false)

  // Protocol-level appeals only exist where the chain configures an appeals
  // contract (Asimov Testnet) - Studio Network has none, and genlayer-js's
  // canAppeal() unconditionally throws rather than returning false there.
  const chainSupportsAppeals = Boolean((getActiveChain() as any).appealsContract?.address)

  const refresh = useCallback(async () => {
    if (!Number.isInteger(engagementId) || engagementId <= 0) {
      setLoadError('Invalid engagement id.')
      return
    }
    try {
      const data = await getEngagement(engagementId)
      setEng(data)
      setLoadError(null)
      if (address) markSeen(address, data.id, data.status)
    } catch {
      setLoadError(`Engagement #${engagementId} doesn't exist (or hasn't been indexed yet).`)
    }
    // network is a dependency so switching networks re-fetches against the newly selected contract
  }, [engagementId, address, network])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!lastReleaseTx || !chainSupportsAppeals) {
      setCanAppeal(false)
      return
    }
    withRetry(() => getReadClient().canAppeal({ txId: lastReleaseTx as TransactionHash }))
      .then(setCanAppeal)
      .catch(() => setCanAppeal(false))
  }, [lastReleaseTx, chainSupportsAppeals])

  // Reconstructs the judgment tx purely from chain state, so the appeal box
  // still works after a reload or for the party who didn't trigger the
  // judgment themselves - not just the browser session that just ran it.
  useEffect(() => {
    if (!eng || !chainSupportsAppeals) return
    if (!['rejected', 'disputed', 'released'].includes(eng.status)) return
    let cancelled = false
    getLastJudgmentTx(eng.id).then((hash) => {
      if (!cancelled && hash) setLastReleaseTx(hash)
    })
    return () => {
      cancelled = true
    }
  }, [eng?.id, eng?.status, network, chainSupportsAppeals])

  useEffect(() => {
    getAppealWindowSeconds()
      .then(setAppealWindowSeconds)
      .catch(() => setAppealWindowSeconds(null))
  }, [network])

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-sm text-red-600">{loadError}</p>
      </div>
    )
  }
  if (!eng) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-6 py-12">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    )
  }

  const isDepositor = address?.toLowerCase() === eng.depositor.toLowerCase()
  const isCounterparty = address?.toLowerCase() === eng.counterparty.toLowerCase()
  const isParty = isDepositor || isCounterparty

  function onSettled(ok: boolean, opts?: { isRelease?: boolean; hash?: `0x${string}` }) {
    if (ok && opts?.isRelease && opts.hash) setLastReleaseTx(opts.hash)
    if (opts?.isRelease) setIsJudging(false)
    // Always refetch, even on failure/unresolved - a fresh read shows the
    // true on-chain state regardless of whether the client-side wait above
    // itself succeeded, which matters most for the "still processing"
    // outcome where the judgment may complete after the client gave up
    // watching it.
    refresh()
    setPendingTx(null)
  }

  const { title, description } = splitTitle(eng.deliverable_spec)
  const rejectedWindow =
    eng.status === 'rejected' && appealWindowSeconds !== null
      ? appealWindowStatus(eng.rejected_at, appealWindowSeconds)
      : null

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="label-mono mb-1 text-xs text-ink-soft/70">Engagement #{eng.id}</p>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
        <StatusBadge status={eng.status} judging={isJudging} />
      </div>
      <p className="mb-4 text-sm text-ink-soft">
        <span className="font-mono text-ink">{shortAddress(eng.depositor)}</span> (depositor) is paying{' '}
        <span className="font-mono text-ink">{shortAddress(eng.counterparty)}</span> (counterparty) to deliver this.
      </p>
      {description && <p className="mb-8 whitespace-pre-wrap text-ink-soft">{description}</p>}

      <Timeline status={eng.status} judging={isJudging} />

      <Card className="mt-8 grid grid-cols-2 gap-y-3 p-5 text-sm">
        <dt className="text-ink-soft">Depositor</dt>
        <dd className="font-mono text-ink">
          <a
            href={explorerAddressUrl(eng.depositor)}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-ink/20 hover:text-coral-600 hover:decoration-coral-600"
          >
            {shortAddress(eng.depositor)}
          </a>
        </dd>
        <dt className="text-ink-soft">Counterparty</dt>
        <dd className="font-mono text-ink">
          <a
            href={explorerAddressUrl(eng.counterparty)}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-ink/20 hover:text-coral-600 hover:decoration-coral-600"
          >
            {shortAddress(eng.counterparty)}
          </a>
        </dd>
        <dt className="text-ink-soft">Deposit</dt>
        <dd className="text-ink">{formatGen(eng.amount)}</dd>
        <dt className="text-ink-soft">Deadline</dt>
        <dd
          className={
            isPast(eng.deadline) && (eng.status === 'created' || eng.status === 'accepted')
              ? 'text-coral-600'
              : 'text-ink'
          }
        >
          {formatUnixDate(eng.deadline)}
        </dd>
        <dt className="text-ink-soft">Dispute round</dt>
        <dd className="text-ink">{eng.dispute_round}</dd>
        <dt className="text-ink-soft">Contract</dt>
        <dd className="font-mono text-ink">
          <a
            href={explorerAddressUrl(getContractAddress())}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-ink/20 hover:text-coral-600 hover:decoration-coral-600"
          >
            {shortAddress(getContractAddress())} &#8599;
          </a>
        </dd>
      </Card>

      <MilestonePlanCard engagement={eng} />

      {isParty && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            {isDepositor ? "Counterparty's" : "Depositor's"} track record
          </h2>
          <AddressReputation address={isDepositor ? eng.counterparty : eng.depositor} />
        </div>
      )}

      {eng.evidence_urls.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">Evidence</h2>
          <ul className="space-y-1">
            {eng.evidence_urls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm text-coral-600 underline hover:text-coral-700">
                  {url}
                </a>
              </li>
            ))}
          </ul>
          {eng.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{eng.notes}</p>}
        </div>
      )}

      {eng.decision_reasoning && (
        <div className="mt-8 rounded-2xl border border-coral-500/20 bg-coral-500/[0.06] p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-coral-600">
            Validator judgment reasoning
          </h2>
          <p className="whitespace-pre-wrap text-sm text-ink">{eng.decision_reasoning}</p>
        </div>
      )}

      <CommentThread
        comments={eng.comments}
        isParty={isParty}
        address={address}
        provider={provider}
        engagementId={eng.id}
        depositor={eng.depositor}
        counterparty={eng.counterparty}
        forceSuggestion={suggestingChange}
        onSuggestionConsumed={() => setSuggestingChange(false)}
        onSettled={(ok) => {
          if (ok) refresh()
        }}
      />

      {!isParty && address && <p className="mt-8 text-sm text-ink-soft">You are not a party to this engagement.</p>}

      {isCounterparty && provider && eng.status === 'created' && (
        <AcceptDeclineActions
          address={address!}
          provider={provider}
          engagementId={eng.id}
          onSettled={(ok) => onSettled(ok)}
          onSuggestChange={() => {
            setSuggestingChange(true)
            document.getElementById('comment-compose')?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
      )}

      {eng.status === 'declined' && eng.notes && (
        <div className="mt-8 rounded-2xl border border-ink/10 bg-ink/[0.03] p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">Decline reason</h2>
          <p className="whitespace-pre-wrap text-sm text-ink">{eng.notes}</p>
        </div>
      )}

      {isDepositor && (eng.status === 'created' || eng.status === 'declined') && (
        <p className="mt-6 text-sm text-ink-soft">
          Negotiated different terms in the comments, or got declined?{' '}
          <Link
            to="/app/create"
            state={{
              prefill: {
                counterparty: eng.counterparty,
                ...parseSpec(eng.deliverable_spec),
                amount: formatEther(BigInt(eng.amount)),
              },
            }}
            className="text-coral-600 underline hover:text-coral-700"
          >
            Recreate this engagement with new terms
          </Link>
          .
        </p>
      )}

      {isCounterparty && provider && eng.status === 'accepted' && (
        <SubmitDeliverableForm
          address={address!}
          provider={provider}
          engagementId={eng.id}
          depositor={eng.depositor}
          counterparty={eng.counterparty}
          onSubmitting={setPendingTx}
          onSettled={(ok) => onSettled(ok)}
        />
      )}

      {isParty && provider && (eng.status === 'submitted' || eng.status === 'disputed') && (
        <RequestReleaseAction
          engagementId={eng.id}
          previousReasoning={eng.decision_reasoning}
          onClick={async () => {
            const hash = (await requestRelease(address!, provider, eng.id)) as `0x${string}`
            setPendingTx(hash)
            setIsJudging(true)
            return hash
          }}
          onSettled={(ok, hash) => onSettled(ok, { isRelease: true, hash })}
        />
      )}

      {isParty && provider && eng.status === 'released' && (
        <DisputeForm address={address!} provider={provider} engagementId={eng.id} onSettled={(ok) => onSettled(ok)} />
      )}

      {eng.status === 'rejected' && rejectedWindow?.isOpen && (
        <>
          <p className="mt-6 text-sm text-ink-soft">
            Appeal window closes {formatUnixDate(rejectedWindow.closesAt)}. If no dispute is raised by then, the
            deposit becomes refundable to the depositor.
          </p>
          {isParty && provider && (
            <DisputeForm address={address!} provider={provider} engagementId={eng.id} onSettled={(ok) => onSettled(ok)} />
          )}
        </>
      )}

      {eng.status === 'rejected' && rejectedWindow && !rejectedWindow.isOpen && provider && (
        <ActionButton
          label="Settle (refund depositor)"
          description="The appeal window has closed with no dispute raised. This permissionlessly finalizes the refund back to the depositor."
          onClick={async () => {
            const hash = (await settleRejected(address!, provider, eng.id)) as `0x${string}`
            setPendingTx(hash)
            return hash
          }}
          onSettled={(ok) => onSettled(ok)}
        />
      )}

      {canAppeal && lastReleaseTx && (
        <div className="mt-6 rounded-2xl border border-coral-500/30 bg-coral-500/[0.06] p-5 text-sm">
          <p className="mb-2 text-ink">
            You can also contest the validators&apos; last judgment directly at the protocol level (a bonded appeal
            re-evaluated by a fresh, expanded validator set).
          </p>
          <a href={explorerUrl(lastReleaseTx)} target="_blank" rel="noreferrer" className="text-coral-600 underline hover:text-coral-700">
            View transaction to appeal
          </a>
        </div>
      )}

      {isDepositor && provider && (eng.status === 'created' || eng.status === 'accepted') && isPast(eng.deadline) && (
        <ActionButton
          label="Refund (deadline passed)"
          description="No submission was made before the deadline - refund the deposit back to you."
          onClick={async () => {
            const hash = (await refundExpired(address!, provider, eng.id)) as `0x${string}`
            setPendingTx(hash)
            return hash
          }}
          onSettled={(ok) => onSettled(ok)}
        />
      )}

      {pendingTx && (
        <div className="mt-6">
          <TxStatus hash={pendingTx} />
        </div>
      )}
    </div>
  )
}

function Timeline({ status, judging = false }: { status: StatusValue; judging?: boolean }) {
  // "judging" isn't a real on-chain status - request_release runs judgment
  // synchronously and the contract only ever lands on submitted/disputed
  // going in, released/rejected coming out. It's shown here as a permanent
  // waypoint in the pipeline (not just while this browser has a tx pending)
  // so anyone viewing a submitted engagement sees what's next, not just the
  // person who happened to click Request Release.
  const judgedTerminal: StatusValue[] = ['released', 'rejected', 'refunded']
  const isActivelyJudgingDispute = judging && status === 'disputed'

  let steps: string[]
  let reachedCount: number
  if (status === 'declined') {
    steps = ['created', 'declined']
    reachedCount = 2
  } else if (status === 'expired') {
    // Reachable from either 'created' (never accepted) or 'accepted' (accepted,
    // never delivered) - current state alone can't tell which, so this stays
    // a simple 2-step summary either way.
    steps = ['created', 'expired']
    reachedCount = 2
  } else if (judgedTerminal.includes(status)) {
    steps = ['created', 'accepted', 'submitted', 'judging', status]
    reachedCount = 5
  } else if (isActivelyJudgingDispute) {
    steps = ['created', 'accepted', 'submitted', 'disputed', 'judging']
    reachedCount = 5
  } else if (status === 'disputed') {
    steps = ['created', 'accepted', 'submitted', 'disputed']
    reachedCount = 4
  } else if (status === 'submitted') {
    steps = ['created', 'accepted', 'submitted', 'judging', 'released']
    reachedCount = 3
  } else if (status === 'accepted') {
    steps = ['created', 'accepted', 'submitted', 'judging', 'released']
    reachedCount = 2
  } else {
    // created
    steps = ['created', 'accepted', 'submitted', 'judging', 'released']
    reachedCount = 1
  }

  return (
    <ol className="flex flex-wrap items-center gap-y-2 gap-x-2 text-xs">
      {steps.map((step, i) => {
        const reached = i < reachedCount
        const isPulsing = step === 'judging' && judging && (status === 'submitted' || status === 'disputed')
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 font-medium ${
                isPulsing
                  ? 'animate-pulse bg-coral-500 text-black'
                  : reached
                    ? 'bg-coral-500 text-black'
                    : 'bg-ink/5 text-ink-soft/70'
              }`}
            >
              {step}
            </span>
            {i < steps.length - 1 && <span className="text-ink-soft/50">&rarr;</span>}
          </li>
        )
      })}
    </ol>
  )
}

function CommentThread({
  comments,
  isParty,
  address,
  provider,
  engagementId,
  depositor,
  counterparty,
  forceSuggestion = false,
  onSuggestionConsumed,
  onSettled,
}: {
  comments: Comment[]
  isParty: boolean
  address: `0x${string}` | null
  provider: EIP1193Provider | null
  engagementId: number
  depositor: `0x${string}`
  counterparty: `0x${string}`
  forceSuggestion?: boolean
  onSuggestionConsumed?: () => void
  onSettled: (ok: boolean) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { keypair, unlocking, unlock } = useSecureMessaging(address, provider)
  const [depositorPubkey, setDepositorPubkey] = useState<string | null>(null)
  const [counterpartyPubkey, setCounterpartyPubkey] = useState<string | null>(null)
  const [pubkeysLoaded, setPubkeysLoaded] = useState(false)

  const viewerRole: 'depositor' | 'counterparty' | null =
    address?.toLowerCase() === depositor.toLowerCase()
      ? 'depositor'
      : address?.toLowerCase() === counterparty.toLowerCase()
        ? 'counterparty'
        : null

  useEffect(() => {
    let cancelled = false
    setPubkeysLoaded(false)
    Promise.all([getPubkey(depositor), getPubkey(counterparty)]).then(([d, c]) => {
      if (cancelled) return
      setDepositorPubkey(d || null)
      setCounterpartyPubkey(c || null)
      setPubkeysLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [depositor, counterparty, engagementId])

  useEffect(() => {
    if (!keypair) return
    if (viewerRole === 'depositor') setDepositorPubkey(keypair.publicKeyBase64)
    if (viewerRole === 'counterparty') setCounterpartyPubkey(keypair.publicKeyBase64)
  }, [keypair, viewerRole])

  const otherPartyPubkey = viewerRole === 'depositor' ? counterpartyPubkey : depositorPubkey

  return (
    <div id="comment-compose" className="mt-8 scroll-mt-24">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        Comments{comments.length > 0 ? ` (${comments.length})` : ''}
      </h2>

      {!isParty && comments.length > 0 && (
        <p className="mb-3 text-sm text-ink-soft">
          Comments are end-to-end encrypted between the depositor and counterparty - not visible here.
        </p>
      )}

      {isParty && !keypair && pubkeysLoaded && (
        <Card className="mb-3 p-4 text-sm">
          <p className="mb-2 text-ink-soft">
            Comments here are end-to-end encrypted - only the depositor and counterparty can read them, not
            validators, not the public, not even this app&apos;s own operator. Enable secure messaging with your
            wallet to read and post.
          </p>
          <Button size="sm" variant="secondary" loading={unlocking} onClick={unlock}>
            Enable secure messaging
          </Button>
        </Card>
      )}

      {comments.length === 0 && <p className="text-sm text-ink-soft">No comments yet.</p>}

      <ul className="space-y-3">
        {comments.map((c, i) => {
          const decoded = keypair && viewerRole ? tryDecryptComment(c.text, keypair.secretKeyHex, viewerRole) : null
          return (
            <li key={i} className="rounded-xl border border-ink/8 bg-paper p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink-soft">{shortAddress(c.author)}</span>
                <span className="text-xs text-ink-soft/60">{formatUnixDate(c.created_at)}</span>
              </div>
              {decoded ? (
                <>
                  {decoded.kind === 'suggestion' && (
                    <span className="label-mono mb-1 inline-block rounded-full bg-coral-100 px-2 py-0.5 text-[9px] text-coral-700">
                      Suggested change
                    </span>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-ink">{decoded.plaintext}</p>
                  {!decoded.encrypted && <p className="mt-1 text-[10px] text-amber-600">Posted unencrypted</p>}
                </>
              ) : (
                <p className="text-sm italic text-ink-soft">
                  {isParty ? 'Enable secure messaging above to read this.' : 'Encrypted - only visible to the two parties.'}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {isParty && keypair && address && provider && (
        <div className="mt-4">
          {!otherPartyPubkey ? (
            <p className="text-sm text-ink-soft">
              Waiting for the other party to enable secure messaging before you can post here.
            </p>
          ) : (
            <>
              {forceSuggestion && (
                <p className="mb-1.5 text-xs font-medium text-coral-600">
                  Posting as a suggested change - the depositor can review it and recreate the engagement if they
                  agree.
                </p>
              )}
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={forceSuggestion ? "Describe what you'd want changed..." : 'Add a comment...'}
                rows={2}
              />
              <div className="mt-2 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={async () => {
                    if (!text.trim()) {
                      setError('Comment cannot be empty.')
                      return
                    }
                    setBusy(true)
                    setError(null)
                    try {
                      const envelope = encryptComment(
                        text.trim(),
                        depositorPubkey!,
                        counterpartyPubkey!,
                        forceSuggestion ? 'suggestion' : undefined,
                      )
                      const h = (await addComment(address, provider, engagementId, envelope)) as `0x${string}`
                      setHash(h)
                    } catch (err: any) {
                      setError(err?.message ?? 'Transaction failed')
                      setBusy(false)
                    }
                  }}
                >
                  {forceSuggestion ? 'Post Suggestion' : 'Post Comment'}
                </Button>
                {forceSuggestion && (
                  <button
                    type="button"
                    onClick={onSuggestionConsumed}
                    disabled={busy}
                    className="text-xs text-ink-soft hover:text-ink"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {hash && (
            <div className="mt-3">
              <TxStatus
                hash={hash}
                onSettled={(ok) => {
                  setBusy(false)
                  if (ok) {
                    setText('')
                    onSuggestionConsumed?.()
                  }
                  setHash(null)
                  onSettled(ok)
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActionButton({
  label,
  description,
  onClick,
  onSettled,
  variant = 'primary',
}: {
  label: string
  description: string
  onClick: () => Promise<`0x${string}`>
  onSettled: (ok: boolean, hash?: `0x${string}`) => void
  variant?: 'primary' | 'secondary'
}) {
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <Card className="mt-6 p-5">
      <p className="mb-3 text-sm text-ink-soft">{description}</p>
      <Button
        variant={variant}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const h = await onClick()
            setHash(h)
          } catch (err: any) {
            setError(err?.message ?? 'Transaction failed')
            setBusy(false)
          }
        }}
      >
        {label}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {hash && (
        <div className="mt-3">
          <TxStatus
            hash={hash}
            onSettled={(ok) => {
              setBusy(false)
              onSettled(ok, hash)
            }}
          />
        </div>
      )}
    </Card>
  )
}

function RequestReleaseAction({
  engagementId,
  previousReasoning,
  onClick,
  onSettled,
}: {
  engagementId: number
  previousReasoning: string
  onClick: () => Promise<`0x${string}`>
  onSettled: (ok: boolean, hash?: `0x${string}`) => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [noVerdict, setNoVerdict] = useState(false)

  async function run() {
    setBusy(true)
    setError(null)
    setNoVerdict(false)
    try {
      const h = await onClick()
      setHash(h)
      setConfirmOpen(false)
    } catch (err: any) {
      setError(err?.message ?? 'Transaction failed')
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6 p-5">
      <p className="mb-3 text-sm text-ink-soft">
        Triggers validator judgment: they fetch the evidence live and compare it against the spec.
      </p>
      <Button onClick={() => setConfirmOpen(true)} loading={busy}>
        {busy ? 'Judging…' : 'Request Release'}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {noVerdict && (
        <p className="mt-2 text-sm text-amber-700">
          The transaction confirmed on-chain, but validators didn&apos;t reach a verdict this round (a known
          GenLayer consensus timeout, not a rejection) - the engagement is unchanged. Click Request Release to try
          again.
        </p>
      )}
      {verifying && <p className="mt-2 text-sm text-ink-soft">Checking whether a verdict was actually reached...</p>}
      {hash && (
        <div className="mt-3">
          <TxStatus
            hash={hash}
            budgetMs={12 * 60 * 1000}
            onSettled={async (ok) => {
              if (!ok) {
                setBusy(false)
                onSettled(false, hash)
                return
              }
              // A confirmed receipt alone doesn't guarantee a verdict was
              // reached - GenVM can finalize a round with no decision (e.g.
              // a leader timeout) without the receipt itself signaling
              // failure. decision_reasoning is always overwritten the
              // instant a real verdict lands, so compare it against what it
              // was right before this attempt rather than trusting the
              // receipt in isolation.
              setVerifying(true)
              try {
                const fresh = await getEngagement(engagementId)
                const verdictReached = fresh.decision_reasoning !== previousReasoning
                setNoVerdict(!verdictReached)
                setBusy(false)
                onSettled(verdictReached, hash)
              } catch {
                setBusy(false)
                onSettled(true, hash)
              } finally {
                setVerifying(false)
              }
            }}
          />
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} title="Request validator judgment?">
        <div className="mb-5 flex gap-3 rounded-xl bg-ink/[0.03] p-4 text-sm text-ink-soft">
          <IconScale width={20} height={20} className="mt-0.5 shrink-0 text-coral-500" />
          <p>
            Five independent validators will fetch the submitted evidence live and judge it against the spec.
            Judgment usually completes in under a minute, but can take a few minutes longer if a validator needs to
            retry. This costs gas and cannot be undone once submitted - only a dispute or protocol appeal can
            revisit the outcome.
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} loading={busy}>
            Confirm &amp; Request Judgment
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

function AcceptDeclineActions({
  address,
  provider,
  engagementId,
  onSettled,
  onSuggestChange,
}: {
  address: `0x${string}`
  provider: EIP1193Provider
  engagementId: number
  onSettled: (ok: boolean) => void
  onSuggestChange: () => void
}) {
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const h = (await acceptEngagement(address, provider, engagementId)) as `0x${string}`
      setHash(h)
    } catch (err: any) {
      setError(err?.message ?? 'Transaction failed')
      setBusy(false)
    }
  }

  async function decline() {
    if (!reason.trim()) {
      setError('A reason is required to decline.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const h = (await declineEngagement(address, provider, engagementId, reason.trim())) as `0x${string}`
      setHash(h)
    } catch (err: any) {
      setError(err?.message ?? 'Transaction failed')
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">Accept this engagement?</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Review the spec above before starting work. Accepting doesn&apos;t move any funds - it just confirms
        you&apos;re taking this on and unlocks submitting a deliverable. Declining refunds the deposit back to the
        depositor immediately.
      </p>
      {!declining && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={accept} loading={busy}>
            Accept
          </Button>
          <Button variant="secondary" onClick={() => setDeclining(true)} disabled={busy}>
            Decline
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onSuggestChange}>
            Suggest changes instead
          </Button>
        </div>
      )}
      {!declining && (
        <p className="mt-3 text-xs text-ink-soft">
          Want different terms before committing? Message the depositor privately in the comment thread below - they
          can cancel and recreate the engagement with new terms if you agree.
        </p>
      )}
      {declining && (
        <>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you declining?"
            rows={2}
            className="mb-3"
          />
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" onClick={decline} loading={busy}>
              Confirm Decline
            </Button>
            <Button variant="ghost" onClick={() => setDeclining(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {hash && (
        <div className="mt-3">
          <TxStatus
            hash={hash}
            onSettled={(ok) => {
              setBusy(false)
              onSettled(ok)
            }}
          />
        </div>
      )}
    </Card>
  )
}

function SubmitDeliverableForm({
  address,
  provider,
  engagementId,
  depositor,
  counterparty,
  onSubmitting,
  onSettled,
}: {
  address: `0x${string}`
  provider: EIP1193Provider
  engagementId: number
  depositor: `0x${string}`
  counterparty: `0x${string}`
  onSubmitting: (hash: `0x${string}` | null) => void
  onSettled: (ok: boolean) => void
}) {
  const [urls, setUrls] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [commentHash, setCommentHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Submit Deliverable</h2>
      <Textarea
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder="Evidence URLs, one per line (repo, live deployment, document...)"
        rows={3}
        className="mb-3"
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes for the reviewer (optional)"
        rows={2}
        className="mb-4"
      />
      <Button
        loading={busy}
        onClick={async () => {
          const evidenceUrls = urls
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean)
          if (evidenceUrls.length === 0) {
            setError('Add at least one evidence URL.')
            return
          }
          setBusy(true)
          setError(null)
          try {
            const h = (await submitDeliverable(address, provider, engagementId, evidenceUrls, notes)) as `0x${string}`
            setHash(h)
            onSubmitting(h)
          } catch (err: any) {
            setError(err?.message ?? 'Transaction failed')
            setBusy(false)
          }
        }}
      >
        Submit Deliverable
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {hash && !commentHash && (
        <div className="mt-3">
          <TxStatus
            hash={hash}
            onSettled={async (ok) => {
              onSubmitting(null)
              if (!ok) {
                setBusy(false)
                onSettled(false)
                return
              }
              // Best-effort: let the creator know via the comment thread, since
              // there's no off-chain notification to send this as. The
              // deliverable is already submitted regardless of whether this
              // second transaction succeeds. Comments are end-to-end
              // encrypted, so this only posts if both parties already have a
              // registered key - it never falls back to plaintext.
              try {
                const [depositorPubkey, counterpartyPubkey] = await Promise.all([
                  getPubkey(depositor),
                  getPubkey(counterparty),
                ])
                if (!depositorPubkey || !counterpartyPubkey) {
                  setBusy(false)
                  onSettled(true)
                  return
                }
                const keypair = await deriveKeypair(address, provider)
                await ensureRegistered(address, provider, keypair)
                const envelope = encryptComment('Deliverable submitted for review.', depositorPubkey, counterpartyPubkey)
                const ch = (await addComment(address, provider, engagementId, envelope)) as `0x${string}`
                setCommentHash(ch)
              } catch {
                setBusy(false)
                onSettled(true)
              }
            }}
          />
        </div>
      )}
      {commentHash && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-ink-soft">Notifying the depositor...</p>
          <TxStatus
            hash={commentHash}
            onSettled={() => {
              setBusy(false)
              onSettled(true)
            }}
          />
        </div>
      )}
    </Card>
  )
}

function DisputeForm({
  address,
  provider,
  engagementId,
  onSettled,
}: {
  address: `0x${string}`
  provider: EIP1193Provider
  engagementId: number
  onSettled: (ok: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [urls, setUrls] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <Button variant="secondary" className="mt-6" onClick={() => setOpen(true)}>
        Dispute this outcome
      </Button>
    )
  }

  return (
    <Card className="mt-6 border-coral-500/30 bg-coral-500/[0.04] p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-coral-600">Raise a dispute</h2>
      <Textarea
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder="Additional evidence URLs, one per line (optional)"
        rows={2}
        className="mb-3"
      />
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why do you disagree with this outcome?"
        rows={2}
        className="mb-4"
      />
      <Button
        loading={busy}
        onClick={async () => {
          if (!reason.trim()) {
            setError('A reason is required.')
            return
          }
          const evidenceUrls = urls
            .split('\n')
            .map((u) => u.trim())
            .filter(Boolean)
          setBusy(true)
          setError(null)
          try {
            const h = (await raiseDispute(address, provider, engagementId, evidenceUrls, reason.trim())) as `0x${string}`
            setHash(h)
          } catch (err: any) {
            setError(err?.message ?? 'Transaction failed')
            setBusy(false)
          }
        }}
      >
        Submit Dispute
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {hash && (
        <div className="mt-3">
          <TxStatus
            hash={hash}
            onSettled={(ok) => {
              setBusy(false)
              setOpen(false)
              onSettled(ok)
            }}
          />
        </div>
      )}
    </Card>
  )
}
