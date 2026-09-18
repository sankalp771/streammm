# ROLLBACK

> Confidence to let AI make bigger changes comes from knowing exactly how to reverse them.

**The governing principle, carried forward from v1 and unchanged:** a working earlier checkpoint is preferable to a broken ambitious version. At hour six, this stops being a philosophy and becomes the only thing standing between you and having nothing to show.

---

## 1. Checkpoint ladder

Every phase ends with a tag. Each tag is a state you can return to in under two minutes.

| Tag | Known-good state | Demo-able? |
|-----|------------------|------------|
| `checkpoint/p0` | Repo builds, wallet funded, RPC reachable | No |
| `checkpoint/p1-contract-deployed` | Contract deployed, accrual verifiable via `cast` | Contract only |
| `checkpoint/p2-auth` | Gateway provably refuses unauthorized requests | No |
| `checkpoint/p3-live-ticker` | Real session opens and ticks in the browser | Weakly — the money moves |
| `checkpoint/p4-claude-stop` | **Claude works and STOP kills it mid-stream** | **YES — this is the fallback demo** |
| `checkpoint/p5-image` | Image session works end to end | Yes, stronger |
| `checkpoint/p6-multi` | Simultaneous sessions with aggregate flow | Yes, strongest |
| `checkpoint/p7-hardened` | Failure paths handled, receipts everywhere | Yes |
| `demo/final` | Frozen, rehearsed build | **This is what gets demoed** |

**`checkpoint/p4-claude-stop` is the line that matters.** Everything after it is enhancement. If the clock runs out at any point past P4, you have a demo that proves the thesis. If P4 itself is broken, nothing downstream can rescue the pitch.

---

## 2. How to roll back

```bash
# see where you are
git tag -l 'checkpoint/*' --sort=-creatordate
git log --oneline -10

# stash anything you might want to salvage later
git stash push -u -m "wip: <what you were doing>"

# return to a known-good state
git checkout checkpoint/p4-claude-stop

# continue from there on a fresh branch
git checkout -b recover/from-p4
```

**Do not `git reset --hard` on a shared branch.** Tags plus a branch keep the broken work recoverable in the stash if it turns out only one line was wrong.

---

## 3. Per-phase recovery

### P1 — Contract broken or deployment failed

Contract state is immutable, so "rollback" means redeploy. There is no proxy and no migration — [D-12](./DECISIONS.md#d-12--stack-foundry-nextjs-14-wagmi-v2-viem-tailwind) made that choice deliberately.

```bash
git checkout checkpoint/p0
cd contracts && forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
# update NEXT_PUBLIC_STREAM_CONTRACT in .env.local AND in HANDOVER.md
```

Any session opened against the old address is orphaned. On testnet with faucet MON this costs nothing. **Always update the address in both places** — a stale address in `.env.local` produces a silent failure that looks like a wallet problem and wastes twenty minutes at exactly the wrong hour.

### P2 — Authorization broken

Revert to `checkpoint/p1` and rebuild `lib/auth.ts` alone. **Never** ship a bypass — not a `SKIP_AUTH` flag, not a commented-out check, not "just for now." An authorization layer with a bypass in it is not an authorization layer, and the whole product claim rests on it.

If auth cannot be made to work, the correct move is to demo the contract and the ticker honestly and say the gateway verification is incomplete. That is a weaker demo. A demo with a fake authorization check is a dishonest one.

### P3 — Ticker wrong or drifting

Almost always one of three things, in descending order of likelihood:

1. `startTime` taken from `Date.now()` instead of from the `SessionOpened` event
2. Milliseconds mixed with seconds — presents as a counter 1000× too fast
3. Missing the `maxBudget` clamp — the counter sails past the escrowed budget

Fix in place before reverting; this is rarely a structural problem. If it resists for more than fifteen minutes, cut reconciliation (standing cut order item 4), run the ticker locally, and note the change in [DECISIONS D-08](./DECISIONS.md#d-08--ticker-is-local-reconciled-and-never-jumps-backwards).

### P4 — Claude or STOP broken

**Stop everything else and fix this.** Nothing downstream matters.

Degradation ladder, in order — take the first rung that works:

1. Streaming plus mid-stream abort (the full experience)
2. Streaming, settlement only at completion (STOP still settles, but does not kill mid-stream — weakens the pitch significantly)
3. Single-block response with the ticker running during the wait (the thesis still lands)
4. A hardcoded long-running task instead of a real Claude call, **clearly disclosed as such**

Rung 4 is a last resort and requires saying out loud that the AI call is simulated. See [CONSTRAINTS §6.2](./CONSTRAINTS.md#6-demo-integrity-constraints).

### P5 — Image provider broken

This is what the interface exists for ([D-09](./DECISIONS.md#d-09--image-provider-behind-an-interface-mock-built-first)).

```bash
# one line in .env.local
IMAGE_PROVIDER=mock
```

The mock waits 8 seconds and returns a bundled PNG. The economic session around it is completely real — the stream, the authorization, the settlement are all genuine. **Disclose it during the demo.** The session is the product, so this costs nothing.

### P6 — Simultaneous sessions unstable

Revert immediately. This is the most expendable phase in the plan.

```bash
git checkout checkpoint/p5-image
```

A clean two-service demo beats a shaky three-beat one. Do not spend a second past 5:25 on this.

### P7 — Hardening introduced a regression

The classic hour-six failure: error handling that breaks the happy path. Revert to `checkpoint/p6-multi` (or `p5-image`), and re-apply **only** budget exhaustion and rejected-transaction handling. Leave the rest to a generic error card.

### P8 — Something breaks during rehearsal

**The build is frozen. Do not fix it.**

Judge whether it is a demo-script problem or a code problem:

- **Script problem** (wrong click order, wrong prompt, unfunded wallet) → adjust the script and rehearse again.
- **Code problem** → revert to the previous checkpoint and rehearse *that*. A smaller demo that runs beats a larger one that crashes.

The temptation to fix "one small thing" at 6:45 has ended more hackathon demos than any bug. The rehearsed build is the demoed build.

---

## 4. The nuclear option

If everything is broken with under 45 minutes left:

```bash
git checkout checkpoint/p4-claude-stop
cd app && npm run build && npm start
```

Then demo this, in this order, in ninety seconds:

1. Open a funded session — a real transaction on Monad
2. Prompt Claude — the response streams, the money ticks
3. Press STOP — the response dies, the stream settles
4. Show the settlement transaction on the explorer

That is the entire thesis, demonstrated. The image generation, the simultaneous sessions, and the polish are all supporting material for exactly this ninety seconds.

---

## 5. What is not recoverable

Be aware of the failures that no rollback fixes, because the only defence against them is not causing them.

**A leaked API key.** If a key reaches a commit or the client bundle, rotating it is the only fix and it takes time you will not have. Check `git status` at every gate; run the bundle grep in [TEST_CHECKLIST §3.7](./TEST_CHECKLIST.md#3-authorization-gate-for-p2).

**A committed private key.** Rotate the wallet and redeploy. Assume anything committed is public forever.

**A demo that was never rehearsed.** No tag fixes this, which is why [CONSTRAINTS §7.2](./CONSTRAINTS.md#7-time-constraints) makes P8 unsacrificeable.

**An overstated claim to a judge.** If you say Claude bills per second, or that the client abort is the on-chain enforcement, and get caught, there is no recovery inside a three-minute pitch. This is why [CONSTRAINTS §6](./CONSTRAINTS.md#6-demo-integrity-constraints) exists and why the [PRD §3](./PRD_V2.md#3-the-correction-that-must-never-be-garbled) correction is rehearsed under interruption.
