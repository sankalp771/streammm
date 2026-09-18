# FLOW

> How execution actually travels — between files, functions, and modules. Bugs live in the gaps between files. If you cannot see the flow, you cannot see where it breaks.

Five traced paths. Each names every file the execution passes through, in order.

---

## Path 1 — Opening a session

```
User clicks "Start Session"
  │
  ▼
app/session/[service]/page.tsx
  └─ onStart()
       │
       ▼
lib/useSession.ts → openSession()
  ├─ reads rate + budget from component state
  ├─ service = keccak256(toBytes("CLAUDE"))
  │
  ▼
wagmi writeContract()
  └─ StreamSession.openSession(service, ratePerSecond)
       value: maxBudget
       │
       ▼  ══════ TRUST BOUNDARY: browser → chain ══════
       │
contracts/src/StreamSession.sol → openSession()
  ├─ require(ratePerSecond > 0)
  ├─ require(msg.value >= ratePerSecond)     ← at least one second of runway
  ├─ sessions[id] = Session{ payer: msg.sender, ..., active: true }
  ├─ startTime = lastCheckpoint = block.timestamp
  └─ emit SessionOpened(id, payer, service, rate, budget)
       │
       ▼
lib/useSession.ts
  ├─ waits for receipt, parses SessionOpened, extracts sessionId
  ├─ setState({ sessionId, startTime, rate, budget, status: ACTIVE })
  │
  ▼
lib/useTicker.ts → start(startTime, rate, budget)
  └─ 100ms interval begins; 5s reconcile timer begins
```

**Where this breaks:** `startTime` comes from the *block* timestamp, not from the browser's clock. Reading it from `Date.now()` at the moment of the click produces a ticker that is wrong by the block time and drifts from chain truth immediately. Always take `startTime` from the emitted event.

---

## Path 2 — An authorized Claude request

```
User submits prompt
  │
  ▼
app/session/[service]/page.tsx → onSubmit()
  │
  ▼
lib/useSession.ts → signAuthMessage()
  └─ personal_sign over:
       "Stream session authorization\nsessionId: 7\nnonce: 0x…\nissued: …"
       (off-chain, no gas)
  │
  ▼
fetch POST /api/claude  { sessionId, signature, nonce, prompt }
  │
  ▼  ══════ TRUST BOUNDARY: browser → gateway ══════
  │
app/api/claude/route.ts
  │
  ├─▶ lib/auth.ts → authorize(sessionId, signature, nonce, "CLAUDE")
  │     ├─ verifyMessage() → recovered address
  │     ├─ lib/chain.ts → publicClient.readContract("sessions", [id])
  │     │     │
  │     │     ▼  ══════ TRUST BOUNDARY: gateway → chain ══════
  │     │   StreamSession.sol → sessions(id)  [view]
  │     │
  │     ├─ assert recovered === session.payer        else 401
  │     ├─ assert session.active === true            else 403 session_inactive
  │     ├─ assert accrued < maxBudget                else 403 budget_exhausted
  │     ├─ assert session.service === CLAUDE         else 403 service_mismatch
  │     └─ assert nonce unused                       else 401 replay
  │
  │     ✗ ANY FAILURE → return early. The Anthropic SDK is never constructed.
  │
  ├─▶ const controller = new AbortController()
  ├─▶ lib/auth.ts → watchAuthorization(sessionId, 1000ms, onRevoked)
  │     └─ setInterval: re-read session
  │          if !active || exhausted → controller.abort()
  │
  ├─▶ anthropic.messages.stream({ ... }, { signal: controller.signal })
  │     └─ for await (chunk) → SSE: event: token
  │
  └─▶ on natural end   → SSE: event: complete
      on abort         → SSE: event: terminated  { reason }
      always           → clearInterval(watch)
       │
       ▼
app/session/[service]/page.tsx
  └─ EventSource handlers append tokens / render terminal state
```

**Where this breaks:** forgetting `clearInterval` on every exit path leaks a 1-second RPC poll per request for the lifetime of the process. On a demo laptop with twenty test runs behind it, that is twenty pollers hammering the RPC and getting rate-limited exactly when the judges are watching. Put the cleanup in a `finally`.

---

## Path 3 — STOP (the one that matters)

Two independent tracks run concurrently. The distinction between them is the single most important thing to understand in this codebase.

```
User clicks STOP
  │
  ├──────────── TRACK A: perception (fast, not authoritative) ────────────┐
  │                                                                       │
  │  page.tsx → setStatus(STOPPING)                                       │
  │    ├─ lib/useTicker.ts → freeze()      counter stops instantly        │
  │    ├─ prompt input disabled                                           │
  │    └─ fetch POST /api/abort { sessionId, signature }                  │
  │         └─ route looks up the in-memory controller → abort()          │
  │            ~50ms. This is UX. It is NOT the enforcement.              │
  │                                                                       │
  ├──────────── TRACK B: authority (slower, authoritative) ───────────────┤
  │                                                                       │
  │  lib/useSession.ts → stopSession()                                    │
  │    └─ wagmi writeContract → StreamSession.stopSession(id)             │
  │         │                                                             │
  │         ▼                                                             │
  │       StreamSession.sol → stopSession()                               │
  │         ├─ require(active)                                            │
  │         ├─ require(msg.sender == payer || msg.sender == settler)      │
  │         ├─ uint256 owed = accrued(id)                                 │
  │         ├─ active = false            ← EFFECT BEFORE INTERACTION      │
  │         ├─ settledAmount = owed                                       │
  │         ├─ treasury.call{value: owed}("")                             │
  │         ├─ payer.call{value: maxBudget - owed}("")                    │
  │         └─ emit SessionSettled(id, runtime, owed, refund)             │
  │              │                                                        │
  │              ▼                                                        │
  │       lib/auth.ts → watchAuthorization poll (≤1s later)               │
  │         └─ reads active == false → controller.abort()                 │
  │              └─ Anthropic stream dies → SSE: terminated               │
  └───────────────────────────────────────────────────────────────────────┘
       │
       ▼
page.tsx → renders receipt from the SessionSettled event
  runtime · rate · settled · refunded · explorer link
```

**Track B alone is sufficient.** Track A only shortens the perceived latency. The way to prove this to yourself — and the negative test in [TEST_CHECKLIST §4](./TEST_CHECKLIST.md#4-stop-enforcement) — is to disable Track A entirely and confirm the stream still dies within two seconds.

**Never claim Track A is the enforcement.** A judge watching the network tab can see the difference, and being caught overstating the mechanism costs more than the mechanism buys.

---

## Path 4 — Budget exhaustion (nobody presses anything)

```
Session opened: rate 0.01 MON/s, budget 0.05 MON  →  5 seconds of runway
  │
  ├─ t=0..5s   normal execution
  │
  ├─ t=5s      StreamSession.accrued() returns 0.05 (the min() cap binds)
  │
  ├─ t≈5s      lib/auth.ts watch poll:
  │              accrued >= maxBudget → controller.abort()
  │              → SSE: terminated { reason: "budget_exhausted" }
  │
  ├─ page.tsx  → status BUDGET_EXHAUSTED, ticker frozen at exactly maxBudget
  │
  └─ settlement: either the user signs stopSession, or the settler wallet
                 does it automatically. accrued == maxBudget, refund == 0.
```

**The point to make out loud:** the cap lives in the contract's `min()`, not in the gateway. Even if the gateway were compromised or simply buggy, it could not cause a charge above the escrowed budget. The liability ceiling is enforced by the thing holding the money.

---

## Path 5 — AI finishes before the user stops

```
Anthropic stream ends naturally
  │
  ▼
app/api/claude/route.ts
  ├─ clearInterval(watch)
  └─ SSE: event: complete
       │
       ▼
page.tsx → onComplete()
  ├─ lib/useTicker.ts → freeze()
  └─ settle():
       ├─ default:  settler wallet calls stopSession (no wallet popup)
       └─ fallback: user signs stopSession
       │
       ▼
StreamSession.stopSession() → SessionSettled
       │
       ▼
page.tsx → receipt
  "✓ TASK COMPLETE · 00:47 · 0.094 MON streamed"
```

**Why the settler role exists:** without it, every completed run ends with a wallet popup. In a three-minute demo with four session cycles, that is four interruptions in the flow of the pitch. The settler wallet can only stop sessions — it cannot open them, move funds elsewhere, or change a rate — so the convenience costs nothing in trust.

**The thesis check:** accrual stops at the moment of settlement, not at some later polling tick. The user does not pay for a single second after the work finished. If this is ever observed to be false, it is the highest-priority bug in the project, because it falsifies the product's central claim.

---

## Cross-cutting: where the money number comes from

Three different numbers exist and they must never be confused.

| Number | Source | Used for | Authoritative? |
|--------|--------|----------|----------------|
| Ticker value | `rate × (Date.now()/1000 − startTime)` in the browser | Smooth display | No |
| `accrued()` | Contract view call | 5-second reconciliation | Yes, for the live value |
| `SessionSettled.amount` | Emitted event | The receipt | **Yes. This is the real number.** |

Every receipt, every shown total, and anything a judge is invited to verify comes from the event. The ticker is presentation.
