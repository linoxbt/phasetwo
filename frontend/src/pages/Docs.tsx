import { useEffect, useState } from 'react'
import { FAUCET_URL } from '../lib/faucet'
import { NETWORKS as NETWORK_REGISTRY } from '../lib/network'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'concepts', label: 'Key concepts' },
  { id: 'lifecycle', label: 'Engagement lifecycle' },
  { id: 'contract', label: 'Contract reference' },
  { id: 'networks', label: 'Networks' },
  { id: 'faq', label: 'FAQ' },
]

// Derived from the same registry the in-app network switcher uses, so this
// never drifts from what the app actually supports/points at.
const NETWORK_INFO = [
  {
    name: NETWORK_REGISTRY.testnetAsimov.label,
    chainId: String(NETWORK_REGISTRY.testnetAsimov.chain.id),
    rpc: NETWORK_REGISTRY.testnetAsimov.chain.rpcUrls.default.http[0],
    explorer: NETWORK_REGISTRY.testnetAsimov.chain.blockExplorers?.default.url ?? '',
    contractAddress: NETWORK_REGISTRY.testnetAsimov.contractAddress,
    note: "GenLayer's current public testnet. Needs testnet GEN for gas.",
  },
  {
    name: NETWORK_REGISTRY.studionet.label,
    chainId: String(NETWORK_REGISTRY.studionet.chain.id),
    rpc: NETWORK_REGISTRY.studionet.chain.rpcUrls.default.http[0],
    explorer: NETWORK_REGISTRY.studionet.chain.blockExplorers?.default.url ?? '',
    contractAddress: NETWORK_REGISTRY.studionet.contractAddress,
    note: 'Hosted GenLayer Studio - gasless, no funded account needed.',
  },
]

export function Docs() {
  const [active, setActive] = useState(SECTIONS[0].id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) setActive(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-10 text-left">
        <p className="label-mono text-xs text-coral-600">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">How Phase Two works</h1>
        <p className="mt-4 max-w-xl text-ink-soft">
          A reference for the escrow lifecycle, the GenLayer concepts behind judgment, and the contract methods
          themselves.
        </p>
      </div>

      {/* Mobile: horizontal scrolling section strip instead of a sidebar */}
      <nav className="mb-8 flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`label-mono shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] transition-colors ${
              active === s.id ? 'border-ink bg-ink text-paper' : 'border-ink/10 text-ink-soft'
            }`}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="lg:flex lg:items-start lg:gap-16">
        {/* Desktop: sticky sidebar */}
        <nav className="hidden lg:sticky lg:top-28 lg:block lg:w-[22%] lg:shrink-0">
          <ul className="space-y-1 border-l border-ink/8">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors ${
                    active === s.id ? 'border-coral-500 text-ink' : 'border-transparent text-ink-soft hover:text-ink'
                  }`}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 space-y-16 lg:w-[78%]">
          <Section id="overview" title="Overview">
            <p>
              Phase Two is an escrow contract for work that can&apos;t be checked by a plain deterministic condition.
              A depositor locks payment against a plain-English deliverable spec; the counterparty submits live,
              checkable evidence; a random set of independent GenLayer validators fetch that evidence themselves and
              judge it against the spec. Funds release automatically on a pass. Either side can dispute or escalate
              to a protocol-level appeal on disagreement.
            </p>
            <p>
              Nothing about the verdict is trusted from a single party or a single model - every validator
              re-derives the judgment independently, and the reasoning behind every verdict (including rejections) is
              stored on-chain permanently. Every engagement, its status, and the GEN moving through the contract are
              visible on the public{' '}
              <a href="/stats" className="text-coral-600 underline hover:text-coral-700">
                Transparency page
              </a>{' '}
              - the one thing that stays private is the comment thread between the two parties.
            </p>
          </Section>

          <Section id="how-it-works" title="How it works">
            <ol className="space-y-6">
              <Step n={1} title="Create the engagement">
                The depositor locks the payment, names the counterparty address, sets a deadline, and writes the
                deliverable spec - the exact criteria validators will judge against later.
              </Step>
              <Step n={2} title="Accept, or decline">
                The counterparty must explicitly accept before doing any work - <Code>submit_deliverable</Code>{' '}
                isn&apos;t callable until they do. Declining requires a reason and refunds the deposit to the
                depositor immediately; no work, no judgment, no waiting.
              </Step>
              <Step n={3} title="Submit the evidence">
                Once accepted, the counterparty submits one or more evidence URLs (a repo, a live deployment, a
                document) plus optional notes for the reviewer.
              </Step>
              <Step n={4} title="Validators judge live">
                Anyone can trigger <Code>request_release</Code>. Five independent validators fetch the evidence
                themselves at judgment time and compare it against the spec - nothing submitted as text is
                trusted at face value. Judgment typically completes in under a minute; occasionally longer if a
                validator round needs a retry.
              </Step>
              <Step n={5} title="Approved, or rejected - either way, not final yet">
                A pass doesn&apos;t pay out on the spot. It opens the same kind of 3-day appeal window a
                rejection does; either party can still raise a dispute with additional evidence during it, then
                request judgment again, or escalate through GenLayer&apos;s protocol-level appeal (Asimov Testnet
                only). This is deliberate - see <Code>Can a dispute actually reverse a payout?</Code> below.
              </Step>
              <Step n={6} title="Settle">
                Once the appeal window closes on either an approval or a rejection with no dispute raised, anyone
                can permissionlessly finalize it - the deposit moves to the counterparty (approval) or back to
                the depositor (rejection). Nothing can sit stuck forever, and nothing moves before its window
                closes uncontested.
              </Step>
            </ol>
          </Section>

          <Section id="concepts" title="Key concepts">
            <dl className="space-y-6">
              <Concept term="Optimistic Democracy">
                GenLayer&apos;s consensus model: a random set of validators, each often connected to a different
                underlying model, independently execute the same judgment task and reach consensus on the result
                rather than trusting one leader&apos;s output.
              </Concept>
              <Concept term="Equivalence Principle">
                Validators agree on the <em>substance</em> of an answer, not an exact string match - two honest
                validators evaluating the same evidence rarely phrase their reasoning identically, so consensus is
                measured on meaning.
              </Concept>
              <Concept term="Greyboxing">
                Because validators run on different, often undisclosed models, adversarial evidence tuned to fool one
                specific model is unlikely to fool the whole validator set.
              </Concept>
              <Concept term="Appeals">
                A contested verdict can escalate to an expanded validator set at the protocol level - a bonded,
                on-chain re-evaluation, not a support ticket. GenLayer&apos;s appeal contracts are only configured on
                Asimov Testnet today, so this path isn&apos;t available on Studio Network.
              </Concept>
              <Concept term="Private comments">
                The two parties can message each other through the engagement&apos;s comment thread without it
                being readable by anyone else - each comment is end-to-end encrypted with a key pair a wallet
                derives from a signature, never a stored secret. The first time either party opens the thread,
                a one-time signature enables secure messaging for that address going forward, on every engagement
                it&apos;s ever a party to.
              </Concept>
            </dl>
          </Section>

          <Section id="lifecycle" title="Engagement lifecycle">
            <p>An engagement moves through a small set of statuses:</p>
            <ul className="space-y-2">
              <li>
                <Code>created</Code> - deposit locked, waiting on the counterparty to accept or decline.
              </li>
              <li>
                <Code>accepted</Code> - the counterparty has accepted; waiting on evidence, or on the deadline to
                pass.
              </li>
              <li>
                <Code>declined</Code> - the counterparty declined before starting work; deposit refunded to the
                depositor immediately.
              </li>
              <li>
                <Code>submitted</Code> - evidence is in; anyone can trigger validator judgment.
              </li>
              <li>
                <Code>approved</Code> - validators passed the deliverable; a 3-day appeal window opens before
                anything is paid.
              </li>
              <li>
                <Code>rejected</Code> - validators failed the deliverable; a 3-day appeal window opens.
              </li>
              <li>
                <Code>disputed</Code> - a party added evidence and re-triggered judgment after an approval or a
                rejection.
              </li>
              <li>
                <Code>released</Code> - an approval&apos;s appeal window closed with no dispute raised; deposit
                paid to the counterparty. The only terminal, funds-moved state on the pass side.
              </li>
              <li>
                <Code>expired</Code> - the deadline passed with nothing submitted, whether from <Code>created</Code>{' '}
                or <Code>accepted</Code>; deposit refunded to the depositor.
              </li>
              <li>
                <Code>refunded</Code> - a rejection&apos;s appeal window closed with no dispute raised; deposit
                refunded to the depositor.
              </li>
            </ul>
          </Section>

          <Section id="contract" title="Contract reference">
            <p>Public methods on the deployed Intelligent Contract:</p>
            <div className="space-y-4">
              <Method
                name="create_engagement"
                args="counterparty, deliverable_spec, deadline, parent_id=0, allowed_evidence_prefix=&quot;&quot;"
                note="Write · payable"
              >
                Locks the sent value as the deposit and opens a new engagement. An optional{' '}
                <Code>allowed_evidence_prefix</Code> binds every evidence URL - the initial submission and any
                dispute&apos;s additional evidence - to that prefix, committed to before any work begins: a repo
                URL, an <Code>ipfs://</Code> reference, a specific domain. Left empty, evidence is unrestricted.
              </Method>
              <Method name="accept_engagement" args="engagement_id" note="Write · counterparty only">
                Accepts the engagement, unlocking <Code>submit_deliverable</Code>. Moves no funds.
              </Method>
              <Method name="decline_engagement" args="engagement_id, reason" note="Write · counterparty only">
                Declines the engagement with a required reason and refunds the deposit to the depositor
                immediately.
              </Method>
              <Method name="submit_deliverable" args="engagement_id, evidence_urls, notes" note="Write · counterparty only, one-time">
                Attaches evidence and moves the engagement to <Code>submitted</Code>. Requires the engagement to be{' '}
                <Code>accepted</Code> first, can only be called once, and every URL must match a bound{' '}
                <Code>allowed_evidence_prefix</Code> if one was set at creation - updating evidence after that goes
                through <Code>raise_dispute</Code> instead.
              </Method>
              <Method name="request_release" args="engagement_id" note="Write · triggers validator judgment">
                Runs the validator comparison against the spec; moves the engagement to <Code>approved</Code> or{' '}
                <Code>rejected</Code> based on consensus. Neither outcome pays out yet - see{' '}
                <Code>settle_approved</Code> / <Code>settle_rejected</Code>.
              </Method>
              <Method name="raise_dispute" args="engagement_id, evidence_urls, reason" note="Write · depositor or counterparty">
                Appends evidence (also subject to the bound evidence prefix, if any) and increments the dispute
                round after an approval or a rejection. Doesn&apos;t re-run judgment itself - a subsequent{' '}
                <Code>request_release</Code> call does that. Blocked once that status&apos;s appeal window has
                closed.
              </Method>
              <Method name="refund_expired" args="engagement_id" note="Write · after deadline, status created or accepted">
                Refunds the deposit to the depositor if nothing was ever submitted.
              </Method>
              <Method name="settle_approved" args="engagement_id" note="Write · permissionless, after the appeal window closes">
                Finalizes an approved engagement with no dispute raised - pays the deposit to the counterparty.
                This is the only way funds ever reach the counterparty.
              </Method>
              <Method name="settle_rejected" args="engagement_id" note="Write · permissionless, after the appeal window closes">
                Finalizes a rejected engagement with no dispute raised - refunds the deposit to the depositor.
              </Method>
              <Method name="add_comment" args="engagement_id, text" note="Write · depositor or counterparty">
                Posts a message to the engagement&apos;s comment thread. The app encrypts <Code>text</Code> into an
                envelope only the depositor and counterparty can decrypt before calling this - see{' '}
                <Code>Private comments</Code> above.
              </Method>
              <Method name="register_pubkey" args="pubkey" note="Write · global, once per address">
                Publishes the caller&apos;s comment-encryption public key, reusable across every engagement that
                address is ever a party to.
              </Method>
              <Method name="get_pubkey" args="address" note="View">
                Returns an address&apos;s registered comment-encryption public key, or an empty string if it hasn&apos;t
                registered one.
              </Method>
              <Method name="get_engagement" args="engagement_id" note="View">
                Returns the full engagement record.
              </Method>
              <Method name="list_engagements_for" args="address" note="View">
                Returns engagement ids where the address is depositor or counterparty.
              </Method>
              <Method name="list_all_ids" args="" note="View">
                Returns every engagement id that has ever been created - backs the public Transparency page.
              </Method>
              <Method name="get_appeal_window_seconds" args="" note="View">
                Returns the configured appeal window, in seconds (3 days by default).
              </Method>
            </div>
          </Section>

          <Section id="networks" title="Networks">
            <p>
              Phase Two is deployed to both of GenLayer&apos;s real networks at once, and the sidebar&apos;s network
              switcher picks between them at runtime - no rebuild needed. Each network has its own contract
              deployment and its own engagement history; switching networks means you&apos;re looking at entirely
              separate data, not a filtered view of the same data.
            </p>
            <div className="space-y-4">
              {NETWORK_INFO.map((n) => (
                <div key={n.chainId} className="rounded-xl border border-ink/8 bg-paper p-4">
                  <p className="font-display text-sm font-semibold text-ink">{n.name}</p>
                  <p className="mt-2">{n.note}</p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-ink-soft/70">Chain id</dt>
                    <dd className="font-mono text-ink">{n.chainId}</dd>
                    <dt className="text-ink-soft/70">RPC</dt>
                    <dd className="break-all font-mono text-ink">{n.rpc}</dd>
                    <dt className="text-ink-soft/70">Explorer</dt>
                    <dd className="break-all font-mono text-ink">{n.explorer}</dd>
                    <dt className="text-ink-soft/70">Contract</dt>
                    <dd className="break-all font-mono text-ink">{n.contractAddress}</dd>
                  </dl>
                </div>
              ))}
            </div>
            <p>
              A ready-to-copy <Code>.env.example</Code> ships in the frontend repo root. Need funds for Asimov
              Testnet?{' '}
              <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="text-coral-600 underline hover:text-coral-700">
                Claim testnet GEN from the faucet
              </a>{' '}
              (100 GEN per claim, once every 7 days) - Studio Network is gasless and needs no funding at all.
            </p>
          </Section>

          <Section id="faq" title="FAQ">
            <dl className="space-y-6">
              <Concept term="What happens if validators disagree with each other?">
                GenLayer&apos;s consensus mechanism resolves this at the protocol level before a verdict is ever
                written back to the contract - Phase Two only sees the final agreed-on result.
              </Concept>
              <Concept term="Can the counterparty fake the evidence?">
                Validators fetch the evidence themselves at judgment time rather than trusting submitted text, so a
                broken link, a private repo, or a page that doesn&apos;t match the claim will surface in the verdict.
              </Concept>
              <Concept term="What happens to a rejection nobody disputes?">
                It doesn&apos;t sit stuck forever. A rejection opens a 3-day appeal window - either party can
                dispute with new evidence during it, but once it closes, anyone can permissionlessly call{' '}
                <Code>settle_rejected</Code> to refund the deposit back to the depositor.
              </Concept>
              <Concept term="Can a dispute actually reverse a payout?">
                Yes, because nothing is ever paid out before the dispute window has had its chance. An{' '}
                <Code>approved</Code> verdict doesn&apos;t move funds - it opens a 3-day appeal window, exactly
                like a rejection does. A dispute raised during that window moves the engagement to{' '}
                <Code>disputed</Code> with the deposit still fully locked, and the next verdict - approval or
                rejection - still has to clear its own settlement step before anything moves. Funds change hands
                in exactly four places in the whole contract: <Code>settle_approved</Code>,{' '}
                <Code>settle_rejected</Code>, <Code>decline_engagement</Code>, and <Code>refund_expired</Code> -
                never inside <Code>request_release</Code> or <Code>raise_dispute</Code> themselves. The tradeoff:
                a clean approval takes as long to finalize as a clean rejection always did, instead of being
                instant.
              </Concept>
              <Concept term="Are comments visible to anyone else?">
                No. Each comment is end-to-end encrypted for the depositor and counterparty only - not even this
                app&apos;s own contract-read code can see the plaintext. A comment posted before either party
                enabled secure messaging renders as unencrypted, clearly labeled as such.
              </Concept>
            </dl>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-ink/8 pt-12 text-left first:border-t-0 first:pt-0">
      <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-4 max-w-2xl space-y-4 text-sm leading-relaxed text-ink-soft [&_em]:text-ink [&_em]:not-italic [&_em]:font-medium">
        {children}
      </div>
    </section>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="label-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/10 text-[10px] text-ink-soft">
        {n}
      </span>
      <div>
        <p className="font-display text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1">{children}</p>
      </div>
    </li>
  )
}

function Concept({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-sm font-semibold text-ink">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function Method({
  name,
  args,
  note,
  children,
}: {
  name: string
  args: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-ink/8 bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <code className="font-mono text-sm font-semibold text-ink">
          {name}
          <span className="text-ink-soft/60">({args})</span>
        </code>
        <span className="label-mono text-[10px] text-coral-600">{note}</span>
      </div>
      <p className="mt-2 text-sm">{children}</p>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>
}
