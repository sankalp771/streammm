# HANDOVER

> A living record of where things stand right now. Not a dump of everything — what's done, what's in progress, what's broken, what to avoid.

Every new AI session starts with amnesia. This file is the difference between re-explaining the entire project and saying "here's exactly where we left off." Update it at **every phase gate**, before the `git tag`. It takes thirty seconds and it is the cheapest habit on the list.

---

## Current state

```
STATUS        P4 COMPLETE — real Claude stream works and STOP terminates via
              gateway chain poll observing session_inactive
PHASE         P4 done · P5 image generation next
LAST TAG      checkpoint/p4-claude-stop
CONTRACT      0x3e515c11B9B7A5E1398B614FbFe87A8570c95882
BLOCKERS      none
NEXT ACTION   P5 — image provider interface/session flow, mock first if needed
```

**Live values to keep current — these are the ones a cold session needs first:**

| Key | Value |
|-----|-------|
| Contract address | `0x3e515c11B9B7A5E1398B614FbFe87A8570c95882` |
| Deploy tx | `0x42f01163f4d7d4b82e8ad53b7fa7002047cd7c2154e55a2b230312458ebe5ee2` |
| Deploy block | `63820620` |
| Deployer / Settler | `0x8c6b4A4ac2F5f9d3d2604C073a9300c595298A32` (hot wallet) |
| Treasury | `0x33a5eAD12dE3add8c80635Eef1a4af0c680f2831` (your main wallet) |
| Chain | Monad Testnet · 10143 · `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadscan.com` |
| Image provider | `pollinations` (key in `.env.local`) |

---

## Session log

Newest entry at the top. Five lines each — that is the whole discipline.

```
─────────────────────────────────────────────────────────────
SESSION 06 · 2026-09-19 14:15 · Codex GPT-5 · P4
DID        Replaced /api/claude placeholder with text/event-stream route.
           Route authorizes signed request first, then calls Anthropic streaming
           Messages API and relays token/complete/terminated/error events.
           watchAuthorization aborts provider fetch on inactive/exhausted
           session. Added prompt UI, signMessage authorization, SSE parser,
           Claude output panel, stream status, and markdown-ish rendering.
LEFT       P5–P8.
BROKEN     nothing
WATCH      No optimistic abort endpoint yet. This is good for the negative
           proof: STOP enforcement currently depends on the gateway's on-chain
           watch poll, not client-side cancellation. Next dev must run from
           app/ with app/.env.local present, or ANTHROPIC_API_KEY is missing.
           Model ID fixed to claude-sonnet-5 after older aliases returned 404.
NEXT       P5 · image session end-to-end; build mock/provider abstraction first
GATE       npm run build: ✓ Compiled successfully; ✓ Generating static pages (6/6)
           curl no-signature /api/claude: HTTP 401 {"error":"bad_request"}
           dev server log: POST /api/claude 401, no PROVIDER_CALL_STARTED
           Browser natural Claude run: session 6 streamed real output for
           "how can monad and openAI collab?", Claude status complete,
           session stopped, consumed 0.003160 MON, chain accrued 0.003140 MON.
           open 0x54ac8ad6b30e8a34c27d883ff53b748bae2305f19760dfbef51499ac7b3e32c2
           stop 0x4cdd107dde8e8f4fa811c04ae507e2cfcc52eb0497945f8dea40e8e1f3fda57
           dev server log: PROVIDER_CALL_STARTED claude; POST /api/claude 200
           Browser STOP run: text halted mid-story, Claude status terminated,
           UI showed "Stream terminated: session_inactive"; MetaMask activity
           showed contract interaction; terminal log:
           PROVIDER_CALL_STARTED claude
           PROVIDER_CALL_STARTED claude
           AUTHORIZATION_REVOKED session_inactive
─────────────────────────────────────────────────────────────
SESSION 05 · 2026-09-19 14:05 · Codex GPT-5 · P3
DID        Added live Claude session controls to app/page.tsx: openSession()
           via injected wallet, parse SessionOpened.startTime from receipt,
           URL recovery with ?sessionId, 100ms local ticker, 5s accrued()
           reconciliation, chain-accrued display, explorer links, and Stop.
           Added lib/money.ts and lib/useTicker.ts. Build green.
LEFT       P4–P8.
BROKEN     nothing
WATCH      Two script-based live runs showed block-timestamp granularity:
           session 2 stopped at 0.124 MON (~62s × 0.002); session 3 at
           elapsed 60 latest-block read returned 0.122 MON because accrued()
           was evaluated in a later block. UI must explain/compare by chain
           timestamp, not naive wall-clock stopwatch.
NEXT       P4 · Claude prompt stream with signed authorization and STOP
GATE       npm run build: ✓ Compiled successfully; ✓ Generating static pages (6/6)
           Browser wallet screenshot: connected 0x33a5...2831 on Monad
           Testnet, session 4 stopped, consumed/chain accrued 0.026000 MON,
           remaining 1.974000 MON.
           browser open:
           0xe8fe300af9d255429fdb4e4250984e1998087505c7b285bcd2fb949f23cab4e8
           browser stop:
           0x9c7b9150f80ce32d58e7a70b48e25223164337aa9c1fad8b6d6228a849da2540
           Live script session 2:
           open 0x26d3f6a66d7c44c97808802d6e134bd811e5f0dd100294d65994c7e921c19930
           accrued after wall wait: 0.124 MON; stop
           0xc323b1befd26ffd614a3dacbed2273b025f005f3ff474a7f4453107ac8d6b842
           Live script session 3:
           open 0x9a106a0e4555c16401a42df3356b205071b3ce122ba3708d1196cb20f7e42427
           elapsed latest block 60s; accrued read 0.122 MON; stop
           0x1f4a1e55e3c61980f358b428fcfae2eb70f8978c10b921864e7de5d1188e76cd
─────────────────────────────────────────────────────────────
SESSION 04 · 2026-09-19 13:30 · Codex GPT-5 · P2
DID        Implemented app/lib/auth.ts authorize(), buildAuthorizationMessage(),
           service hashing, in-memory nonce replay protection, and
           watchAuthorization() with cleanup. Wired /api/claude and /api/image
           to refuse before provider call path and log PROVIDER_CALL_STARTED
           only after auth passes. Added injected-only wagmi wallet connect
           on app/page.tsx with connected address, network, and MON balance.
LEFT       P3–P8.
BROKEN     nothing
WATCH      Live session 0 was opened with bytes32("CLAUDE") during P1 testing,
           while docs and new auth helpers use keccak256("CLAUDE") for P3.
           Keep frontend/service creation aligned with serviceHash().
NEXT       P3 · build wallet start flow and ticker from SessionOpened.startTime
GATE       npm run build: ✓ Compiled successfully; ✓ Generating static pages (6/6)
           home bundle includes injected wallet dashboard; no WalletConnect modal
           no signature /api/claude: HTTP 401 {"error":"bad_request"}
           no signature /api/image: HTTP 401 {"error":"bad_request"}
           stopped session 0 with payer signature: 403 {"error":"session_inactive"}
           live CLAUDE session against /api/image: 403 {"error":"service_mismatch"}
           wrong wallet signature: 401 {"error":"signer_mismatch"}
           service-mismatch test txs:
           open 0x76f331f4ac03ba02b9b6307d0337106d872da50548329e40d8855ca60ed5fd0c
           stop 0x1ea28e54e9d93fff74a9b1b728cbf36d2855b0db412891957b7f24fcef5a9abd
           provider marker check: server log showed only 401/403 POST lines,
           no PROVIDER_CALL_STARTED for refusal cases.
─────────────────────────────────────────────────────────────
SESSION 03 · 2026-09-19 12:55 · Claude Sonnet · P1
DID        Wrote full StreamSession.sol (CEI reentrancy, accrual formula,
           isAuthorized, NatSpec). All 7 required tests pass (forge test -vv).
           Deployed to Monad Testnet. Verified live: openSession/accrual/stopSession.
           Wrote app/lib/chain.ts with typed ABI + contract address. Build green.
LEFT       P2–P8.
BROKEN     nothing
WATCH      Windows PowerShell Here-String concatenation corrupts TS files with
           null bytes — always use write_to_file artifact then Copy-Item.
NEXT       P2 · lib/auth.ts authorize() reading isAuthorized() on-chain via viem
GATE       forge test -vv: 7 passed; 0 failed
           openSession tx: 0x05222a22124ebd3284aa188ad02d3ee5dfd867c3387effb8c25d717e81d6dc68
           stopSession tx: 0xebf6b99d419f0c85eb9845eead5310ab3a2f4b38c655799faa8d78c3937fc98c
           npm run build: ✓ Compiled successfully, exits 0
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
- [x] **Nonce replay protection** — P2 includes in-memory replay protection keyed by `sessionId:signer:nonce`. This is demo-scale only; production still needs durable storage.
- [ ] **Demo rates** — 0.002 MON/s for Claude and 0.010 MON/s for image are placeholders chosen for legibility on screen. Confirm the digits read well at demo resolution during P8; a number nobody can read on a projector is a wasted beat.

---

## Model attribution

Field guide habit 14 — note which model reasoned through what, because behaviour shifts between versions and knowing who made a call matters when you are debugging it later.

| Session | Model | Scope |
|---------|-------|-------|
| 01 | Opus 5 | Documentation set, architecture, phase plan |
