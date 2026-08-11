# Phase Two

**Payment that releases itself once the work is proven.**

Phase Two is an escrow application built on [GenLayer](https://genlayer.com), where the Intelligent Contract itself locks a deposit and only releases it once independent AI validators fetch the submitted evidence *live* and judge it against the deliverable spec — no oracle, no middleman, no arbitrator.

Live on both **GenLayer Asimov Testnet** and **GenLayer Studio Network**, switchable at runtime from the app.

## How it works

1. **Create the engagement** — the depositor locks a GEN payment, names the counterparty, sets a deadline, and writes the deliverable spec in plain English.
2. **Accept, or decline** — the counterparty must explicitly accept before doing any work; `submit_deliverable` isn't callable until they do. Declining requires a reason and refunds the deposit to the depositor immediately.
3. **Submit the evidence** — once accepted, the counterparty submits one or more URLs (a repo, a live deployment, a document) as checkable proof of work.
4. **Validators judge live** — anyone can trigger `request_release`. A random set of GenLayer validators — each often running a different underlying model — independently fetch the evidence themselves and compare it against the spec.
5. **Approved, or rejected — either way, not final yet** — a "met" verdict does *not* pay out on the spot. It opens the same kind of 3-day appeal window a rejection does: either party can still dispute it, and only then does judgment run again with real effect. This is deliberate — see [Why releases aren't instant](#why-releases-arent-instant).
6. **Settle** — once the appeal window closes on either an approval or a rejection with no dispute raised, anyone can permissionlessly finalize it: the deposit moves to the counterparty (approval) or back to the depositor (rejection). Nothing can sit stuck forever, and nothing moves before its window closes uncontested.
7. **Deterministic refund** — if the deadline passes with nothing submitted (before or after acceptance), the deposit refunds automatically. No judgment call, no waiting on anyone.

The two parties can also message each other privately through an end-to-end encrypted comment thread on each engagement — see [Contract](#contract) below. A depositor can also optionally bind acceptable evidence to a specific prefix (a repo, an `ipfs://` reference, a domain) at creation time — see the `create_engagement` row below.

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
| `create_engagement(counterparty, deliverable_spec, deadline, parent_id=0, allowed_evidence_prefix="")` | write · payable | Locks the sent value as the deposit, opens a new engagement. A non-zero `parent_id` links it as one installment of the milestone plan rooted at that engagement id (same depositor/counterparty, and that engagement must itself be a root) - every other method treats a milestone exactly like any other engagement. A non-empty `allowed_evidence_prefix` binds every evidence URL (initial submission and any dispute's additional evidence) to that prefix, committed to before any work begins - a repo URL, an `ipfs://` reference, a specific domain. Empty means unrestricted |
| `accept_engagement(engagement_id)` | write · counterparty only | Accepts the engagement, unlocking `submit_deliverable`. Moves no funds |
| `decline_engagement(engagement_id, reason)` | write · counterparty only | Declines with a required reason and refunds the deposit to the depositor immediately |
| `submit_deliverable(engagement_id, evidence_urls, notes)` | write · counterparty only, one-time | Attaches evidence, moves the engagement to `submitted`. Requires `accepted` status first; blocked once the deadline has passed, after the first submission, or if a URL doesn't match a bound `allowed_evidence_prefix` — further evidence goes through `raise_dispute` |
| `request_release(engagement_id)` | write | Triggers validator judgment — fetches evidence live, moves to `approved` or `rejected` based on consensus. Neither outcome pays out yet - see `settle_approved`/`settle_rejected` |
| `raise_dispute(engagement_id, evidence_urls, reason)` | write · either party | Appends evidence (also subject to the bound evidence prefix, if any) and increments the dispute round from `approved` or `rejected` — doesn't re-run judgment itself, a subsequent `request_release` call does. Blocked once that status's appeal window has closed |
| `refund_expired(engagement_id)` | write | Refunds the deposit if the deadline passed with nothing ever submitted, whether the engagement was still `created` or already `accepted` |
| `settle_approved(engagement_id)` | write · permissionless | Finalizes an approved engagement once its 3-day appeal window closes with no dispute raised — pays the deposit to the counterparty. This is the *only* way funds ever reach the counterparty |
| `settle_rejected(engagement_id)` | write · permissionless | Finalizes a rejected engagement once its 3-day appeal window closes with no dispute raised — refunds the deposit to the depositor |
| `add_comment(engagement_id, text)` | write · either party | Posts a message to the engagement's comment thread. The app end-to-end encrypts `text` client-side before calling this, so only the depositor and counterparty can read it — see [Comment privacy](#comment-privacy) |
| `register_pubkey(pubkey)` | write · global, once per address | Publishes the caller's comment-encryption public key, reusable across every engagement that address is ever a party to |
| `get_pubkey(address)` | view | An address's registered comment-encryption public key, or `""` if it hasn't registered one |
| `get_engagement(engagement_id)` | view | Full engagement record, including its comment thread, bound evidence prefix, and approval/rejection timestamps |
| `list_engagements_for(address)` | view | Engagement ids where the address is depositor or counterparty |
| `get_appeal_window_seconds()` | view | The configured appeal window, in seconds (3 days by default) |
| `list_all_ids()` | view | All engagement ids (backs the public transparency page) |

Validator judgment uses GenLayer's comparative equivalence principle: each validator independently re-fetches the evidence and re-runs the judgment prompt, then an LLM-mediated comparison checks that the `met` verdict and reasoning substantively agree — no validator's answer is ever trusted unverified.

### Why releases aren't instant

Earlier versions of this contract paid the counterparty the instant a "met" verdict landed. That meant a dispute raised afterward could only record disagreement — the money had already moved, with no way back. That's a real weakness: a dispute mechanism only means something if it can still change the outcome.

The fix mirrors a pattern this contract already had for rejections. A rejection doesn't refund the depositor immediately either — it opens a 3-day appeal window first, and only `settle_rejected` (called once that window closes undisputed) actually moves the money. Approvals now work exactly the same way: `request_release` landing on `approved` doesn't pay anyone; `settle_approved` does, and only after its own 3-day window closes with no dispute raised. A dispute raised during that window moves the engagement to `disputed` with the deposit still fully locked, and the next verdict — approval or rejection — still has to go through its own settlement step before anything moves. Funds change hands in exactly four places in the whole contract: `settle_approved`, `settle_rejected`, `decline_engagement`, and `refund_expired` — never inside `request_release` or `raise_dispute` themselves.

The tradeoff is honest: a clean approval now takes as long to finalize as a clean rejection always did (3 days by default, permissionlessly settleable by anyone the moment the window closes) instead of being instant. That's the cost of a dispute window that actually does something.

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
| **Asimov Testnet** | `4221` | `0x6D6B9Dca0c1cD8fCeB57c4158F2c2Dd73960a2D0` | GenLayer's public testnet. Needs testnet GEN — [faucet](https://testnet-faucet.genlayer.foundation/) (100 GEN/claim, weekly) |
| **Studio Network** | `61999` | `0x15f6489770e57196b66eE1e98f7080d2CeF870F9` | Hosted GenLayer Studio. Gasless — no funded account needed |

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
VITE_CONTRACT_ADDRESS_ASIMOV=0x6D6B9Dca0c1cD8fCeB57c4158F2c2Dd73960a2D0
VITE_CONTRACT_ADDRESS_STUDIONET=0x15f6489770e57196b66eE1e98f7080d2CeF870F9
VITE_REOWN_PROJECT_ID=<your project id from https://dashboard.reown.com>
```

### Contract

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install genlayer-test genvm-linter

genvm-lint check contracts/surety.py    # lint + SDK validation
pytest tests/direct/ -v                 # 56 fast, in-memory tests
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
