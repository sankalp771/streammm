# DECISIONS

> Code shows what changed. This file shows why. Six months later — or six hours later, at 3 a.m. — the "why" is the only thing that stops a settled argument from being re-litigated.

Every entry records the model that reasoned through it (field guide habit 14), because behaviour shifts between models and knowing which one made a call matters when you are debugging it later.

**Template for new entries:**

```
### D-NN · Title
Date · Model · Status
Decision: …
Why: …
Rejected: … because …
Revisit if: …
```

---

### D-01 · Flow-rate accounting, not per-second transactions

`2026-09-18` · carried forward from v1 · **Locked**

**Decision:** The contract stores `ratePerSecond`, `startTime` and `lastCheckpoint`, and derives the accrued amount arithmetically. Transactions happen only at state transitions: open, optional checkpoint, stop.

```
accrued = min( ratePerSecond × (block.timestamp − startTime), maxBudget )
```

**Why:** A transaction per second is a bad system on any chain — it is expensive, it is rate-limited, and it makes the UI a queue of pending transactions instead of a live readout. Deriving the value means the chain is continuously readable while costing three transactions per session.

**Rejected:** per-tick transactions, because they scale with time rather than with events; off-chain accounting with periodic settlement, because then the chain is a receipt printer and the authorization claim in [PRD §3](./PRD_V2.md#3-the-correction-that-must-never-be-garbled) collapses.

**Revisit if:** never, for this build. This was the correct call in v1 and it survives v2 intact.

---

### D-02 · v2 adds a mandatory maximum budget

`2026-09-18` · Opus 5 · **Locked**

**Decision:** Every session escrows a `maxBudget` at open. `accrued` is capped at it by `min()`.

**Why:** A rate without a ceiling is unbounded liability. Any bug — a stuck poll, a gateway crash before settlement, a dropped connection — becomes an open-ended charge against the user. Capping inside `accrued()` means the ceiling is enforced by the contract holding the money, so no gateway bug can exceed it.

It also produces a demonstrable moment: a 0.05 MON budget at 0.01 MON/s terminates itself after five seconds with nobody touching anything.

**Rejected:** rate-only sessions with a gateway-enforced cap, because the enforcement would then live in the component most likely to be buggy and least likely to be trusted.

**Revisit if:** never. This is the most important structural change from v1.

---

### D-03 · A backend is now required

`2026-09-18` · Opus 5 · **Locked**

**Decision:** Introduce the AI Gateway tier. Retire v1's "no backend" constraint.

**Why:** The browser cannot hold a production Anthropic key. There is no clever way around this — not proxying, not scoping, not short-lived tokens issued client-side. Once an AI provider sits behind the payment, a trusted server has to stand between the user and that provider.

**Rejected:** browser-direct calls with a user-supplied key, because then the product is "bring your own API key" and the payment stream authorizes nothing; a serverless signing scheme, because it is strictly more complexity for the same trust requirement.

**Revisit if:** the provider ever supports capability tokens scoped to a spend limit, which would make browser-direct calls genuinely safe. Not in this decade's hackathon.

---

### D-04 · Gateway lives inside the Next.js app

`2026-09-18` · Opus 5 · **Locked**

**Decision:** Route handlers in the same Next.js project as the frontend, on the Node runtime. One repository, one deployment.

**Why:** A separate backend service means a second deploy, a second environment, CORS, and a second thing that can be down during the demo. Route handlers give a server-side boundary with zero additional infrastructure. Node runtime rather than Edge, because the Anthropic SDK and long-lived SSE streams want it.

**Rejected:** a separate Express or Fastify service, because deployment cost is real and the demo is on one machine; Edge runtime, because of streaming and SDK constraints.

**Revisit if:** the gateway ever needs to outlive a request — background jobs, webhooks, queued work. None of which exists in this build.

---

### D-05 · Authorization is signature plus chain read

`2026-09-18` · Opus 5 · **Locked**

**Decision:** The client sends a `personal_sign` signature over a message containing the session ID and a nonce. The gateway recovers the signer, reads the session from chain, and asserts signer equals payer, session is active, accrued is under budget, and the service matches.

**Why:** The signature proves who is asking. The chain read proves the session is real and live. Either alone is insufficient — a signature without a chain read authorizes a stopped session, and a chain read without a signature lets anyone who learns a session ID spend someone else's budget. Session IDs are public on chain, so this is not hypothetical.

`personal_sign` costs no gas and takes one click.

**Rejected:** session-ID-only auth, because IDs are public; a JWT issued at open, because it would have to be revoked on stop and revocation is exactly the chain state we already have; SIWE, because it is heavier than needed for a single-purpose binding.

**Revisit if:** the flow ever needs more than one request per session without re-signing — then cache a short-lived token keyed to the signature, still re-validating against the chain.

---

### D-06 · Enforcement is a one-second chain poll; the optimistic abort is UX

`2026-09-18` · Opus 5 · **Locked**

**Decision:** While a request is in flight, the gateway re-reads session state every second and aborts the provider call on revocation or exhaustion. Separately, the client sends an immediate `abort` on STOP for perceived latency. The poll is authoritative; the optimistic abort is presentation.

**Why:** The product claim is that *money controls service access*. If the only thing stopping the AI were a client-sent abort, the claim would be false — the chain would be a bystander. The poll is what makes the claim true. But waiting up to a second plus block time for the UI to react looks broken, hence the optimistic path.

**This distinction must be stated accurately in the demo** — see [CONSTRAINTS §6.3](./CONSTRAINTS.md#6-demo-integrity-constraints). Overstating the mechanism is catchable by anyone watching the network tab.

**Rejected:** client-abort only, because it falsifies the thesis; event subscription instead of polling, because WebSocket RPC reliability is one more demo-time failure mode and a 1-second poll is cheap on Monad.

**Revisit if:** poll latency ever becomes the bottleneck. It will not at demo scale.

---

### D-07 · A settler role on the contract

`2026-09-18` · Opus 5 · **Locked**

**Decision:** `stopSession` is callable by the payer **or** by a backend settler wallet configured at deploy. The settler can do nothing else.

**Why:** Without it, every completed run ends with a wallet popup. Four session cycles in a three-minute demo means four interruptions in the pitch's flow. The settler costs about ten lines of contract code and its power is strictly limited to ending a session — it cannot open one, redirect funds, or alter a rate, so the convenience buys no trust problem.

**Rejected:** user-signed settlement on every completion, because of demo friction; a keeper or cron settler, because it is infrastructure we do not have time to run.

**Revisit if:** the settler key is ever at risk of leaking. Worst case it can end sessions early, which settles honestly at the elapsed amount — an annoyance, not a theft.

---

### D-08 · Ticker is local, reconciled, and never jumps backwards

`2026-09-18` · Opus 5 · **Locked**

**Decision:** The UI ticks locally at 100 ms and reconciles against `accrued()` every 5 seconds. On drift above 0.5%, the display eases toward chain truth over ~300 ms rather than snapping.

**Why:** Block timestamps are coarse; a display driven directly by them stutters. A purely local ticker drifts from truth and eventually shows a number the chain disagrees with — which is the number a judge might check. Local for smoothness, chain for truth, easing so corrections are invisible.

A counter that visibly jumps backwards reads as a bug even when it is displaying the correct value. Perception matters here.

**Rejected:** chain-only (stutters); local-only (drifts, and a drifting money counter is indefensible if checked).

**Revisit if:** the ticker is cut under time pressure — see the standing cut order in [PHASES.md](./PHASES.md#standing-cut-order). If reconciliation is cut, say so honestly rather than implying the display is chain-verified.

---

### D-09 · Image provider behind an interface, mock built first

`2026-09-18` · Opus 5 · **Locked**

**Decision:** Define `ImageProvider` with `generate(prompt, sourceImage, signal)`. Build `MockImageProvider` (8-second wait, bundled PNG) **before** attempting any real provider. Select by environment variable.

**Why:** The provider is not chosen yet, and a hackathon is exactly the wrong place to discover that a signup requires business verification or that a key takes an hour to activate. The interface means the choice can be deferred to the last possible moment and swapped by config rather than by refactor. The mock is the safety net that guarantees the image beat of the demo exists no matter what.

**Integrity condition:** if the mock is what runs, say so out loud. The economic session is the product, so this costs nothing.

**Rejected:** picking a provider now and coding directly against its SDK, because it couples the demo's most visual beat to an external signup we do not control.

**Revisit if:** a key is confirmed working before P5 — the interface still stays, because it is what makes the fallback possible.

---

### D-10 · Abort semantics differ by provider, and we say so

`2026-09-18` · Opus 5 · **Locked**

**Decision:** On revocation, abort the provider call through its `AbortSignal` where supported. Where the provider cannot cancel a job in flight, discard the result and do not bill the user past the stop point.

**Why:** Token streaming aborts cleanly; many image jobs do not. Pretending otherwise would be a claim that breaks under a single informed question. The honest framing is that authorization ends at the stop, the provider-side cost after that is ours to absorb, and a production version would price that asymmetry in. That answer demonstrates that we have thought about the economics, which is the point of the project.

**Rejected:** claiming universal cancellation, because it is false and checkable.

---

### D-11 · Multi-session aggregation is a view concern

`2026-09-18` · Opus 5 · **Locked**

**Decision:** Sessions are independent on chain. The aggregate flow bar is a client-side sum over active sessions. No contract support.

**Why:** A contract-level aggregate would need per-user session indexing, which is storage, gas, and complexity for a number that is visual. Summing client-side is correct, free, and takes minutes.

**Rejected:** an on-chain `totalFlowOf(address)`, because it buys nothing the client cannot compute and costs an hour.

**Revisit if:** a future version needs cross-session budget caps. Genuinely interesting; explicitly out of scope.

---

### D-12 · Stack: Foundry, Next.js 14, wagmi v2, viem, Tailwind

`2026-09-18` · Opus 5 · **Locked**

**Decision:** As stated. Injected wallet connector only — no wallet-selection modal library.

**Why:** Foundry's test loop is fast enough to matter when the contract phase is seventy minutes. Next.js gives frontend and gateway in one deploy (D-04). wagmi and viem are the least-surprising Monad-compatible EVM stack. A wallet modal library is a dependency and a failure mode for a demo that runs on one machine with one wallet.

**Rejected:** Hardhat (slower loop); RainbowKit or ConnectKit (unnecessary surface); a separate frontend and backend (D-04).

---

### D-13 · Monad testnet, chain ID 10143

`2026-09-18` · Opus 5 · **Locked, verify at P0**

**Decision:** Deploy to Monad testnet — chain ID `10143`, native token MON, RPC `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadscan.com`, faucet `https://faucet.monad.xyz`.

**Why:** Free MON, and the demo needs many sessions across rehearsals.

**Verify at P0:** `cast chain-id` against the RPC before writing a line of contract code. Note that the testnet was reset from genesis in December 2025, so any older deployment address is dead. Have a second RPC endpoint ready (Ankr or the Monad Foundation endpoint) in case the primary rate-limits during rehearsals — this is a real risk with a 1-second poll and twenty test runs behind you.

---

### D-14 · Documentation standard is the AI Collaboration Field Guide

`2026-09-18` · Opus 5 · **Locked**

**Decision:** All project documentation follows the field guide's structure — five core files, four guardrail files, six review habits — as mapped in the [README compliance table](./README.md#field-guide-compliance).

**Why:** A seven-hour solo sprint with heavy AI assistance is precisely the scenario the guide was written for. Context evaporates between sessions, and at hour five the difference between a recoverable state and a lost one is whether HANDOVER and ROLLBACK were actually maintained.

The habit that earns its keep most here is habit 15 — own the mental model. Code you cannot explain is code you cannot fix under time pressure, and under time pressure is the only condition this project will ever be debugged in.
