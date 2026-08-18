# Phase Two

**Payment that releases itself once the work is proven.**

Phase Two is an escrow application built on [GenLayer](https://genlayer.com), where the Intelligent Contract itself locks a deposit and only releases it once independent AI validators fetch the submitted evidence *live* and judge it against the deliverable spec — no oracle, no middleman, no arbitrator.

Live on both **GenLayer Asimov Testnet** and **GenLayer Studio Network**, switchable at runtime from the app.

## How it works

1. **Create the engagement** — the depositor locks a GEN payment, names the counterparty, sets a deadline, writes the deliverable spec in plain English, and commits to an evidence source (a repo, an `ipfs://` reference, a domain) that every future evidence URL must match. This commitment is required, not optional — see [Why evidence is locked at creation](#why-evidence-is-locked-at-creation).
2. **Accept, or decline** — the counterparty must explicitly accept before doing any work; `submit_deliverable` isn't callable until they do. Declining requires a reason and refunds the deposit to the depositor immediately.
3. **Submit the evidence, once** — once accepted, the counterparty submits one or more URLs matching the bound prefix (validated structurally by scheme, host, and path — not a raw string prefix) as checkable proof of work, each paired with a SHA-256 hash of its content unless the URL is already content-addressed (`ipfs://`, `ar://`). This is a one-time, permanent commitment — evidence can never be added to or changed after this call, not even during a dispute. See [Why evidence is locked at creation](#why-evidence-is-locked-at-creation).
4. **Validators judge live** — anyone can trigger `request_release`. A random set of GenLayer validators — each often running a different underlying model — independently fetch the evidence themselves and compare it against the spec.
5. **Approved, or rejected — either way, not final yet** — a "met" verdict does *not* pay out on the spot. It opens the same kind of 3-day appeal window a rejection does: either party can still dispute it (for a forfeitable bond, up to 3 times), and only then does judgment run again with real effect. This is deliberate — see [Why releases aren't instant](#why-releases-arent-instant) and [Why disputes are capped and cost a bond](#why-disputes-are-capped-and-cost-a-bond).
6. **Settle** — once the appeal window closes on either an approval or a rejection with no dispute raised, anyone can permissionlessly finalize it: the deposit moves to the counterparty (approval) or back to the depositor (rejection). Nothing can sit stuck forever, and nothing moves before its window closes uncontested.
7. **Deterministic refund** — if the deadline passes with nothing submitted (before or after acceptance), the deposit refunds automatically. No judgment call, no waiting on anyone.

The two parties can also message each other privately through an end-to-end encrypted comment thread on each engagement — see [Contract](#contract) below.

Consensus on the verdict is reached through GenLayer's **Optimistic Democracy**: validators don't need to produce byte-identical output, only agree on the *substance* of the judgment (the [Equivalence Principle](https://docs.genlayer.com)), which makes it resistant to a single model being fooled or hallucinating.

## Architecture

```
contracts/surety.py     GenLayer Intelligent Contract (Python / GenVM)
tests/direct/           Fast in-memory contract tests (no network)
tests/integration/      Tests against a live GenLayer network
frontend/                React + TypeScript + Vite app
```

### Contract

A single Intelligent Contract (class `Surety`) owns the full escrow lifecycle:

| Method | Type | Description |
|---|---|---|
| `create_engagement(counterparty, deliverable_spec, deadline, parent_id=0, allowed_evidence_prefix)` | write · payable | Locks the sent value as the deposit, opens a new engagement. `deliverable_spec` is capped at 8,000 characters. A non-zero `parent_id` links it as one installment of the milestone plan rooted at that engagement id (same depositor/counterparty, and that engagement must itself be a root) - every other method treats a milestone exactly like any other engagement. `allowed_evidence_prefix` is **required** - a repo URL, an `ipfs://` reference, a specific domain - and binds every evidence URL `submit_deliverable` will ever accept, committed to before any work begins |
| `accept_engagement(engagement_id)` | write · counterparty only | Accepts the engagement, unlocking `submit_deliverable`. Moves no funds |
| `decline_engagement(engagement_id, reason)` | write · counterparty only | Declines with a required reason (capped at 2,000 characters) and refunds the deposit to the depositor immediately |
| `submit_deliverable(engagement_id, evidence_urls, evidence_hashes, notes)` | write · counterparty only, one-time | Attaches evidence, moves the engagement to `submitted`. Requires `accepted` status first; blocked once the deadline has passed, after the first submission, if a URL's parsed scheme/host/path doesn't match the bound `allowed_evidence_prefix`, or if a mutable URL (anything except `ipfs://`/`ar://`) is missing its paired sha256 hash. This is the only place evidence is ever set - it's locked from here on, including through every future dispute |
| `request_release(engagement_id)` | write | Triggers validator judgment — fetches the locked evidence live, moves to `approved` or `rejected` based on consensus. Neither outcome pays out yet - see `settle_approved`/`settle_rejected`. If this resolves a prior dispute, it also settles that dispute's bond - see `raise_dispute` |
| `raise_dispute(engagement_id, reason)` | write · either party, payable | Contests the current `approved`/`rejected` verdict and forces a re-judgment of the same (locked) evidence - increments `dispute_round`, blocked once `dispute_round` reaches `get_max_dispute_rounds()` or that status's appeal window has closed. Requires a bond of at least `get_required_dispute_bond(engagement_id)` (5% of the deposit, capped there even if more is sent - any excess is refunded immediately, never put at risk); the next `request_release` refunds the bond if the verdict changes, forfeits it to the other party if it doesn't |
| `refund_expired(engagement_id)` | write | Refunds the deposit if the deadline passed with nothing ever submitted, whether the engagement was still `created` or already `accepted` |
| `settle_approved(engagement_id)` | write · permissionless | Finalizes an approved engagement once its 3-day appeal window closes with no dispute raised — pays the deposit to the counterparty. This is the *only* way funds ever reach the counterparty |
| `settle_rejected(engagement_id)` | write · permissionless | Finalizes a rejected engagement once its 3-day appeal window closes with no dispute raised — refunds the deposit to the depositor |
| `add_comment(engagement_id, text)` | write · either party | Posts a message to the engagement's comment thread. The app end-to-end encrypts `text` client-side before calling this, so only the depositor and counterparty can read it — see [Comment privacy](#comment-privacy) |
| `register_pubkey(pubkey)` | write · global, once per address | Publishes the caller's comment-encryption public key, reusable across every engagement that address is ever a party to |
| `get_pubkey(address)` | view | An address's registered comment-encryption public key, or `""` if it hasn't registered one |
| `get_engagement(engagement_id)` | view | Full engagement record, including its comment thread, bound evidence prefix, submitted evidence hashes, approval/rejection timestamps, and the current dispute's bond/disputer/pre-dispute-status while one is open |
| `list_engagements_for(address)` | view | Engagement ids where the address is depositor or counterparty |
| `get_appeal_window_seconds()` | view | The configured appeal window, in seconds (3 days by default) |
| `get_max_dispute_rounds()` | view | The hard cap on `dispute_round` per engagement (3) |
| `get_required_dispute_bond(engagement_id)` | view | The minimum bond `raise_dispute` requires for this engagement right now (5% of its deposit) |
| `list_all_ids()` | view | All engagement ids (backs the public transparency page) |

Validator judgment uses GenLayer's comparative equivalence principle: each validator independently re-fetches the evidence and re-runs the judgment prompt, then an LLM-mediated comparison checks that the `met` verdict and reasoning substantively agree — no validator's answer is ever trusted unverified.

### Why releases aren't instant

Earlier versions of this contract paid the counterparty the instant a "met" verdict landed. That meant a dispute raised afterward could only record disagreement — the money had already moved, with no way back. That's a real weakness: a dispute mechanism only means something if it can still change the outcome.

The fix mirrors a pattern this contract already had for rejections. A rejection doesn't refund the depositor immediately either — it opens a 3-day appeal window first, and only `settle_rejected` (called once that window closes undisputed) actually moves the money. Approvals now work exactly the same way: `request_release` landing on `approved` doesn't pay anyone; `settle_approved` does, and only after its own 3-day window closes with no dispute raised. A dispute raised during that window moves the engagement to `disputed` with the deposit still fully locked, and the next verdict — approval or rejection — still has to go through its own settlement step before anything moves. The deposit itself changes hands in exactly four places: `settle_approved`, `settle_rejected`, `decline_engagement`, and `refund_expired` — never inside `request_release` or `raise_dispute`. (`request_release` does move money in one other case — resolving the previous round's dispute bond, refunded or forfeited depending on whether the re-judgment changed the outcome — but the deposit itself stays untouched until settlement.)

The tradeoff is honest: a clean approval now takes as long to finalize as a clean rejection always did (3 days by default, permissionlessly settleable by anyone the moment the window closes) instead of being instant. That's the cost of a dispute window that actually does something.

### Why evidence is locked at creation

Binding evidence to a prefix only helps if the prefix is actually set, if the match can't be gamed, and if a dispute can't quietly introduce evidence that was never agreed to, or judge different bytes than what was actually submitted. Three gaps, closed together:

`allowed_evidence_prefix` is now **required** at `create_engagement` - there's no more unrestricted default to fall back on (or forget to set). And `submit_deliverable` is a one-shot call: whatever evidence URLs go in there are the only evidence this engagement will ever have. `raise_dispute` no longer takes an evidence parameter at all - a dispute can contest the existing evidence and force a re-judgment of it, but it can never add, swap, or extend what's on file. The commitment made at creation is the commitment that gets judged, every time.

The match itself is now structural, not a raw string prefix. A naive `url.startswith(prefix)` check is bypassable: a prefix of `https://github.com/example` would incorrectly match `https://github.com/example-evil/x` (no path boundary), and a prefix of `https://github.com` would incorrectly match `https://github.com.attacker.io/x` (the string does literally start with those characters, even though the host is a different domain entirely). `submit_deliverable` parses both the bound prefix and every submitted URL into scheme, host, and path, and requires an exact scheme/host match plus a real path-segment boundary - neither bypass above passes.

Locking the URL only pins *where* the evidence lives, not *what's there* - `gl.nondet.web.render` re-fetches every URL fresh on each `request_release` call, including a post-dispute re-judgment, so a mutable page could in principle show different content than whatever was reviewed the first time. Content-addressed evidence (`ipfs://`, `ar://`) is already immune to this - the reference *is* a hash of the content, so fetching it again is guaranteed to return the same bytes. Anything else requires a SHA-256 hash submitted alongside the URL in `submit_deliverable`; every `request_release` call re-hashes whatever it actually fetched and compares it against that committed hash *before* any LLM ever sees the content - a mismatch is a deterministic rejection naming the tampered URL, not a judgment call. The same committed bytes are what get judged, on every appeal.

### Why disputes are capped and cost a bond

An unbounded, free dispute path is a liveness problem: nothing stops either party from disputing forever, so the contract could never structurally guarantee an engagement actually settles. Two changes close that:

**Bounded** - `dispute_round` is capped at `get_max_dispute_rounds()` (3). Once reached, `raise_dispute` is blocked outright; the engagement can only be settled via `settle_approved`/`settle_rejected` once its window closes, or escalated through GenLayer's protocol-level appeal. This is what actually guarantees the process terminates - not just discourages abuse.

**Economically costly** - every dispute requires a bond (`get_required_dispute_bond`, 5% of the deposit). Since evidence is locked (see above), a dispute can't introduce new proof - it can only bet that re-judging the *same* evidence lands differently. `gl.eq_principle.prompt_comparative` already requires independent validators to agree, so re-judging identical evidence reliably reproduces the same verdict unless the original judgment was genuinely a misfire. `request_release` resolves the bond the moment it produces the next verdict: refunded to the disputer if the outcome changed (the dispute was right), forfeited to the other party if it didn't (the dispute was frivolous). A clean re-roll is a real error-correction path; a baseless one is an expensive bet.

### Comment privacy

The on-chain comment thread is not public. Each comment is encrypted twice — once per party — using x25519-xsalsa20-poly1305 (the same scheme MetaMask's `eth_decrypt` uses), so the raw `text` stored on-chain is opaque ciphertext to anyone but the depositor and counterparty, including this app's own read code.

A wallet's encryption key pair is derived deterministically from a `personal_sign` signature over a fixed message (`tweetnacl`'s `nacl.box.keyPair.fromSecretKey`, seeded from the signature hash) — nothing is ever written to disk. The first time either party opens a thread, that one-time signature both derives the key and registers its public half on-chain via `register_pubkey`; every later session re-derives the same key by re-signing. Posting is blocked client-side until both parties have registered a key, so no comment is ever posted unencrypted through the app. A comment posted before this feature existed, or directly via script/CLI, renders as plain legacy text with a small "unencrypted" note rather than crashing.

### Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4, wallet connection via Reown AppKit (WalletConnect), on-chain reads/writes via `genlayer-js`.

- **Landing** (`/`) — marketing page, its own minimal header
- **My Engagements** (`/app`) — search + status-filterable list of your engagements
- **Create Engagement** (`/app/create`) — new engagement form, with spec templates and an optional milestone plan (split the deposit into installments, each its own independent engagement)
- **Engagement Detail** (`/app/engagement/:id`) — full lifecycle actions: accept/decline, submit, request release, dispute, refund, appeal, plus a private comment thread and, for milestones, sibling progress
- **Profile** (`/app/profile/:address`) — an address's public track record (approval/dispute rates), also shown inline on Create and Detail pages before you engage with someone
- **Templates** (`/app/templates`) — browse the full spec template library
- **Milestones** (`/app/milestones`) — every milestone plan you're a party to, with per-plan progress
- **Negotiate** (`/app/negotiate`) — an inbox of every "suggest changes" comment you've sent or received, across all engagements
- **Notifications** (`/app/notifications`) — history of status changes on your engagements, stored on-device
- **Transparency** (`/stats`) — public, wallet-free aggregate stats read directly from the contract
- **Docs** (`/docs`) — in-app protocol reference

App pages share a collapsible sidebar shell; a network switcher in the sidebar lets you flip between Asimov Testnet and Studio Network at runtime, each with its own contract deployment, wallet network prompt, and data. Status changes since your last visit surface as a sidebar badge, a browser tab-title counter, a toast, and (with permission) a native browser notification while a tab stays open in the background - all client-side, no backend involved.

## Networks

| Network | Chain id | Contract address | Notes |
|---|---|---|---|
| **Asimov Testnet** | `4221` | `0x0df473331D5A8AaAaE596B92B962769431eCA121` | GenLayer's public testnet. Needs testnet GEN — [faucet](https://testnet-faucet.genlayer.foundation/) (100 GEN/claim, weekly) |
| **Studio Network** | `61999` | `0xd28BcbC18cFebfD26B3A7A9C49a027EaBb2B5Ab9` | Hosted GenLayer Studio. Gasless — no funded account needed |

## Getting started

### Prerequisites

- Node.js ≥ 20, npm
- Python ≥ 3.12
- [GenLayer CLI](https://docs.genlayer.com) (`npm install -g genlayer`) — only needed if you're redeploying the contract

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

`.env.local`:

```bash
VITE_CONTRACT_ADDRESS_ASIMOV=0x0df473331D5A8AaAaE596B92B962769431eCA121
VITE_CONTRACT_ADDRESS_STUDIONET=0xd28BcbC18cFebfD26B3A7A9C49a027EaBb2B5Ab9
VITE_REOWN_PROJECT_ID=<your project id from https://dashboard.reown.com>
```

### Contract

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install genlayer-test genvm-linter

genvm-lint check contracts/surety.py    # lint + SDK validation
pytest tests/direct/ -v                 # 64 fast, in-memory tests
```

Integration tests (`tests/integration/`) run against a live network and exercise the full validator-judgment path with real evidence URLs — see `genlayer-dev:integration-tests` if you have the GenLayer Claude Code skill installed, or run with `gltest tests/integration/ -v -s --network <network>` directly.

To redeploy the contract:

```bash
genlayer network set testnet-asimov   # or studionet
genlayer deploy --contract contracts/surety.py
```

## Deployment

The frontend deploys to [Netlify](https://netlify.com) via the included `netlify.toml` (base directory `frontend/`, SPA redirect for client-side routing). Set the three env vars above in the Netlify dashboard before the first build.

## Tech stack

Python · GenVM · React 19 · TypeScript · Vite · Tailwind CSS v4 · `genlayer-js` · Reown AppKit · wagmi · React Router · `@metamask/eth-sig-util` · `tweetnacl` · pytest · Playwright

## License

MIT — see [LICENSE](./LICENSE).
