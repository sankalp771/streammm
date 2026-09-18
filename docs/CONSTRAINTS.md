# CONSTRAINTS

> "Allow" should never mean "allow anything." This file turns permission into scoped permission.

Short, explicit, checkable. If a proposed change violates any line here, the answer is no — regardless of how good the reasoning sounds at 4 a.m.

---

## 1. Retired from v1

| Constraint | Status | Why |
|-----------|--------|-----|
| ~~"No backend. Everything runs in the browser."~~ | **RETIRED** | Correct for the livestream prototype. Fatally wrong once an AI provider key is involved. Replaced by §2.1. |

Everything else from the v1 constraint set carries forward unchanged.

---

## 2. Security constraints — never negotiable

**2.1** The Anthropic API key, the image provider key, and the settler private key **never** appear in client-side code, in a `NEXT_PUBLIC_` variable, in a committed file, in a URL, or in an SSE payload. Server-side environment only.

**2.2** The gateway **never** trusts client-asserted session state. Whether a session is active, what it costs, and whether it is in budget are read from the chain on every request. A field in the request body describing session state is, at best, a hint to be verified and, at worst, an attack.

**2.3** No AI provider SDK is constructed or called before `authorize()` has returned success. Not "called and discarded" — not constructed. The refusal path must provably never touch a provider.

**2.4** `maxBudget` is required on every session. A session with a rate and no budget cap must be impossible to create. The cap lives in the contract's `accrued()` via `min()`, not in the gateway, so no gateway bug can produce an unbounded charge.

**2.5** `stopSession` sets `active = false` **before** any value transfer. Checks, effects, interactions — in that order, every time.

**2.6** The settler wallet may **only** call `stopSession`. It must not be able to open sessions, alter rates, change the treasury, or withdraw. If a proposed change gives the settler any additional power, reject it.

**2.7** Never commit a `.env` file, a private key, or a mnemonic. `.env.example` with empty values only. Check `git status` before every commit at every phase gate.

---

## 3. Scope constraints — the sprint's survival depends on these

**3.1** Do not build anything on the [PRD §10](./PRD_V2.md#10-scope-what-we-are-not-building) exclusion list. Not a small version. Not a stub "for later." Not because it is only twenty minutes.

**3.2** No new dependency without asking first. Every package is a build failure, a bundle problem, or a version conflict waiting for the worst possible moment. The approved list is fixed at P0: foundry, next, react, wagmi, viem, tailwind, `@anthropic-ai/sdk`, and exactly one image provider SDK.

**3.3** No contract upgradeability, proxies, or migration paths. Redeploy instead. A seven-hour build does not earn an upgrade story.

**3.4** No database, no ORM, no queue, no indexer, no auth system beyond the wallet.

**3.5** Do not refactor working code. If it passed its phase gate, it is frozen unless it is actively broken. "While I was in there I cleaned up…" is how a demo dies at hour six.

**3.6** Service cards for services that do not work do not appear in the UI. A judge will click exactly the card you were hoping they would not.

---

## 4. Code style constraints

**4.1 — Explicit comments (field guide habit 3).** Every non-obvious block gets a comment explaining the *flow*, not restating the code. What this block is for, what calls into it, what it assumes exists.

```ts
// Called only after authorize() passes. Holds the AbortController for this
// request so /api/abort can reach it by sessionId — this is the optimistic
// UX path; the 1s chain poll below is the actual enforcement.
const controller = new AbortController();
```

Not this:

```ts
// create an abort controller
const controller = new AbortController();
```

**4.2** Every money calculation carries a unit comment. `wei`, `MON`, `seconds`, `milliseconds`. Mixing `Date.now()` milliseconds with contract seconds is the most likely arithmetic bug in this project and it will present as "the counter is 1000× too fast."

**4.3** Contract functions carry NatSpec on every external function, including `@dev` notes on the accrual cap and the settlement ordering. Judges and reviewers read the contract first.

**4.4** No `any` in TypeScript at a trust boundary. Request bodies and RPC responses get typed and validated.

**4.5** No `console.log` of a prompt, a completion, a signature, or anything from the environment.

---

## 5. Review constraints

**5.1 — Read every diff (habit 10).** No change is accepted on the strength of an AI's summary of it. Read the actual diff, line by line, every time, no matter how small the request seemed. Summaries can be wrong or incomplete; diffs cannot lie about what changed.

**5.2 — Ask why before what (habit 11).** Every phase in [PHASES.md](./PHASES.md) opens with a plan-first prompt. Make the AI state its approach in prose and read it before a single line is written. Correcting a flawed paragraph costs a minute; unwinding a flawed implementation costs an hour you do not have.

**5.3 — One change per request (habit 12).** One logical change per prompt. Not "build the gateway" — "write `authorize()` and nothing else." Large vague requests produce large vague diffs, and nobody reviews those properly, including the AI that wrote them.

**5.4** No phase is marked complete until its gate commands in [TEST_CHECKLIST.md](./TEST_CHECKLIST.md) have been run and their real output pasted into [HANDOVER.md](./HANDOVER.md). "It should work" is not a test result.

**5.5 — Own the mental model (habit 15).** If you cannot explain a phase's code aloud in your own words, it is not done. This is not a formality: at hour six, with a broken demo and no time, the only code you can fix is the code you actually understand.

---

## 6. Demo integrity constraints

These exist because the cost of getting them wrong is not a bug — it is credibility.

**6.1** Never claim that Claude or an image model bills per second. The correct framing is [PRD §3](./PRD_V2.md#3-the-correction-that-must-never-be-garbled), and it must survive being interrupted mid-sentence.

**6.2** If the mock image provider is what runs during the demo, say so. Out loud, unprompted. *"The image provider is stubbed in this build; the economic session around it is real."* The session is the product, so this costs nothing — and being caught presenting a stub as a live call costs everything.

**6.3** Never present the optimistic abort (Track A in [FLOW §3](./FLOW.md#path-3--stop-the-one-that-matters)) as the on-chain enforcement. The enforcement is the 1-second chain poll. Anyone watching the network tab can tell the difference.

**6.4** State the known limitations honestly if asked: the gateway trusts its RPC endpoint; nonce replay protection may be absent; there is no provider-side cancellation guarantee for image jobs. Each of these is a correct trade for seven hours, and saying so reads as engineering judgment. Bluffing reads as the opposite.

**6.5** Do not describe Stream as an AI image generator. The 1980s poster is a demo payload. If a judge walks away describing this as a poster app with crypto attached, the pitch failed regardless of what the code does.

---

## 7. Time constraints

**7.1** At every phase boundary, check the clock against [PHASES.md](./PHASES.md). More than 25 minutes behind means cut from the standing cut order immediately, without deliberation. Deliberating about whether to cut is itself the thing that kills sprints.

**7.2** Phase 8 (rehearsal) is not padding and is never sacrificed for a feature. A demo that has never been run end to end will fail in front of judges. That is a base rate, not a worry.

**7.3** After the P8 freeze, no code changes. None. Not a CSS tweak, not a copy fix. The build that was rehearsed is the build that gets demoed.

**7.4** Never cut: the contract's budget cap, the gateway's authorization check, the STOP enforcement path, or the rehearsal phase.
