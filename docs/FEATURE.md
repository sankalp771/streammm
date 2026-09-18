# FEATURE / BUG TRACE

> One file, one trace per feature: how it was scoped, what was tried, what worked, what didn't, and how it was verified. Anyone — human or AI — should be able to read a block cold and know exactly how to pick up where it left off.

Bugs use the same template with `FOUND` in place of `SCOPED`.

---

## Template

```
### F-NN · <name>
Phase · Status · Model

SCOPED     What this is, and explicitly what it is not.
APPROACH   The plan, stated before implementation (habit 11).
TRIED      What was attempted, including the things that failed.
WORKED     What actually shipped.
DIDN'T     Dead ends — recorded so nobody re-walks them at hour six.
VERIFIED   The exact command or observation that proved it. Real output.
FILES      Every file touched.
```

---

## F-01 · Funded session with escrowed budget

P1 · **Not started** · —

```
SCOPED     openSession(service, ratePerSecond) payable, escrowing
           msg.value as maxBudget. NOT: pause/resume, NOT top-up,
           NOT multi-payer sessions.
APPROACH   Single struct in a mapping, incrementing sessionId.
           Accrual derived, never stored per tick (D-01).
           Cap enforced inside accrued() via min() (D-02).
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   forge test: test_AccrualMatchesRateTimesElapsed,
           test_AccrualCapsAtMaxBudget,
           test_OpenWithBudgetBelowOneSecond_Reverts
FILES      contracts/src/StreamSession.sol
           contracts/test/StreamSession.t.sol
```

---

## F-02 · Stop and settle

P1 · **Not started** · —

```
SCOPED     stopSession(id) callable by payer or settler. Settles
           accrued to treasury, refunds remainder to payer.
           NOT: partial settlement, NOT withdrawal queues.
APPROACH   Checks-effects-interactions — active = false BEFORE any
           transfer. Settler role limited to this one function (D-07).
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   test_StopSettlesAndRefundsExactly,
           test_StopByStranger_Reverts, test_StopTwice_Reverts,
           test_ReentrantStop_Reverts
           Plus on-chain: settled + refund == maxBudget, to the wei.
FILES      contracts/src/StreamSession.sol
```

---

## F-03 · Gateway authorization

P2 · **Not started** · —

```
SCOPED     Signature recovery + on-chain session read before any
           provider call. NOT: sessions/cookies, NOT rate limiting,
           NOT an account system.
APPROACH   personal_sign over sessionId + nonce; recover; read
           sessions(id) over RPC; assert payer, active, in-budget,
           service match (D-05). Provider SDK is not constructed
           until all assertions pass (CONSTRAINTS 2.3).
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   TEST_CHECKLIST §3 — all five refusal cases observed
           returning 401/403, plus PROVIDER_CALL_STARTED count of 0.
FILES      app/lib/auth.ts, app/lib/chain.ts, app/api/claude/route.ts
```

---

## F-04 · Mid-execution revocation

P2 + P4 · **Not started** · —

```
SCOPED     A 1-second chain poll that aborts the in-flight provider
           call when the session goes inactive or exhausts budget.
           This is THE product feature — everything else supports it.
APPROACH   AbortController per request; setInterval re-reading
           session state; abort() on revocation; clearInterval in a
           finally covering every exit path. The client-side
           optimistic abort is separate and is UX only (D-06).
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   TEST_CHECKLIST §4.2 — the negative test. With the
           optimistic abort disabled, the stream still dies within
           2 seconds from the chain poll alone.
FILES      app/lib/auth.ts, app/api/claude/route.ts,
           app/api/image/route.ts
```

**Note:** if §4.2 fails, the product's central claim is false and this becomes the highest-priority item in the project. See [FLOW §3](./FLOW.md#path-3--stop-the-one-that-matters).

---

## F-05 · Live spending ticker

P3 · **Not started** · —

```
SCOPED     100ms local tick, 5s on-chain reconcile, eased correction,
           clamped at maxBudget. NOT: historical charts, NOT
           cross-session totals (that's F-08).
APPROACH   startTime from the SessionOpened event, never Date.now().
           Units in seconds throughout; convert once at the boundary.
           Ease drift >0.5% over ~300ms so the number never visibly
           jumps backwards (D-08).
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   60-second observation: display within 1% of
           0.002 × 60 = 0.120 MON, and accrued() agrees.
           Page refresh mid-session recovers from chain state.
FILES      app/lib/useTicker.ts, app/lib/useSession.ts,
           app/session/[service]/page.tsx
```

---

## F-06 · Claude session

P4 · **Not started** · —

```
SCOPED     Prompt box, SSE token streaming, completion detection,
           auto-settlement. NOT: conversation history, NOT system
           prompt configuration, NOT model selection.
APPROACH   Anthropic SDK server-side with the request's AbortSignal.
           SSE events: token, complete, terminated.
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   Three consecutive clean cycles. Settled amount within 2%
           of rate × elapsed. Accrual demonstrably stops at
           completion, not at a later tick.
FILES      app/api/claude/route.ts, app/session/claude/page.tsx
```

---

## F-07 · Image session

P5 · **Not started** · —

```
SCOPED     Upload, prompt, generate, render, settle. Provider behind
           an interface. NOT: galleries, NOT history, NOT editing.
APPROACH   ImageProvider interface; MockImageProvider built FIRST as
           the demo safety net; real adapter selected by env var
           (D-09). Abort semantics differ by provider and we say so
           rather than overclaiming (D-10).
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   Ticker runs for the job's real duration; image renders;
           settlement fires unprompted; elapsed × rate matches
           settled within 2%. Provider swap verified both ways.
FILES      app/lib/providers/image/*, app/api/image/route.ts,
           app/session/image/page.tsx
```

**Integrity condition:** if the mock is what runs during the demo, disclose it out loud. See [CONSTRAINTS §6.2](./CONSTRAINTS.md#6-demo-integrity-constraints).

---

## F-08 · Simultaneous sessions and aggregate flow

P6 · **Not started** · —

```
SCOPED     Two or more live sessions, with a total flow bar that
           recomputes when one stops. NOT: cross-session budget
           caps, NOT contract-level aggregation.
APPROACH   Client-side sum over active sessions. No contract change
           required — sessions are independent on chain (D-11).
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   Both running → bar reads 0.012 MON/s. Stop Claude →
           within 1s the bar reads 0.010 and the image session is
           uninterrupted. Run twice.
FILES      app/page.tsx, app/lib/useSessions.ts
```

**Most expendable item in the plan.** If it is not clean by 5:25, revert to `checkpoint/p5-image` — see [ROLLBACK §3](./ROLLBACK.md#p6--simultaneous-sessions-unstable).

---

## F-09 · Budget exhaustion

P7 · **Not started** · —

```
SCOPED     Session self-terminates when accrued hits maxBudget,
           with no user or gateway action required.
APPROACH   The cap lives in the contract's min(), not in the
           gateway (D-02). The gateway's poll simply observes it and
           terminates; even a compromised gateway cannot exceed it.
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   0.01 MON/s at a 0.05 MON budget terminates at ~5s.
           UI shows BUDGET EXHAUSTED, ticker frozen at exactly
           maxBudget, receipt shows zero refund.
FILES      contracts/src/StreamSession.sol, app/lib/auth.ts,
           app/session/[service]/page.tsx
```

Worth demoing if the timing allows — a session ending itself with nobody touching anything is a clean, wordless proof of the liability ceiling.

---

## F-10 · Settlement receipt

P7 · **Not started** · —

```
SCOPED     Every terminal state renders runtime, rate, settled
           amount, refund, and a clickable explorer link.
APPROACH   Read from the SessionSettled event, never from the local
           ticker. The event is the only authoritative number
           (FLOW, cross-cutting section).
TRIED      —
WORKED     —
DIDN'T     —
VERIFIED   All terminal states — complete, stopped, exhausted,
           provider error — produce a receipt. settled + refund
           == maxBudget for each.
FILES      app/components/Receipt.tsx, app/session/[service]/page.tsx
```

---

## Bug log

No bugs recorded yet. Use the same template with `FOUND` in place of `SCOPED`:

```
### B-NN · <symptom as observed, not as diagnosed>
Phase · Status · Model

FOUND      What was observed, and what was being done at the time.
APPROACH   The hypothesis, before the fix.
TRIED      Everything attempted, including what failed.
WORKED     The actual fix.
DIDN'T     Dead ends — this is the most valuable field at hour six,
           because it stops the next session re-walking them.
VERIFIED   The command or observation that proved it fixed.
FILES      Every file touched.
```

Write the symptom as observed, not as diagnosed. "Counter runs 1000× too fast" is useful; "rate bug" sends the next session looking in the wrong file.
