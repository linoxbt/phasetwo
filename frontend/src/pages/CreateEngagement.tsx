import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../lib/wallet'
import { createEngagement, listEngagementsFor } from '../lib/surety'
import { TxStatus } from '../components/TxStatus'
import { Button } from '../components/ui/Button'
import { Input, Textarea, Label } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { EmptyState, EmptyIcon } from '../components/ui/EmptyState'
import { FAUCET_URL } from '../lib/faucet'
import { shortAddress, formatUnixDateUTC } from '../lib/format'
import { ENGAGEMENT_TEMPLATES, type Prefill } from '../lib/templates'
import { AddressReputation } from '../components/AddressReputation'

const DELIVERY_METHODS = ['URL', 'GitHub repository', 'IPFS / Arweave', 'File', 'Text response', 'Other'] as const
const selectClass =
  'w-full rounded-xl border border-ink/12 bg-paper px-4 py-2.5 text-sm text-ink transition-colors focus:border-coral-500/60 focus:outline-none focus:ring-2 focus:ring-coral-500/15'

export function CreateEngagement() {
  const { address, provider, connect } = useWallet()
  const navigate = useNavigate()
  const location = useLocation()
  // Set by EngagementDetail.tsx's "Recreate this engagement with new terms"
  // link - only read once, on first render, so it doesn't fight the user's
  // own edits if they navigate away and back within the same history entry.
  const [prefill] = useState<Prefill | undefined>(() => (location.state as { prefill?: Prefill } | null)?.prefill)
  const prefillDeliveryKnown = prefill?.deliveryMethod && DELIVERY_METHODS.includes(prefill.deliveryMethod as any)

  const [counterparty, setCounterparty] = useState(prefill?.counterparty ?? '')
  const [title, setTitle] = useState(prefill?.title ?? '')
  const [description, setDescription] = useState(prefill?.description ?? '')
  const [verificationCriteria, setVerificationCriteria] = useState(prefill?.verificationCriteria ?? '')
  const [deliveryMethod, setDeliveryMethod] = useState(
    prefill?.deliveryMethod ? (prefillDeliveryKnown ? prefill.deliveryMethod : 'Other') : '',
  )
  const [deliveryMethodOther, setDeliveryMethodOther] = useState(
    prefill?.deliveryMethod && !prefillDeliveryKnown ? prefill.deliveryMethod : '',
  )
  const [deadline, setDeadline] = useState('')
  const [amount, setAmount] = useState(prefill?.amount ?? '')
  const [allowedEvidencePrefix, setAllowedEvidencePrefix] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Milestones: each row becomes its own engagement, submitted sequentially
  // (see submitMilestoneStep) - the first row is the plan's root, every
  // later row links to it via parent_id. Spec/verification/delivery method
  // stay shared across rows; only the label and amount differ per row.
  const [splitMilestones, setSplitMilestones] = useState(false)
  const [milestoneRows, setMilestoneRows] = useState([
    { label: 'Milestone 1', amount: '' },
    { label: 'Milestone 2', amount: '' },
  ])
  const [milestoneStep, setMilestoneStep] = useState<number | null>(null)
  const [milestoneHash, setMilestoneHash] = useState<`0x${string}` | null>(null)
  const [milestoneRootId, setMilestoneRootId] = useState<number | null>(null)
  const [milestoneDone, setMilestoneDone] = useState<boolean[]>([])
  const [milestoneDeadlineUnix, setMilestoneDeadlineUnix] = useState<number | null>(null)

  const deliveryMethodLabel = deliveryMethod === 'Other' ? deliveryMethodOther.trim() : deliveryMethod

  function applyTemplate(templateId: string) {
    const template = ENGAGEMENT_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    setTitle(template.title)
    setDescription(template.description)
    setVerificationCriteria(template.verificationCriteria)
    setDeliveryMethod(template.deliveryMethod)
    setDeliveryMethodOther('')
  }

  function updateMilestoneRow(index: number, patch: Partial<{ label: string; amount: string }>) {
    setMilestoneRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addMilestoneRow() {
    setMilestoneRows((rows) => [...rows, { label: `Milestone ${rows.length + 1}`, amount: '' }])
  }

  function removeMilestoneRow(index: number) {
    setMilestoneRows((rows) => (rows.length <= 2 ? rows : rows.filter((_, i) => i !== index)))
  }

  const milestoneTotal = milestoneRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

  function buildSpec(rowLabel?: string) {
    return [
      rowLabel ? `${title.trim()} - ${rowLabel}` : title.trim(),
      description.trim(),
      `Verification criteria:\n${verificationCriteria.trim()}`,
      `Delivery method: ${deliveryMethodLabel}`,
    ].join('\n\n')
  }

  async function submitMilestoneStep(index: number, rootId: number | null, deadlineUnix: number) {
    if (!address || !provider) return
    try {
      const row = milestoneRows[index]
      const spec = buildSpec(row.label)
      const hash = await createEngagement(
        address,
        provider,
        counterparty as `0x${string}`,
        spec,
        deadlineUnix,
        row.amount,
        rootId ?? 0,
        allowedEvidencePrefix.trim(),
      )
      setMilestoneHash(hash as `0x${string}`)
    } catch (err: any) {
      setFormError(err?.message ?? 'Failed to submit transaction')
      setSubmitting(false)
      setMilestoneStep(null)
    }
  }

  async function handleMilestoneStepSettled(ok: boolean, deadlineUnix: number) {
    if (!ok || !address || milestoneStep === null) {
      setSubmitting(false)
      setMilestoneStep(null)
      setFormError('Milestone plan stopped partway through - engagements already created are still valid and live in My Engagements, but the plan wasn’t fully created. Check My Engagements before retrying.')
      return
    }
    let rootId = milestoneRootId
    // Only step 0 needs to discover the plan's root id - later steps already
    // carry it via milestoneRootId. If this lookup fails right when it's
    // needed, abort with a real error instead of silently falling through to
    // parent_id ?? 0, which would create the rest of the plan as standalone
    // engagements with no link back to the first one.
    if (milestoneStep === 0) {
      try {
        const ids = await listEngagementsFor(address)
        rootId = Math.max(...ids)
        setMilestoneRootId(rootId)
      } catch {
        setSubmitting(false)
        setMilestoneStep(null)
        setFormError(
          'The first milestone was created, but Phase Two couldn’t confirm its id to link the rest of the plan to it. Check My Engagements to find it, then create the remaining milestones individually.',
        )
        return
      }
    }
    setMilestoneDone((prev) => {
      const next = [...prev]
      next[milestoneStep] = true
      return next
    })

    const nextStep = milestoneStep + 1
    if (nextStep < milestoneRows.length) {
      setMilestoneStep(nextStep)
      setMilestoneHash(null)
      await submitMilestoneStep(nextStep, rootId, deadlineUnix)
    } else {
      setSubmitting(false)
      if (rootId) navigate(`/app/engagement/${rootId}`)
      else navigate('/app')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!address || !provider) {
      setFormError('Connect your wallet first.')
      return
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(counterparty)) {
      setFormError('Enter a valid counterparty address (0x...).')
      return
    }
    if (counterparty.toLowerCase() === address.toLowerCase()) {
      setFormError('The counterparty must be a different address than yours.')
      return
    }
    if (!title.trim()) {
      setFormError('Give the engagement a short title.')
      return
    }
    if (!description.trim()) {
      setFormError('Describe exactly what must be delivered.')
      return
    }
    if (!verificationCriteria.trim()) {
      setFormError('Describe how the deliverable will be verified - this is what validators judge against.')
      return
    }
    if (!deliveryMethod || (deliveryMethod === 'Other' && !deliveryMethodOther.trim())) {
      setFormError('Choose how the counterparty will deliver the work.')
      return
    }
    const deadlineUnix = Math.floor(new Date(deadline).getTime() / 1000)
    if (!deadline || Number.isNaN(deadlineUnix) || deadlineUnix <= Date.now() / 1000) {
      setFormError('Pick a deadline in the future.')
      return
    }
    if (!allowedEvidencePrefix.trim()) {
      setFormError('Set what evidence is acceptable - a repo URL, an ipfs:// reference, or a domain.')
      return
    }
    if (splitMilestones) {
      if (milestoneRows.some((r) => !r.label.trim())) {
        setFormError('Give every milestone a label.')
        return
      }
      if (milestoneRows.some((r) => !r.amount || Number(r.amount) <= 0)) {
        setFormError('Enter a deposit amount greater than zero for every milestone.')
        return
      }
      setSubmitting(true)
      setMilestoneDone(milestoneRows.map(() => false))
      setMilestoneRootId(null)
      setMilestoneStep(0)
      setMilestoneDeadlineUnix(deadlineUnix)
      await submitMilestoneStep(0, null, deadlineUnix)
      return
    }

    if (!amount || Number(amount) <= 0) {
      setFormError('Enter a deposit amount greater than zero.')
      return
    }

    setSubmitting(true)
    try {
      const spec = buildSpec()
      const hash = await createEngagement(
        address,
        provider,
        counterparty as `0x${string}`,
        spec,
        deadlineUnix,
        amount,
        0,
        allowedEvidencePrefix.trim(),
      )
      setTxHash(hash as `0x${string}`)
    } catch (err: any) {
      setFormError(err?.message ?? 'Failed to submit transaction')
      setSubmitting(false)
    }
  }

  async function handleSettled(ok: boolean) {
    setSubmitting(false)
    if (!ok || !address) return
    try {
      const ids = await listEngagementsFor(address)
      const newestId = Math.max(...ids)
      navigate(`/app/engagement/${newestId}`)
    } catch {
      navigate('/app')
    }
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24">
        <EmptyState
          icon={<EmptyIcon />}
          title="Connect your wallet"
          description="Connect a wallet to create an engagement."
          action={<Button onClick={connect}>Connect Wallet</Button>}
        />
      </div>
    )
  }

  const validCounterparty = /^0x[a-fA-F0-9]{40}$/.test(counterparty)
  const deadlineUnix = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : null
  const paymentReady = splitMilestones
    ? milestoneRows.every((r) => r.label.trim() && Number(r.amount) > 0)
    : !!amount && Number(amount) > 0
  const totalAmount = splitMilestones ? String(milestoneTotal) : amount
  const readyToReview =
    validCounterparty && title.trim() && verificationCriteria.trim() && deliveryMethodLabel && paymentReady && !!deadlineUnix

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="mb-2 font-display text-3xl font-bold tracking-tight text-ink">Create Engagement</h1>
      <p className="mb-8 text-sm text-ink-soft">
        Your payment is locked in escrow. The counterparty is paid only after independent validators confirm that
        the submitted work satisfies the deliverable specification.
      </p>

      <form onSubmit={handleSubmit} className="space-y-10">
        <Section n={1} title="Counterparty">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-ink/8 bg-paper p-4 sm:grid-cols-2">
            <div>
              <p className="label-mono text-[10px] text-ink-soft/70">Depositor (you)</p>
              <p className="mt-1 truncate font-mono text-sm text-ink">{shortAddress(address)}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Locks the payment now</p>
            </div>
            <div>
              <p className="label-mono text-[10px] text-ink-soft/70">Counterparty</p>
              <p className={`mt-1 truncate font-mono text-sm ${validCounterparty ? 'text-ink' : 'text-ink-soft/50'}`}>
                {validCounterparty ? shortAddress(counterparty) : 'Not set yet'}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">Delivers the work, gets paid on approval</p>
            </div>
          </div>

          <div>
            <Label>Counterparty address</Label>
            <Input
              mono
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="0x... - the wallet that will do the work"
            />
          </div>

          {validCounterparty && (
            <div>
              <Label>Their track record</Label>
              <AddressReputation address={counterparty as `0x${string}`} />
            </div>
          )}
        </Section>

        <Section n={2} title="Engagement details">
          <div>
            <Label>Start from a template (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {ENGAGEMENT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t.id)}
                  className="label-mono rounded-full border border-ink/10 px-3.5 py-1.5 text-[11px] text-ink-soft transition-colors hover:border-ink/25 hover:text-ink"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              Fills in the fields below with a starting point - everything stays editable.{' '}
              <Link to="/app/templates" className="text-coral-600 underline hover:text-coral-700">
                Browse all templates
              </Link>
              .
            </p>
          </div>

          <div>
            <Label>Title</Label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary, e.g. Landing page redesign"
              maxLength={80}
            />
          </div>

          <div>
            <Label>Deliverable spec</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What must be delivered - be as specific as possible."
            />
          </div>

          <div>
            <Label>Verification criteria</Label>
            <Textarea
              value={verificationCriteria}
              onChange={(e) => setVerificationCriteria(e.target.value)}
              rows={4}
              placeholder="What exactly counts as done? List required features, where the work will be checked, and what a pass looks like - this is the text validators judge against, so a clear yes/no test beats a vague description."
            />
          </div>

          <div>
            <Label>Delivery method</Label>
            <select
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                How will the counterparty submit the work?
              </option>
              {DELIVERY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {deliveryMethod === 'Other' && (
              <Input
                type="text"
                value={deliveryMethodOther}
                onChange={(e) => setDeliveryMethodOther(e.target.value)}
                placeholder="Describe the delivery method"
                className="mt-2"
              />
            )}
            <p className="mt-1.5 text-xs text-ink-soft">
              Informational for now - the counterparty attaches the actual evidence link when they submit.
            </p>
          </div>

          <div>
            <Label>Restrict acceptable evidence to</Label>
            <Input
              type="text"
              value={allowedEvidencePrefix}
              onChange={(e) => setAllowedEvidencePrefix(e.target.value)}
              placeholder="e.g. https://github.com/your-org/your-repo"
            />
            <p className="mt-1.5 text-xs text-ink-soft">
              Required. The evidence URL the counterparty submits must start with this - locked in before any
              work begins, instead of trusting whatever link shows up later. Evidence can't be added or changed
              after that one submission, even in a dispute - a repo URL, an ipfs:// reference, or a specific
              domain all work.
            </p>
          </div>
        </Section>

        <Section n={3} title="Payment">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={splitMilestones}
              onChange={(e) => setSplitMilestones(e.target.checked)}
              className="h-4 w-4 rounded border-ink/20 accent-coral-500"
            />
            Split into milestones
          </label>
          <p className="-mt-2 text-xs text-ink-soft">
            Each milestone becomes its own fully independent engagement (its own accept/submit/judge), sharing this
            spec and deadline, so the counterparty is paid installment by installment instead of all at once.
          </p>

          {!splitMilestones ? (
            <div>
              <Label>Deposit (GEN)</Label>
              <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.5" />
              <p className="mt-1.5 text-xs text-ink-soft">
                Locked in escrow until the deliverable is approved. Need testnet GEN?{' '}
                <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="text-coral-600 underline hover:text-coral-700">
                  Claim from the faucet
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Milestones</Label>
              {milestoneRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={row.label}
                    onChange={(e) => updateMilestoneRow(i, { label: e.target.value })}
                    placeholder={`Milestone ${i + 1}`}
                    aria-label={`Milestone ${i + 1} label`}
                    className="flex-[2]"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={row.amount}
                    onChange={(e) => updateMilestoneRow(i, { amount: e.target.value })}
                    placeholder="0.5 GEN"
                    aria-label={`Milestone ${i + 1} deposit amount in GEN`}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeMilestoneRow(i)}
                    disabled={milestoneRows.length <= 2}
                    className="shrink-0 px-2 text-ink-soft transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Remove milestone"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addMilestoneRow}>
                Add milestone
              </Button>
              <p className="text-xs text-ink-soft">
                Total: {milestoneTotal > 0 ? `${milestoneTotal} GEN` : '-'} across {milestoneRows.length} milestone
                {milestoneRows.length === 1 ? '' : 's'}, each a separate deposit locked when created.
              </p>
            </div>
          )}

          <div>
            <Label>Deadline</Label>
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <p className="mt-1.5 text-xs text-ink-soft">
              {deadlineUnix ? formatUnixDateUTC(deadlineUnix) : 'Shown in your local time - the contract stores it as UTC.'}
              {splitMilestones ? ' Shared across every milestone.' : ''}
            </p>
          </div>
        </Section>

        <Section n={4} title="How verification works">
          <Card className="p-5 text-sm text-ink-soft">
            <p>
              Five independent GenLayer validators fetch the submitted evidence themselves at judgment time and
              compare it against your verification criteria above - nothing submitted as text is trusted at face
              value. Judgment is triggered on request and usually completes in under a minute, occasionally a few
              minutes longer under load. If validators disagree with each other, GenLayer&apos;s consensus mechanism
              resolves it before a verdict is ever written back to this contract.
            </p>
            <a href="/docs#concepts" className="mt-2 inline-block text-coral-600 underline hover:text-coral-700">
              Read more about validator consensus
            </a>
          </Card>
        </Section>

        <Section n={5} title="Review & create">
          {readyToReview ? (
            <div className="space-y-2 rounded-2xl border border-coral-500/20 bg-coral-500/[0.05] p-4 text-sm text-ink">
              <p>
                You will lock <span className="font-semibold">{totalAmount} GEN</span>
                {splitMilestones ? ` across ${milestoneRows.length} milestones` : ''} in escrow.{' '}
                <span className="font-mono">{shortAddress(counterparty)}</span> must accept
                {splitMilestones ? ' each milestone' : ''} before they can start - it releases
                {splitMilestones ? ' per milestone' : ''} only if validators confirm{' '}
                <span className="font-semibold">&ldquo;{title.trim()}&rdquo;</span> is delivered by{' '}
                <span className="font-semibold">{deadlineUnix ? formatUnixDateUTC(deadlineUnix) : new Date(deadline).toLocaleString()}</span>
                . If they decline, or nothing is submitted by the deadline, it refunds to you automatically.
              </p>
              <p className="text-ink-soft">
                <span className="font-medium text-ink">Verified by:</span>{' '}
                {verificationCriteria.trim().length > 140
                  ? `${verificationCriteria.trim().slice(0, 140)}…`
                  : verificationCriteria.trim()}
              </p>
              <p className="text-ink-soft">
                <span className="font-medium text-ink">Delivery method:</span> {deliveryMethodLabel}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">Fill in the sections above to see a summary before you submit.</p>
          )}

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" loading={submitting} size="lg">
            {submitting ? 'Submitting' : splitMilestones ? 'Create Milestone Plan' : 'Create Engagement'}
          </Button>

          {!splitMilestones && txHash && (
            <div className="pt-2">
              <TxStatus hash={txHash} onSettled={handleSettled} />
            </div>
          )}

          {splitMilestones && milestoneStep !== null && (
            <div className="space-y-2 pt-2">
              {milestoneRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      milestoneDone[i]
                        ? 'bg-emerald-100 text-emerald-700'
                        : i === milestoneStep
                          ? 'bg-coral-100 text-coral-700'
                          : 'bg-ink/5 text-ink-soft'
                    }`}
                  >
                    {milestoneDone[i] ? '✓' : i + 1}
                  </span>
                  <span className="text-ink-soft">{row.label}</span>
                  {i === milestoneStep && !milestoneDone[i] && milestoneHash && (
                    <span className="text-xs text-ink-soft">confirming...</span>
                  )}
                </div>
              ))}
              {milestoneHash && !milestoneDone[milestoneStep] && (
                <TxStatus
                  hash={milestoneHash}
                  onSettled={(ok) => handleMilestoneStepSettled(ok, milestoneDeadlineUnix ?? 0)}
                />
              )}
            </div>
          )}
        </Section>
      </form>
    </div>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 border-b border-ink/8 pb-3">
        <span className="label-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/10 text-[10px] text-ink-soft">
          {n}
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}
