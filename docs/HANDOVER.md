# HANDOVER

> A living record of where things stand right now. Not a dump of everything — what's done, what's in progress, what's broken, what to avoid.

Every new AI session starts with amnesia. This file is the difference between re-explaining the entire project and saying "here's exactly where we left off." Update it at **every phase gate**, before the `git tag`. It takes thirty seconds and it is the cheapest habit on the list.

---

## Current state

```
STATUS        P0 complete — repository scaffolded, chain verified, builds passing
PHASE         P0 complete · P1 ready
LAST TAG      checkpoint/p0
CONTRACT      not deployed (scheduled for P1)
BLOCKERS      none
NEXT ACTION   P1 — StreamSession.sol implementation and testnet deployment
```

**Live values to keep current — these are the ones a cold session needs first:**

| Key | Value |
|-----|-------|
| Contract address | *(fill at P1)* |
| Deploy block | *(fill at P1)* |
| Deployer address | *(fill at P0/P1)* |
| Settler address | *(fill at P1)* |
| Treasury address | *(fill at P1)* |
| Chain | Monad Testnet · 10143 · `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadscan.com` |
| Image provider in use | `pollinations` (configured in `.env.local`) |

---

## Session log

Newest entry at the top. Five lines each — that is the whole discipline.

```
─────────────────────────────────────────────────────────────
SESSION 02 · 2026-09-19 12:35 · Gemini 3.8 Flash · P0
DID        Configured remote https://github.com/sankalp771/streammm.
           Scaffolded Foundry contracts/ (builds & tests pass).
           Scaffolded Next.js 14 app/ (npm install + npm run build exits 0).
           Secured server keys in gitignored .env.local.
LEFT       P1 through P8.
BROKEN     nothing
WATCH      Foundry solc requires UTF-8 without BOM on Windows.
NEXT       P1 · StreamSession.sol implementation, Foundry tests, deploy
GATE       cast chain-id: 10143
           cd app && npm run build: ✓ Compiled successfully, exits 0
           cd contracts && forge test: [PASS] test_Sanity()
─────────────────────────────────────────────────────────────
SESSION 01 · 2026-09-18 · Opus 5 · pre-build
DID        Read the AI Collaboration Field Guide; produced the v2
           documentation set (PRD, phases, architecture, flow,
           constraints, decisions, tests, rollback, this file).
           left all nine phases. No code exists yet.
WATCH      Faucet latency can eat P0 — start it draining first.
           Confirm chain ID before writing contract code; the
           testnet was reset from genesis in Dec 2025, so any
           older deployment address is dead.
NEXT       P0 · scaffold + fund + verify
─────────────────────────────────────────────────────────────
```

---

## Entry template

Copy this at every phase gate. Fill it before you tag, not after.

```
─────────────────────────────────────────────────────────────
SESSION NN · YYYY-MM-DD HH:MM · <model> · <phase>
DID        <what actually got built — not what was attempted>
LEFT       <what remains in this phase, and what is next>
BROKEN     <anything known-broken, or "nothing">
WATCH      <traps, gotchas, things that will bite the next session>
NEXT       <the single next action, concrete enough to start cold>
GATE       <paste the real command output that proved it works>
─────────────────────────────────────────────────────────────
```

The `GATE` field is not optional. "Tests pass" is a claim; pasted output is evidence. See [TEST_CHECKLIST](./TEST_CHECKLIST.md).

---

## Standing warnings

Things that will be true for the whole build. Read these before every session.

**The startTime trap.** Take `startTime` from the `SessionOpened` event, never from `Date.now()` at click time. Getting this wrong produces a ticker that is off by the block time and drifts visibly. It is the single most likely bug in the frontend.

**The units trap.** Contract time is in seconds; `Date.now()` is in milliseconds. Mixing them produces a counter running 1000× too fast, which looks like a rate bug and is not. Every money calculation carries a unit comment ([CONSTRAINTS §4.2](./CONSTRAINTS.md#4-code-style-constraints)).

**The leaked-poller trap.** `clearInterval` on the authorization watch must be in a `finally`, covering every exit path. Twenty test runs leave twenty pollers hitting the RPC at one call per second each, and the rate limit will find you during rehearsal, not during development.

**The stale-address trap.** After any redeploy, update the contract address in `.env.local` **and** in this file. A stale address fails silently and looks like a wallet problem.

**The RPC limit.** The public endpoint is rate-limited (50 rps on the QuickNode endpoint). With a 1-second authorization poll and multiple sessions, keep a second endpoint ready — `https://rpc.ankr.com/monad_testnet` or `https://rpc-testnet.monadinfra.com`.

**The freeze.** After the P8 freeze at 6:10, no code changes. None. Not CSS, not copy. See [ROLLBACK §3](./ROLLBACK.md#p8--something-breaks-during-rehearsal).

---

## Open questions

Carry these forward until resolved; strike them through when they are.

- [ ] **Image provider** — not chosen. Interface and mock are built first ([D-09](./DECISIONS.md#d-09--image-provider-behind-an-interface-mock-built-first)); the real adapter is a config swap whenever a key arrives. Decide by P5 or ship the mock with disclosure.
- [ ] **Nonce replay protection** — in scope at P2, first item on that phase's cut list. If cut, record it here and in CONSTRAINTS as a known limitation, and say so if a judge asks.
- [ ] **Demo rates** — 0.002 MON/s for Claude and 0.010 MON/s for image are placeholders chosen for legibility on screen. Confirm the digits read well at demo resolution during P8; a number nobody can read on a projector is a wasted beat.

---

## Model attribution

Field guide habit 14 — note which model reasoned through what, because behaviour shifts between versions and knowing who made a call matters when you are debugging it later.

| Session | Model | Scope |
|---------|-------|-------|
| 01 | Opus 5 | Documentation set, architecture, phase plan |
