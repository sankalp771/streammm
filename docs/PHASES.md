# PHASES — 7-hour solo build plan

**Constraint set:** one builder, ~7 hours, no code written yet, demo on 19 September.

Nine phases. Each one has an entry condition, a plan-first prompt (habit 11), a single concrete deliverable, a verification gate (habit 8), and a checkpoint tag (habit 9). **A phase is not done because the code exists. It is done because its gate passed.**

Two rules govern the whole sprint:

1. **Never start phase N+1 with phase N's gate failing.** Roll back instead — see [ROLLBACK.md](./ROLLBACK.md).
2. **If you are behind at a phase boundary, cut from the cut-list, not from the gate.** A shipped smaller thing beats a broken larger thing. Every phase below names what to cut.

---

## Time budget at a glance

| Phase | Window | Cumulative | Deliverable |
|-------|--------|-----------|-------------|
| P0 | 0:00 – 0:25 | 0:25 | Repo scaffold, wallet funded, chain reachable |
| P1 | 0:25 – 1:35 | 1:35 | `StreamSession.sol` deployed and verified on Monad testnet |
| P2 | 1:35 – 2:20 | 2:20 | Gateway authorization module — proven to reject |
| P3 | 2:20 – 3:20 | 3:20 | Frontend opens a real session and ticks live |
| P4 | 3:20 – 4:10 | 4:10 | **Claude end to end, and STOP kills it mid-stream** |
| P5 | 4:10 – 4:55 | 4:55 | Image generation session end to end |
| P6 | 4:55 – 5:25 | 5:25 | Simultaneous sessions + aggregate flow |
| P7 | 5:25 – 6:10 | 6:10 | Budget exhaustion, failure paths, receipts |
| P8 | 6:10 – 7:00 | 7:00 | Three clean rehearsals + backup recording |

**P4 is the product.** If everything after P4 fails, you still have a demo that proves the thesis. If P4 fails, nothing after it matters. Protect that hour.

---

## P0 — Scaffold and chain sanity · 0:00–0:25

**Entry condition:** nothing exists.

**Plan-first prompt:** *"Before writing anything, list the exact directory structure, the dependency list with versions, and the environment variables this project will need. Do not create files until I confirm the list."*

### Deliverable

A repository that builds, a funded testnet wallet, and a proven RPC connection.

- `stream/contracts/` — Foundry project (`forge init`)
- `stream/app/` — Next.js 14 App Router, TypeScript, Tailwind
- `stream/docs/` — this documentation set, committed
- `.env.local` populated and `.env.example` committed with empty values
- Deployer wallet funded from `https://faucet.monad.xyz`

### Environment variables

```bash
# server-only — never prefixed NEXT_PUBLIC_
ANTHROPIC_API_KEY=
IMAGE_PROVIDER_KEY=
SETTLER_PRIVATE_KEY=
TREASURY_ADDRESS=

# safe to expose
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_STREAM_CONTRACT=
```

### Gate

```bash
cast chain-id --rpc-url https://testnet-rpc.monad.xyz     # → 10143
cast balance $DEPLOYER --rpc-url https://testnet-rpc.monad.xyz   # → non-zero
cd app && npm run build                                    # → exits 0
```

**Checkpoint:** `git tag checkpoint/p0`

**Cut list:** nothing. This phase has no fat. If it takes more than 25 minutes, the problem is the faucet — start it draining in the background and proceed to P1 against a local anvil fork.

---

## P1 — The contract · 0:25–1:35

**Entry condition:** P0 gate green.

**Plan-first prompt:** *"Write out the full struct, function signatures, events, and the accrual formula as a comment block. Explain how a reentrancy attack on stopSession would work and how the ordering prevents it. Do not write the implementation until I've read this."*

### Deliverable

`contracts/src/StreamSession.sol` deployed to Monad testnet, address recorded in `.env.local` and in [HANDOVER.md](./HANDOVER.md).

### Required shape

```solidity
struct Session {
    address payer;
    bytes32 service;        // keccak256("CLAUDE") | keccak256("IMAGE")
    uint256 ratePerSecond;  // wei of MON per second
    uint256 maxBudget;      // wei, escrowed at open
    uint64  startTime;
    uint64  lastCheckpoint;
    uint256 settledAmount;
    bool    active;
}
```

| Function | Contract |
|----------|----------|
| `openSession(bytes32 service, uint256 ratePerSecond) payable → uint256` | `msg.value` is the budget and is escrowed. Requires `rate > 0` and `msg.value >= rate`. Emits `SessionOpened`. |
| `accrued(uint256 id) view → uint256` | `min(rate × (block.timestamp − startTime), maxBudget)`. The cap is the liability ceiling — it is not optional. |
| `remaining(uint256 id) view → uint256` | `maxBudget − accrued(id)` |
| `isAuthorized(uint256 id, address payer) view → bool` | `active && session.payer == payer && accrued < maxBudget` |
| `stopSession(uint256 id)` | Callable by `payer` **or** `settler`. Sets `active = false` **before** any transfer, pays accrued to treasury, refunds the rest to payer. Emits `SessionSettled`. |

### Gate

`forge test -vv` passes, with these tests present by name:

```
test_AccrualMatchesRateTimesElapsed
test_AccrualCapsAtMaxBudget
test_StopSettlesAndRefundsExactly
test_StopByStranger_Reverts
test_StopTwice_Reverts
test_IsAuthorizedFalseWhenExhausted
test_ReentrantStop_Reverts
```

Then, on live testnet:

```bash
forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
cast call $CONTRACT "accrued(uint256)(uint256)" 0 --rpc-url $RPC
# wait 10s, call again → value increased by ~10 × rate
```

**Checkpoint:** `git tag checkpoint/p1-contract-deployed`

**Cut list, in order:** drop `checkpoint()` (mid-session on-chain checkpointing is a nice-to-have, not a demo requirement); drop pause/resume entirely; drop the service enum and accept any `bytes32`, validating service match in the gateway instead.

---

## P2 — Gateway authorization · 1:35–2:20

**Entry condition:** contract deployed, `accrued` observably increasing on chain.

**Plan-first prompt:** *"Describe the authorization handshake step by step, including exactly what an attacker who has someone else's sessionId but not their private key can and cannot do. Then describe what happens to an in-flight request when the session is stopped."*

### Deliverable

`app/lib/auth.ts` exporting `authorize(sessionId, signature, nonce, service)` and `watchAuthorization(sessionId, onRevoked)`, with an endpoint that provably refuses unauthorized work.

### The handshake

1. Frontend has `sessionId` from the `SessionOpened` event.
2. User signs, off chain and gas-free, via `personal_sign`:
   ```
   Stream session authorization
   sessionId: 7
   nonce: 0x9f2c…
   issued: 2026-09-19T04:12:00Z
   ```
3. Frontend POSTs `{ sessionId, signature, nonce, prompt }` to the gateway.
4. Gateway recovers the signer, reads `sessions(sessionId)` over RPC, and asserts **all** of: signature recovers to `session.payer`; `active == true`; `accrued < maxBudget`; `service` matches the endpoint being called; nonce unused.
5. On success, the gateway holds an in-memory record and starts a 1-second `watchAuthorization` poll for the life of the request.
6. On any failed re-check, the provider call is aborted through its `AbortSignal` and a `terminated` event is emitted to the client.

### Gate

```bash
# a request with no signature
curl -X POST localhost:3000/api/claude -d '{"sessionId":1,"prompt":"hi"}'
# → 401, and the Anthropic SDK is never invoked (assert via a spy or a log line)

# a signature from a wallet that is not the payer
# → 401

# a valid signature against a stopped session
# → 403 session_inactive
```

**This gate is non-negotiable.** An authorization layer that has never been observed refusing anything has not been tested. Watch the refusals with your own eyes.

**Checkpoint:** `git tag checkpoint/p2-auth`

**Cut list:** drop nonce replay protection (log the gap in [CONSTRAINTS.md](./CONSTRAINTS.md) as a known hackathon limitation and say so if asked); drop the in-memory token cache and re-verify on every request instead — simpler and slower, which is fine at demo scale.

---

## P3 — Frontend shell and live ticker · 2:20–3:20

**Entry condition:** gateway refuses unauthorized requests.

**Plan-first prompt:** *"Explain how the local ticker and the on-chain value stay consistent, what happens when they disagree, and why the display must never jump backwards."*

### Deliverable

A dashboard where connecting a wallet, picking Claude, setting a rate and budget, and pressing Start produces a real on-chain session and a counter that visibly moves.

### Ticker contract

- Local tick every 100 ms: `rate × (Date.now()/1000 − startTime)`, clamped to `maxBudget`.
- On-chain reconcile every 5 s against `accrued(sessionId)`.
- On drift greater than 0.5%, ease the display toward chain truth over ~300 ms. **Never snap backwards in a visible jump** — a counter that stutters downward reads as a bug to a judge even when it is the correct value.
- Display six decimal places, monospace, tabular figures, so digits do not jitter horizontally.

### Gate

Open a real session on testnet. Watch for 60 seconds. Consumed must read within 1% of `0.002 × 60 = 0.120 MON`, and the on-chain `accrued` call must agree. Refresh the page mid-session: the session must be recovered from chain state, not from local storage.

**Checkpoint:** `git tag checkpoint/p3-live-ticker`

**Cut list:** drop the reconciliation loop and run the ticker purely locally (tell the truth about it if asked, and note it in DECISIONS); drop page-refresh recovery; drop the rate/budget inputs and hardcode 0.002 and 2 MON — honestly, hardcoding these is *better* for a three-minute demo.

---

## P4 — Claude end to end, and STOP · 3:20–4:10

**Entry condition:** a real session ticks in the browser.

This is the phase the entire project exists to produce. **Do not begin P5 until this works three times consecutively.**

**Plan-first prompt:** *"Trace one Claude request from button click to the last streamed token, naming every file it passes through. Then trace what happens to that same in-flight request when stopSession lands on chain."*

### Deliverable

Prompt Claude inside a funded session, watch tokens stream in while MON accrues, press STOP, and watch the response halt mid-sentence and settle.

### The STOP sequence, in order

| # | Where | Action |
|---|-------|--------|
| 1 | UI | Freeze the counter, set state `STOPPING`, disable the prompt box |
| 2 | UI | Send an optimistic `abort` to the gateway (a UX nicety, **not** the enforcement) |
| 3 | Wallet | `stopSession(id)` transaction submitted |
| 4 | Contract | `active = false`, accrued paid to treasury, remainder refunded |
| 5 | Gateway | The 1-second poll observes `active == false` and aborts the provider stream |
| 6 | UI | Render the settlement receipt with the transaction hash |

Step 5 is the enforcement and step 2 is the polish. **Be precise about this distinction when asked** — claiming the on-chain check is what makes the UI feel instant would be a lie a sharp judge can catch by watching the network tab.

### Gate

Run three consecutive clean cycles of: start → prompt → tokens stream → stop at ~15 seconds → response halts → receipt shows a settled amount within 2% of `0.002 × elapsed`. Verify the settlement transaction on `https://testnet.monadscan.com`.

Then the negative test: stop the session, and with the gateway's optimistic abort path disabled, confirm the stream still dies within two seconds from the chain poll alone.

**Checkpoint:** `git tag checkpoint/p4-claude-stop` ← **this is the fallback demo build**

**Cut list:** drop token streaming and return the completion in one block (the ticker still runs during the wait, and the thesis still lands); drop mid-stream abort and settle only at completion — this weakens the pitch significantly, so cut it only if you are genuinely out of time.

---

## P5 — Image generation · 4:10–4:55

**Entry condition:** P4 verified three times, tagged.

**Plan-first prompt:** *"Define the ImageProvider interface first, with the mock implementation, before touching any real provider SDK. Explain how a provider that cannot cancel a job is handled."*

### Deliverable

An image session that runs the ticker while a job executes and settles when the image lands.

### Provider abstraction

Because the provider is not yet chosen, build to an interface and decide later:

```ts
interface ImageProvider {
  generate(
    prompt: string,
    sourceImage: Buffer | undefined,
    signal: AbortSignal
  ): Promise<{ url: string }>;
}
```

Ship two implementations. `MockImageProvider` waits 8 seconds and returns a bundled poster PNG — this is the demo safety net and it must exist **before** the real one is attempted. Then whichever real provider you get a key for, behind the same interface, swapped by a single environment variable.

**Integrity rule:** if the mock is what runs during the demo, say so out loud. Presenting a stub as a live model call in front of judges is the one failure that is not recoverable. The honest line — *"the image provider is stubbed in this build; the economic session around it is real"* — costs nothing, because the session **is** the product.

### Gate

Upload a photo, prompt the poster, watch the ticker run for the real duration of the job, see the image render, see the stream settle automatically without a click. Elapsed seconds × rate must match the settled amount within 2%.

**Checkpoint:** `git tag checkpoint/p5-image`

**Cut list:** drop image upload and run text-to-image only (a poster from a text prompt demos identically); drop the real provider and ship the labelled mock.

---

## P6 — Simultaneous sessions · 4:55–5:25

**Entry condition:** both services work independently.

**Plan-first prompt:** *"Explain why this needs no contract change, and where the aggregate state lives."*

### Deliverable

Two live sessions at once, with a persistent aggregate bar that recomputes when one stops.

```
CLAUDE       0.002 MON/s
IMAGE        0.010 MON/s
─────────────────────────
TOTAL        0.012 MON/s
```

Sessions are independent on chain; the aggregate is a client-side sum over active sessions. Keeping it a view concern is what makes it a 30-minute phase instead of a 2-hour one.

### Gate

Start both. The bar reads `0.012 MON/s`. Stop Claude. Within one second the bar reads `0.010 MON/s` and the Claude receipt appears while the image session keeps running uninterrupted. Run this twice.

**Checkpoint:** `git tag checkpoint/p6-multi`

**Cut list:** cut the whole phase. It is the most expendable item in the plan — a strong single-service demo beats a shaky two-service one. If it is not clean by 5:25, revert to `checkpoint/p5-image` and go straight to P7.

---

## P7 — Failure paths and receipts · 5:25–6:10

**Entry condition:** the happy paths work.

**Plan-first prompt:** *"List every way a session can end badly — rejected transaction, provider timeout, budget exhaustion, chain read failure, wallet on the wrong network — and what the user sees in each case."*

### Deliverable

No path through the app ends in a blank screen, a spinner that never stops, or a raw stack trace.

Required handling:

- **Budget exhaustion** — open a session at 0.01 MON/s with a 0.05 MON budget. At 5 seconds the gateway must terminate and the UI must show `BUDGET EXHAUSTED` with a settlement receipt. This is a demo-able moment; consider showing it if the timing allows.
- **Rejected transaction** — user cancels in the wallet; the UI returns to the pre-session state with no orphaned local state.
- **Wrong network** — a network banner with a one-click switch to Monad testnet.
- **Provider error** — the gateway settles the stream at the elapsed time and surfaces the error. The user pays for the seconds consumed and not a second more.
- **Receipts** — every terminal state renders runtime, rate, settled amount, refund, and a clickable explorer link.

### Gate

Walk all five paths by hand. Zero unhandled rejections in the console. Every terminal state has a receipt.

**Checkpoint:** `git tag checkpoint/p7-hardened`

**Cut list:** handle exhaustion and rejected transactions only; let the other three fall back to a generic error card with a settle button.

---

## P8 — Rehearsal · 6:10–7:00

**Entry condition:** the build is frozen. **No feature work happens in this phase.** None.

### Deliverable

Three consecutive clean run-throughs of the three-minute demo, plus a screen recording as a backup.

| Task | Time |
|------|------|
| Fund the demo wallet with 20+ MON; confirm balance on the demo machine and browser | 6:10 |
| Pre-load the source photo, pre-write the Claude prompt, open the explorer in a second tab | 6:15 |
| Rehearsal 1 — expect it to go wrong, note what and fix only what is trivially fixable | 6:20 |
| Rehearsal 2 — timed against the [PRD §14](./PRD_V2.md#14-the-three-minute-demo) beats | 6:35 |
| Rehearsal 3 — record the screen. **This recording is the insurance policy.** | 6:45 |
| Write the five-line handover, confirm the tag, stop | 6:55 |

### Gate

A recording exists in which all three beats land inside three minutes. The §15 one-liner is memorized. The §3 correction can be delivered from memory under interruption — have someone actually interrupt you mid-sentence and see if it survives.

**Checkpoint:** `git tag demo/final`

---

## Standing cut order

If at any point you are more than 25 minutes behind, cut in this order and do not deliberate:

1. Simultaneous sessions (P6) — entirely
2. Page-refresh session recovery (P3)
3. Rate and budget inputs — hardcode them (P3)
4. On-chain ticker reconciliation (P3)
5. Image upload — text-to-image only (P5)
6. Real image provider — labelled mock (P5)
7. Token streaming — single-block response (P4)

Never cut: the contract's budget cap, the gateway's authorization check, the STOP enforcement path, or the rehearsal phase. **P8 is not padding.** A demo that has never been run start to finish will fail in front of judges — that is not pessimism, it is the base rate.

---

## Phase gate ritual

At every checkpoint, four things happen. It takes two minutes and it is what keeps the sprint recoverable.

1. **Read the diff** in full (habit 10). Not the AI's summary of it — the diff.
2. **Run the gate commands** from [TEST_CHECKLIST.md](./TEST_CHECKLIST.md) and paste the real output into HANDOVER.
3. **Explain the phase's code aloud** in your own words (habit 15). If you cannot, you do not own it, and at 3 a.m. with a broken demo you will not be able to fix it.
4. **Update [HANDOVER.md](./HANDOVER.md)** with the five-line summary, then `git tag`.
