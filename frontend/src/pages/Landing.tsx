import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Reveal } from '../components/ui/Reveal'
import { AnimatedCounter } from '../components/ui/AnimatedCounter'
import { Logo } from '../components/Logo'
import { NetworkBanner } from '../components/NetworkBanner'
import { useNetwork } from '../lib/network'
import { getValidatorCount } from '../lib/validators'
import {
  IconLock,
  IconUpload,
  IconScale,
  IconCheckShield,
  IconEye,
  IconChain,
  IconGavel,
  IconClock,
  IconNetwork,
  IconArrowRight,
} from '../components/icons'

const STEPS = [
  {
    icon: IconLock,
    title: 'Create the engagement',
    body: 'Deposit the payment, name the counterparty, and write the deliverable spec in plain English.',
  },
  {
    icon: IconUpload,
    title: 'Submit the evidence',
    body: 'The counterparty submits links to the real, checkable proof of work - a repo, a live URL, a document.',
  },
  {
    icon: IconScale,
    title: 'Validators judge live',
    body: 'Independent validators fetch the evidence themselves, in real time, and compare it against the spec.',
  },
  {
    icon: IconCheckShield,
    title: 'Release, or dispute',
    body: 'Funds release automatically on a pass. On disagreement, either side can dispute or appeal on-chain.',
  },
]

const FEATURES = [
  {
    icon: IconEye,
    title: 'Live evidence, not claims',
    body: 'Validators fetch your repo, deployment, or document themselves at judgment time - nothing is trusted as submitted text.',
  },
  {
    icon: IconChain,
    title: 'Reasoning stored on-chain',
    body: 'Every verdict - including rejections - stores the validators’ reasoning permanently. No black-box approve/reject.',
  },
  {
    icon: IconGavel,
    title: 'A real dispute path',
    body: 'Disagree with a verdict? Add evidence and re-trigger judgment, or escalate through GenLayer’s protocol-level appeal.',
  },
  {
    icon: IconClock,
    title: 'Deterministic refunds',
    body: 'If the deadline passes with nothing submitted, the deposit refunds automatically - pure logic, no judgment call needed.',
  },
]

export function Landing() {
  return (
    <div>
      <MarketingHeader />
      <Hero />
      <HowItWorks />
      <WhyGenLayer />
      <Features />
      <FinalCta />
      <Footer />
    </div>
  )
}

/** Landing gets its own minimal header instead of the app sidebar - a marketing
 * page shouldn't be wrapped in app-shell chrome. */
function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-ink/8 bg-cream/85 backdrop-blur">
      <NetworkBanner />
      <div className="px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Logo size={24} />
          <div className="flex items-center gap-5">
            <Link to="/docs" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:block">
              Docs
            </Link>
            <Link to="/app">
              <Button icon={<IconArrowRight width={15} height={15} />}>Launch App</Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  const network = useNetwork()
  const validatorCount = getValidatorCount(network)

  return (
    <section className="px-4 pt-6 sm:px-6 sm:pt-8">
      <Reveal>
        <div className="mx-auto flex max-w-6xl flex-col overflow-hidden rounded-2xl border border-ink/8 bg-paper md:h-[560px] md:flex-row md:items-end">
          {/* Left: copy, left-aligned, never centered */}
          <div className="flex w-full flex-col items-start justify-center gap-6 px-6 py-14 sm:px-10 sm:py-16 md:w-[52%] md:py-0">
            <h1 className="text-left text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem] lg:leading-[1.02]">
              Payment that releases itself <span className="text-coral-500">once the work is proven.</span>
            </h1>

            <p className="max-w-md text-left text-base leading-relaxed text-ink-soft">
              Phase Two locks a deposit and pays out only when independent AI validators fetch your evidence live and
              verify it against the spec - no middleman, no black box.
            </p>

            <div className="flex flex-nowrap items-center gap-2 pt-2 sm:gap-3">
              <Link to="/app">
                <Button size="lg" icon={<IconArrowRight width={16} height={16} />}>
                  Launch App
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="secondary">
                  See how it works
                </Button>
              </a>
            </div>
          </div>

          {/* Right: visual, pinned to the edge, not centered in the card */}
          <div className="relative flex w-full items-center justify-center bg-cream px-6 py-14 md:w-[48%] md:py-0 md:pl-0">
            <ConsensusVisual />
          </div>
        </div>
      </Reveal>

      <Reveal delay={120}>
        {/* grid, not flex-wrap: keeps all three stats on one row at every
            width instead of the row wrapping when labels don't fit. */}
        <div className="mx-auto mt-3 grid max-w-6xl grid-cols-3 divide-x divide-ink/8 rounded-2xl border border-ink/8 bg-paper py-6">
          <div className="px-3 sm:px-10">
            <Stat key={validatorCount} value={validatorCount} suffix="" label="Validators per verdict" />
          </div>
          <div className="px-3 sm:px-10">
            <Stat value={0} prefix="$" label="Trusted middleman" />
          </div>
          <div className="px-3 sm:px-10">
            <Stat value={100} suffix="%" label="Evidence fetched live" />
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function Stat({ value, prefix = '', suffix = '', label }: { value: number; prefix?: string; suffix?: string; label: string }) {
  return (
    <div className="text-left">
      <p className="font-display text-2xl font-bold text-ink">
        <AnimatedCounter to={value} prefix={prefix} suffix={suffix} />
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{label}</p>
    </div>
  )
}

function ConsensusVisual() {
  const nodes = [
    [78, 30],
    [30, 70],
    [126, 70],
    [54, 128],
    [102, 128],
  ]
  return (
    <svg width="220" height="220" viewBox="0 0 156 156" fill="none" className="animate-float">
      {nodes.map(([x, y], i) => (
        <line key={`l${i}`} x1="78" y1="79" x2={x} y2={y} stroke="#FC6432" strokeOpacity="0.35" strokeWidth="1.5" />
      ))}
      <circle cx="78" cy="79" r="12" fill="#131416" />
      {nodes.map(([x, y], i) => (
        <circle key={`n${i}`} cx={x} cy={y} r="7" fill={i % 2 === 0 ? '#FC6432' : '#765BFF'} />
      ))}
    </svg>
  )
}

/** Sticky left header + right-side numbered list - mirrors the reference site's
 * feature-section layout instead of a centered card grid. */
function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-ink/8 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl lg:flex lg:items-start lg:gap-16">
        <Reveal className="lg:w-[30%]">
          <div className="lg:sticky lg:top-28">
            <p className="label-mono text-left text-xs text-coral-600">How it works</p>
            <h2 className="mt-3 text-left text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Four steps from deposit to payout
            </h2>
          </div>
        </Reveal>

        <div className="mt-12 flex flex-col lg:mt-0 lg:w-[70%]">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 90}>
              <div className="flex gap-6 border-t border-ink/8 py-8 first:border-t-0 lg:first:border-t">
                <div className="flex flex-col items-center">
                  <span className="label-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 text-[11px] text-ink-soft">
                    {i + 1}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-50 text-coral-600">
                    <step.icon width={20} height={20} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-display text-base font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">{step.body}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function WhyGenLayer() {
  return (
    <section className="border-t border-ink/8 bg-ink px-4 py-24 text-paper sm:px-6">
      <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-2">
        <Reveal>
          <div className="text-left">
            <p className="label-mono text-xs text-coral-400">Why GenLayer</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-paper sm:text-4xl">
              Judgment calls need more than one model.
            </h2>
            <p className="mt-5 max-w-lg text-white/60">
              A standard contract can check a number. It can&apos;t read a live webpage and decide whether it
              satisfies a plain-English spec. Phase Two runs on GenLayer&apos;s{' '}
              <span className="text-white/90">Optimistic Democracy</span>: a random set of validators, each
              connected to a different, often undisclosed model, independently execute the same judgment and reach
              consensus on the <em>substance</em> of the answer - not an exact string match.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-white/60">
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-coral-400" />
                <span>
                  <span className="text-white/90">Greyboxing</span> - validator model diversity defeats
                  adversarial input tuned against any one model.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-coral-400" />
                <span>
                  <span className="text-white/90">Equivalence Principle</span> - agreement on meaning, not
                  exact wording, since two honest validators rarely phrase things identically.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-coral-400" />
                <span>
                  <span className="text-white/90">Appeals</span> - a contested result escalates to an expanded
                  validator set, not a support ticket.
                </span>
              </li>
            </ul>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-12 lg:justify-end">
            <div className="animate-float text-coral-400/80">
              <IconNetwork width={180} height={180} strokeWidth={1.1} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section className="border-t border-ink/8 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl lg:flex lg:items-start lg:gap-16">
        <Reveal className="lg:w-[30%]">
          <div className="lg:sticky lg:top-28">
            <p className="label-mono text-left text-xs text-coral-600">Built for real accountability</p>
            <h2 className="mt-3 text-left text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Not a generic escrow
            </h2>
          </div>
        </Reveal>

        <div className="mt-12 flex flex-col lg:mt-0 lg:w-[70%]">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 90}>
              <div className="flex gap-5 border-t border-ink/8 py-8 first:border-t-0 lg:first:border-t">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <f.icon width={20} height={20} />
                </div>
                <div className="text-left">
                  <h3 className="font-display text-base font-semibold text-ink">{f.title}</h3>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">{f.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="border-t border-ink/8 px-4 py-24 sm:px-6">
      <Reveal>
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-8 overflow-hidden rounded-2xl border border-ink/10 bg-paper px-8 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-12">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,rgba(252,100,50,0.07),transparent_55%)]" />
          <div className="text-left">
            <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Ready to lock in a deliverable?</h2>
            <p className="mt-3 max-w-sm text-ink-soft">
              Connect a wallet and create your first engagement in under a minute.
            </p>
          </div>
          <Link to="/app/create" className="shrink-0">
            <Button size="lg" icon={<IconArrowRight width={16} height={16} />}>
              Create an Engagement
            </Button>
          </Link>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-ink/8 px-4 py-12 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-start gap-2">
          <Logo size={22} />
          <p className="text-sm text-ink-soft">Built on GenLayer - live, appealable validator consensus.</p>
        </div>
        <div className="flex gap-6 text-sm text-ink-soft">
          <Link to="/app" className="hover:text-ink">
            My Engagements
          </Link>
          <Link to="/app/create" className="hover:text-ink">
            Create Engagement
          </Link>
          <Link to="/docs" className="hover:text-ink">
            Docs
          </Link>
          <Link to="/stats" className="hover:text-ink">
            Transparency
          </Link>
        </div>
      </div>
    </footer>
  )
}
