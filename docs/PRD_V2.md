# PRD v2 — STREAM

**Status:** Approved for build
**Supersedes:** PRD v1 (livestream tipping prototype)
**Build window:** ~7 hours, solo
**Demo date:** 19 September
**Target chain:** Monad Testnet (chain ID 10143, native token MON)

---

## 1. One line

Stream is a Monad-powered payment and authorization layer for AI services, where a user opens a continuous MON spending stream and pays only while the service is actively working.

```
Start  →  AI works  →  MON flows  →  Service finishes / user stops  →  Stream settles
```

---

## 2. The problem

AI products today are paid for through subscriptions, prepaid credits, fixed per-request API pricing, or monthly plans. Every one of these decouples the moment of payment from the moment of work. You pay before the work, or after it, or on a calendar that has nothing to do with it.

For services that take real wall-clock time to execute — long reasoning chains, code execution, image generation, research agents, GPU workloads, autonomous agents — the user has no native concept of *"I am paying this service while it is actively doing work, and I can stop paying, which stops the work."*

Payment is a receipt. It is not a control surface. Stream asks what happens when you make it one.

---

## 3. The correction that must never be garbled

This is the most important paragraph in the document. Rehearse it until it is reflexive, because a judge will probe it and a fumbled answer sinks the pitch.

**We are not claiming that Claude, or any image model, charges by the second.** Anthropic's API economics are token-based. Image providers bill per image or per compute-second on their own terms. None of that changes, and Stream does not pretend otherwise.

**What Stream does is create a continuous, MON-denominated economic session wrapped around an AI service.** The application sets the price — "Claude access through Stream costs 0.002 MON per second" — and the backend consumes the provider's API under its own normal pricing. The margin, or the loss, between the two is the application's business, exactly as it is for any reseller.

The precise claim is therefore:

> Stream is an **economic abstraction layer** between a user and an AI service. It converts a funded on-chain stream into a live authorization to execute, and settles in proportion to the time the service was authorized and working.

Two framings to have ready:

- **If a judge says "so it's just a wrapper with a timer"** — the timer is not the product. The authorization is. The gateway will not call the provider when the stream is inactive or exhausted, and it re-checks that on chain mid-execution. Money is the gate, not the invoice.
- **If a judge says "streaming payments already exist"** — correct, and we say so ourselves (§11). Continuous payment is not our claim to novelty. The combination of a funded economic session, service authorization derived from it, and real-time execution state bound to it is what we are demonstrating.

---

## 4. The core idea

A user picks an AI service and a maximum spending rate, then funds a session.

```
Service       Claude
Rate          0.002 MON / second
Budget        2 MON
```

They press **Start Session** and sign one transaction. From that moment:

- The stream is **ACTIVE**, and the gateway is permitted to call Claude on their behalf.
- The UI shows runtime, current rate, consumed MON, and remaining budget, updating continuously.

```
● STREAM ACTIVE

Runtime      01:42
Rate         0.002 MON/s
Consumed     0.204 MON
Remaining    1.796 MON
```

When the AI finishes, the stream stops and settles automatically. If the user hits **STOP** first, authorization is revoked, the service loses the right to keep working, and the stream settles at whatever had accrued. If the budget runs out, the same thing happens without anybody pressing anything.

---

## 5. Why Monad

The honest version, which is stronger than the hackathon version.

Stream is a system of **frequent, small, real-time economic state changes**. Sessions open and close constantly, several can run at once, and the authorization check that gates execution is a chain read on a one-second cadence. A settlement layer that is slow or expensive per state change makes the primitive feel like a form submission instead of a live control.

Crucially, the design does **not** send a transaction every second — that would be a bad system on any chain. The contract stores a flow rate and timestamps, and derives the accrued amount arithmetically:

```
accrued = min( ratePerSecond × (now − startTime),  maxBudget )
```

Transactions happen only at state transitions: open, optional checkpoint, stop. Between them, the chain is a continuously readable source of truth that the UI and gateway both poll. Monad's throughput and low-latency reads are what let a one-second authorization poll be a normal thing to do rather than a rate-limit problem, and what make the multi-session demo (§9) feel simultaneous rather than queued.

Monad is the **settlement and authorization layer**. It is not the execution layer, and we should never imply that it is.

---

## 6. Product surface

### 6.1 Dashboard

The landing surface lists the services that actually work in this build. Nothing else. A card for a service we cannot demo is a card a judge will ask us to click.

```
STREAM

Claude                          Image Generation
Reasoning & analysis            Generate images
0.002 MON/s                     0.010 MON/s
```

When at least one session is live, a persistent aggregate bar appears:

```
TOTAL ACTIVE FLOW    0.012 MON/sec
```

### 6.2 Service 1 — Claude

Pre-session, the user sets rate and budget. Post-start, they get a normal prompt box and a streamed response, with the live ticker pinned above it and a large **STOP SERVICE** button that is impossible to miss.

On completion:

```
✓ TASK COMPLETE

Runtime      00:47
Rate         0.002 MON/s
Streamed     0.094 MON
Settlement   0x7a3f…c210
```

### 6.3 Service 2 — Image generation

The visual payload. The user uploads a photo and prompts, for example, *"Transform this into an authentic 1980s Bollywood movie poster."* The ticker runs while the job runs; the image lands; the stream settles.

```
✓ GENERATION COMPLETE

Time         8.4 seconds
Streamed     0.084 MON
```

This is the most legible demonstration of the whole thesis in a single eight-second beat: service running → money flowing → service finished → settled.

### 6.4 STOP — the feature that carries the pitch

STOP must be visually the loudest element on the session screen. What it does, in order:

1. The UI freezes the counter immediately and marks the session `STOPPING`.
2. A stop transaction goes to Monad.
3. The contract settles the accrued amount and refunds the unused budget.
4. The gateway's authorization poll observes `active == false` and terminates the in-flight provider call.
5. The UI shows a settlement receipt.

```
SESSION STOPPED

Runtime      01:17
Consumed     0.154 MON
Refunded     1.846 MON
```

The relationship being demonstrated is not *blockchain payment → AI*. It is **economic stream → authorization → service execution**. Stopping the money stops the work.

---

## 7. Session lifecycle

| Step | Actor | What happens |
|------|-------|--------------|
| 1 | User | Selects service |
| 2 | User | Sets rate and maximum budget |
| 3 | User | Signs `openSession` — budget is escrowed in the contract |
| 4 | User | Signs an off-chain auth message binding the session ID (no gas) |
| 5 | Gateway | Verifies signature, reads session on chain, confirms active + in-budget + correct service |
| 6 | Gateway | Calls the provider; re-checks authorization every second while streaming |
| 7 | UI | Ticks locally at 100 ms, reconciles against the chain every 5 s |
| 8 | Either | AI completes, user stops, or budget exhausts |
| 9 | Contract | Settles accrued to treasury, refunds the remainder to the payer |
| 10 | UI | Renders the receipt with the transaction hash |

---

## 8. The three ways a session ends

All three must work, and all three must be demonstrated or at least explainable.

**AI finishes first.** The gateway signals completion, the frontend triggers the stop, settlement happens at the elapsed amount. The user does not keep paying after the work is done — this *is* the product thesis, so it has to be visibly true.

**User stops first.** As described in §6.4. Authorization is revoked and the provider call is aborted where the provider supports cancellation; where it does not, the gateway discards the result and the user is not billed beyond the stop point. Be honest about this distinction if asked — some image jobs cannot be cancelled mid-flight, and the truthful answer is that authorization ends at the stop, the provider-side cost is ours to eat, and that asymmetry is exactly the kind of thing a real version of this would price in.

**Budget exhausts.** Because `accrued` is capped at `maxBudget` in the contract, the session cannot accrue beyond what was escrowed. The gateway treats `accrued == maxBudget` as unauthorized and terminates. **There is no unlimited liability, ever.** This is why the v2 session model carries a maximum budget and not only a rate — it is the single most important change from v1.

---

## 9. Multiple simultaneous services

Two or more sessions can be live at once. The dashboard aggregates:

```
CLAUDE       0.002 MON/s
IMAGE        0.010 MON/s
─────────────────────────
TOTAL        0.012 MON/s
```

Stopping one recomputes the total live, in front of the judges. This needs no contract support — sessions are independent, and aggregation is a client-side sum over active sessions. Keeping it a view concern is what makes it cheap enough to build in the time available.

---

## 10. Scope: what we are not building

Explicitly out, for this build, no exceptions:

An AI marketplace. Multiple providers per service. Real decentralized compute. A token marketplace. Subscriptions. Accounts, profiles or auth beyond the wallet. A mobile app. Real-time video. A custom model. Analytics dashboards. A DAO. NFTs of any kind for any reason.

One economic primitive, demonstrated beautifully. That is the whole brief.

---

## 11. Positioning against the obvious comparison

The v1 concept (NiftySubs) was *pay while watching content*. Stream is *pay while an arbitrary computational service is actively working*. The move is from content monetization to **service execution economics**, and the thing that changes is that the payment stream carries authority — it does not merely record value transfer, it gates whether the work is allowed to continue.

We should say out loud that continuous payment streams are not new. Claiming otherwise invites a judge who knows the space to dismiss everything else we say. The defensible claim is the combination: funded economic session **plus** service authorization derived from it **plus** live execution state bound to it.

---

## 12. The bigger vision

If the primitive holds for Claude and image generation, the same rail extends to autonomous agents given a live budget rather than a key, GPU compute that runs while funding is active, research agents that spend while searching, code execution funded per second of runtime, human experts paid while a session is live, and APIs paid for while a connection is open.

Stream becomes an economic rail for services, not another AI app. Say this at the end of the pitch, in one breath, and then stop talking.

---

## 13. MVP definition — the ship list

Anything not on this list does not get built before everything on it works.

**Contract**

- Open a funded session with service, rate, and escrowed maximum budget
- Flow-rate accrual derived from timestamps, capped at budget
- Stop and settle, callable by payer or by the backend settler
- Refund of unused budget to the payer
- Read functions for accrued, remaining, and authorization status

**Gateway (backend)**

- Anthropic API integration with server-side key, never exposed to the browser
- Image provider integration behind a swappable interface
- Signature verification and on-chain session verification before execution
- Mid-execution authorization re-check with termination on revocation
- Service and rate matching so a cheap session cannot buy an expensive service

**Frontend**

- Wallet connection to Monad testnet
- Service selection with rate and budget entry
- Live spending ticker with on-chain reconciliation
- Claude prompt and streamed response
- Image upload, prompt, and result
- A loud STOP button
- Settlement receipt with transaction hash
- Aggregate flow bar across simultaneous sessions

---

## 14. The three-minute demo

Do not spend three minutes explaining blockchains. Spend twenty seconds on the problem and two and a half minutes on the thing working.

**0:00–0:20 — The claim.** *"AI APIs charge by request or by token, and the user has no native economic control over a service while it runs. Stream turns payment into a live authorization channel."* Connect wallet.

**0:20–1:10 — Claude, and the stop.** Prompt: *"Analyze this code and find the most likely production bug."* Ticker runs. Let it run about fifteen seconds so the numbers are legible, then hit STOP mid-response. The response visibly halts. Receipt shows the settled amount.

**1:10–2:00 — Image, and completion.** Upload the photo, prompt the poster, start the stream. Cost ticks. The image lands. Stream settles on its own. `✓ COMPLETE — 8.7 sec — 0.087 MON`.

**2:00–2:30 — Two at once.** Start both, show `TOTAL 0.012 MON/s`, stop one, watch the total change live.

**2:30–3:00 — The close.** *"We aren't putting AI behind a crypto paywall. We're making money a live control signal for AI services."* Then show the Monad transactions and stop talking.

**On the 1980s poster:** it is the demo payload, not the product. If anyone in the room describes this project as an AI poster generator with crypto attached, the pitch has failed. The poster exists because it produces an instantly recognizable visual result in eight seconds, which is exactly the length of beat the demo needs.

---

## 15. The sentence to memorize

> Stream turns money into a live control signal: users continuously fund an AI service on Monad, and the service can only keep working while that economic stream is active.

Say it, then demonstrate it immediately. Do not elaborate before the demo.

---

## 16. What changes from the v1 documentation

The existing docs are well organized and should be updated, not discarded.

| File | Change |
|------|--------|
| `ARCHITECTURE.md` | Add the AI Gateway. v1's browser-to-contract topology no longer holds. |
| `FEATURES.md` | Replace livestream features with: Claude session, image session, live spend, service authorization, stop and settlement, simultaneous sessions. |
| `FLOW.md` | Replace `viewer → livestream` with `user → session → stream → gateway → AI → settlement`. |
| `DECISIONS.md` | Keep the flow-rate decision — it was right and it survives intact. Add the backend, budget-cap, and authorization decisions. |
| `CONSTRAINTS.md` | **Remove the "no backend" constraint.** It was correct for v1 and is wrong for v2. Replace it with the API-key constraint. |
| `TEST_CHECKLIST.md` | Add: key never reaches browser; unauthorized session cannot execute; stop terminates authorization; exhaustion terminates session; completion settles correctly; both services work; two sessions reconcile. |
| `ROLLBACK.md` | Keep the checkpoint philosophy unchanged. It is well suited to a time-boxed build. |

The v1 principle that a working earlier checkpoint beats a broken ambitious one is the single most valuable thing carried forward. It governs every phase gate in [PHASES.md](./PHASES.md).
