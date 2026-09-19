# STREAM

> AI services that only cost you while they're working.

Stream is a Monad-powered payment and authorization layer for AI services. A user opens a
funded, MON-denominated session at a fixed rate per second; the backend gateway will only
call an AI provider while that on-chain session is active and within budget. When the AI
finishes — or the user hits STOP — the stream settles on chain and the user pays for
exactly the seconds the service was working.

Live app: https://app-ruddy-five-86.vercel.app/

Deployed Contract: `0x3e515c11B9B7A5E1398B614FbFe87A8570c95882`
```
Start  →  AI works  →  MON flows  →  Service finishes / user stops  →  Stream settles
```

**Important framing:** Stream does not claim that Claude or any image model bills by the
second. Providers bill by tokens and by image, as they always have. Stream creates a
continuous MON-denominated economic session layered on top of that, and uses it as the
authorization signal for service execution. See [docs/PRD_V2.md §3](./docs/PRD_V2.md).

---

## Status

Live on Monad Testnet (chain ID 10143, native token MON).
Use the [operator manual](./docs/MANUAL.md) for the deployed site walkthrough.

## Documentation

Start with [docs/README.md](./docs/README.md) — it has the read order and the
field-guide compliance map.

| File | What it answers |
|------|-----------------|
| [HANDOVER.md](./docs/HANDOVER.md) | Where does the build stand right now? |
| [PRD_V2.md](./docs/PRD_V2.md) | What are we building and why is it defensible? |
| [PHASES.md](./docs/PHASES.md) | What happens in which hour, and what ships? |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | What are the pieces and how do they fit? |
| [FLOW.md](./docs/FLOW.md) | How does execution actually travel through the code? |
| [CONSTRAINTS.md](./docs/CONSTRAINTS.md) | What must never happen? |
| [DECISIONS.md](./docs/DECISIONS.md) | Why is it built this way? |
| [TEST_CHECKLIST.md](./docs/TEST_CHECKLIST.md) | How do we prove it works? |
| [ROLLBACK.md](./docs/ROLLBACK.md) | How do we get back to a working state? |
| [FEATURE.md](./docs/FEATURE.md) | Per-feature trace: found → scoped → tried → verified. |
| [MANUAL.md](./docs/MANUAL.md) | How to use the live site and run the service flows. |

## Planned layout

```
stream/
├── docs/
├── contracts/            Foundry — StreamSession.sol
└── app/                  Next.js 14 — frontend + AI gateway in one deploy
```
