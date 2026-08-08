import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../lib/wallet'
import { createEngagement, listEngagementsFor } from '../lib/surety'
import { TxStatus } from '../components/TxStatus'
import { Button } from '../components/ui/Button'
import { Input, Textarea, Label } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { EmptyState, EmptyIcon } from '../components/ui/EmptyState'
import { FAUCET_URL } from '../lib/faucet'
import { shortAddress, formatUnixDateUTC } from '../lib/format'

const DELIVERY_METHODS = ['URL', 'GitHub repository', 'IPFS / Arweave', 'File', 'Text response', 'Other'] as const
const selectClass =
  'w-full rounded-xl border border-ink/12 bg-paper px-4 py-2.5 text-sm text-ink transition-colors focus:border-coral-500/60 focus:outline-none focus:ring-2 focus:ring-coral-500/15'

export function CreateEngagement() {
  const { address, provider, connect } = useWallet()
  const navigate = useNavigate()

  const [counterparty, setCounterparty] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [verificationCriteria, setVerificationCriteria] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState('')
  const [deliveryMethodOther, setDeliveryMethodOther] = useState('')
  const [deadline, setDeadline] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const deliveryMethodLabel = deliveryMethod === 'Other' ? deliveryMethodOther.trim() : deliveryMethod

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
    if (!amount || Number(amount) <= 0) {
      setFormError('Enter a deposit amount greater than zero.')
      return
    }

    setSubmitting(true)
    try {
      const spec = [
        title.trim(),
        description.trim(),
        `Verification criteria:\n${verificationCriteria.trim()}`,
        `Delivery method: ${deliveryMethodLabel}`,
      ].join('\n\n')
      const hash = await createEngagement(address, provider, counterparty as `0x${string}`, spec, deadlineUnix, amount)
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
  const readyToReview =
    validCounterparty && title.trim() && verificationCriteria.trim() && deliveryMethodLabel && amount && Number(amount) > 0

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
        </Section>

        <Section n={2} title="Engagement details">
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
        </Section>

        <Section n={3} title="Payment">
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

          <div>
            <Label>Deadline</Label>
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <p className="mt-1.5 text-xs text-ink-soft">
              {deadlineUnix ? formatUnixDateUTC(deadlineUnix) : 'Shown in your local time - the contract stores it as UTC.'}
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
                You will lock <span className="font-semibold">{amount} GEN</span> in escrow.{' '}
                <span className="font-mono">{shortAddress(counterparty)}</span> must accept before they can start -
                it releases to them only if validators confirm{' '}
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
            {submitting ? 'Submitting' : 'Create Engagement'}
          </Button>

          {txHash && (
            <div className="pt-2">
              <TxStatus hash={txHash} onSettled={handleSettled} />
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
