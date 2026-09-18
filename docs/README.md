# STREAM — Documentation Index

> AI services that only cost you while they're working.

This folder is the control system for the Stream build. It follows the **AI Collaboration Field Guide** standard: five core files, four guardrail files, and a set of review habits that keep a human directing the work instead of approving it.

**Hard context:** solo builder, ~7 hours of build time, greenfield code (docs only, no code written yet), demo on **19 September**.

---

## Read order

If you are picking this up cold — human or AI — read in this order. It takes about twelve minutes and it is the difference between "re-explain the project" and "here's exactly where we left off."

| # | File | What it answers |
|---|------|-----------------|
| 1 | [HANDOVER.md](./HANDOVER.md) | Where does the build stand *right now*? |
| 2 | [PRD_V2.md](./PRD_V2.md) | What are we building and why is it defensible? |
| 3 | [PHASES.md](./PHASES.md) | What happens in which hour, and what ships at the end of it? |
| 4 | [ARCHITECTURE.md](./ARCHITECTURE.md) | What are the pieces and how do they fit? |
| 5 | [FLOW.md](./FLOW.md) | How does execution actually travel through the code? |
| 6 | [CONSTRAINTS.md](./CONSTRAINTS.md) | What must the AI (and you) never do? |
| 7 | [DECISIONS.md](./DECISIONS.md) | Why is it built this way and not the other way? |
| 8 | [TEST_CHECKLIST.md](./TEST_CHECKLIST.md) | How do we prove it works, with commands not vibes? |
| 9 | [ROLLBACK.md](./ROLLBACK.md) | How do we get back to a working state when it breaks? |
| 10 | [FEATURE.md](./FEATURE.md) | Per-feature trace: found → scoped → tried → verified. |

---

## The one-paragraph version

Stream is a Monad-powered payment and authorization layer for AI services. A user opens a funded, MON-denominated session at a fixed rate per second; the backend gateway will only call an AI provider while that on-chain session is active and within budget. When the AI finishes — or the user hits STOP — the stream settles on chain and the user pays for exactly the seconds the service was working.

**The correction that must appear in every artifact, deck slide and judge answer:** we are not claiming Claude or any image model bills by the second. Providers bill by tokens and by image, as they always have. Stream creates a *continuous MON-denominated economic session layered on top of that*, and uses it as the authorization signal for service execution. See [PRD_V2 §3](./PRD_V2.md#3-the-correction-that-must-never-be-garbled) — it is the single most important thing to get right in front of judges.

---

## Field guide compliance

The guide lists fifteen habits. Here is where each one lives, so nothing quietly falls off.

**Core documentation**

| # | Habit | Where it lives |
|---|-------|----------------|
| 1 | Handover files | [HANDOVER.md](./HANDOVER.md) — updated at every phase gate |
| 2 | Decisions.md | [DECISIONS.md](./DECISIONS.md) — D-01 through D-14 |
| 3 | Explicit comments | [CONSTRAINTS.md §4](./CONSTRAINTS.md#4-code-style-constraints) — enforced as a coding constraint |
| 4 | Flow.md | [FLOW.md](./FLOW.md) — five traced execution paths |
| 5 | Bug.md / Feature.md | [FEATURE.md](./FEATURE.md) — one trace block per feature |

**Guardrails**

| # | Habit | Where it lives |
|---|-------|----------------|
| 6 | Architecture.md | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 7 | Constraints.md | [CONSTRAINTS.md](./CONSTRAINTS.md) |
| 8 | Test checklist | [TEST_CHECKLIST.md](./TEST_CHECKLIST.md) — commands and expected outputs |
| 9 | Rollback.md | [ROLLBACK.md](./ROLLBACK.md) — one checkpoint per phase |

**Review habits (enforced by ritual, not by file)**

| # | Habit | How it is enforced here |
|---|-------|-------------------------|
| 10 | Read every diff | [CONSTRAINTS §5](./CONSTRAINTS.md#5-review-constraints) — no merge without a read diff; phase gates in [PHASES.md](./PHASES.md) require it |
| 11 | Ask why before what | Every phase in PHASES.md opens with a *plan-first prompt* to state approach before writing code |
| 12 | One change per request | [CONSTRAINTS §5](./CONSTRAINTS.md#5-review-constraints) — task granularity is capped at one deliverable |
| 13 | Session handoff summary | [HANDOVER.md](./HANDOVER.md) has a five-line template to fill at each gate |
| 14 | Version-pin your context | [DECISIONS.md](./DECISIONS.md) header field `Model` on every decision entry |
| 15 | Own the mental model | [TEST_CHECKLIST §7](./TEST_CHECKLIST.md#7-the-explain-it-back-gate) — you cannot mark a phase done until you can explain its code aloud |

---

## Repository layout this documentation assumes

```
stream/
├── docs/                    ← this folder
├── contracts/               ← Foundry project
│   ├── src/StreamSession.sol
│   ├── test/StreamSession.t.sol
│   └── script/Deploy.s.sol
└── app/                     ← Next.js 14 (frontend + gateway in one deploy)
    ├── app/page.tsx                    dashboard
    ├── app/session/[service]/page.tsx  live session view
    ├── app/api/claude/route.ts         gateway: Claude
    ├── app/api/image/route.ts          gateway: image
    ├── lib/auth.ts                     on-chain authorization check
    ├── lib/chain.ts                    viem clients, ABI, addresses
    └── lib/providers/image/            provider-agnostic image adapters
```
