# ARCHITECTURE

> The shape of the system, so the AI does not re-derive it every session.

This is a map, not implementation detail. Implementation lives in the code; the reasoning behind these choices lives in [DECISIONS.md](./DECISIONS.md).

---

## 1. The change from v1

The v1 architecture was deliberately backendless:

```
Wallet → Stream Contract → Creator
```

That was correct when the only thing being paid for was a livestream the browser could watch directly. It is wrong for v2, for one non-negotiable reason: **the browser must never hold a production Anthropic API key.** The moment an AI provider sits behind the payment, a trusted server has to stand between the user and that provider.

So v2 has three tiers, and the "no backend" constraint from v1 is formally retired in [CONSTRAINTS.md](./CONSTRAINTS.md).

---

## 2. System map

```
                       ┌─────────────────────────┐
                       │   Monad Testnet         │
                       │   StreamSession.sol     │
                       │                         │
                       │  · escrowed budget      │
                       │  · flow-rate accrual    │
                       │  · active / settled     │
                       └───────┬─────────────────┘
                    open/stop  │  ▲  authorization reads
                    (user tx)  │  │  (1s poll, gateway)
                               ▼  │
   ┌────────────┐       ┌──────────────────────────┐
   │   User     │──────▶│   AI Gateway             │
   │  Browser   │  HTTP │   (Next.js route         │
   │            │◀──────│    handlers, Node)       │
   │ · wallet   │  SSE  │                          │
   │ · ticker   │       │  · sig verification      │
   │ · UI       │       │  · on-chain auth check   │
   └─────┬──────┘       │  · provider calls        │
         │              │  · abort on revocation   │
         │ RPC reads    └──────┬───────────────────┘
         │ (5s reconcile)      │
         ▼                     ├──────────▶ Anthropic API
   Monad Testnet               └──────────▶ Image Provider
```

Three tiers, three jobs, no overlap:

| Tier | Owns | Never does |
|------|------|------------|
| **Monad** | Payment state, session lifecycle, settlement, the authorization fact | Execute AI work, hold prompts or outputs |
| **Gateway** | Provider credentials, verification, execution lifecycle, abort | Hold funds, decide pricing, trust anything the client says about session state |
| **Browser** | Wallet signing, presentation, the smooth local ticker | Hold provider keys, be the source of truth for money |

**The load-bearing sentence:** the browser tells the gateway *which* session it claims, and the gateway asks the chain whether that claim is true. Client-asserted session state is never trusted for authorization — only for display.

---

## 3. Contract layer — `StreamSession.sol`

Single contract, no proxy, no upgradeability. A seven-hour build does not get an upgrade path.

```solidity
struct Session {
    address payer;          // who funded and who gets the refund
    bytes32 service;        // keccak256("CLAUDE") | keccak256("IMAGE")
    uint256 ratePerSecond;  // wei of MON per second
    uint256 maxBudget;      // wei, escrowed at open — the liability ceiling
    uint64  startTime;
    uint64  lastCheckpoint;
    uint256 settledAmount;
    bool    active;
}
```

**Accrual is derived, never stored per tick:**

```
accrued(id) = min( ratePerSecond × (block.timestamp − startTime),  maxBudget )
```

This is the flow-rate model carried forward from v1 unchanged, and it is the reason the system does not need a transaction per second. Transactions occur only at state transitions — open, optional checkpoint, stop. Between them the chain is a continuously readable derived value.

**Roles:**

- `payer` — opens, funds, may stop, receives the refund
- `settler` — a backend hot wallet that may also stop. It exists so completion-triggered settlement does not require a wallet popup at the end of every demo run. It can **only** stop sessions; it cannot open them, cannot change rates, and cannot redirect funds.
- `treasury` — receives settled MON

**Safety properties, in priority order:**

1. `accrued` is capped at `maxBudget`, so liability is bounded by what was escrowed. There is no path to an unbounded charge.
2. `stopSession` sets `active = false` before any value transfer — checks, effects, interactions.
3. `stopSession` is idempotent-by-revert: a second call on an inactive session reverts rather than double-paying.
4. Only `payer` or `settler` may stop. A stranger holding a session ID can do nothing with it.

---

## 4. Gateway layer

Next.js route handlers on the Node runtime, deployed with the frontend as one application. One repository, one deploy, one set of environment variables — see [D-04](./DECISIONS.md#d-04--gateway-lives-inside-the-nextjs-app).

```
app/api/claude/route.ts     POST → SSE stream of tokens
app/api/image/route.ts      POST → SSE progress, then result URL
app/lib/auth.ts             authorize() + watchAuthorization()
app/lib/chain.ts            viem clients, ABI, addresses
app/lib/providers/image/    ImageProvider interface + adapters
```

### Request lifecycle

```
POST /api/claude
  │
  ├─ 1. recover signer from the personal_sign signature
  ├─ 2. read sessions(sessionId) over RPC
  ├─ 3. assert: signer == payer
  │              active == true
  │              accrued < maxBudget
  │              service matches this endpoint
  │     └─ any failure → 401/403, provider SDK is never touched
  │
  ├─ 4. open an AbortController; start a 1s authorization poll
  ├─ 5. call the provider, streaming through to the client
  │     └─ poll observes !active or exhausted → controller.abort()
  │                                            → emit `terminated`
  └─ 6. on completion → emit `complete` → client triggers settlement
```

Step 3 is the whole security model. Step 5 is the whole product thesis.

### Provider abstraction

Claude is called through the Anthropic SDK directly. Image generation goes behind an interface, because the provider is not yet chosen:

```ts
interface ImageProvider {
  generate(
    prompt: string,
    sourceImage: Buffer | undefined,
    signal: AbortSignal
  ): Promise<{ url: string }>;
}
```

`MockImageProvider` (8-second wait, bundled PNG) is built first and is the demo safety net. The real adapter is selected by environment variable. Nothing above this interface knows which one is running — which is exactly why swapping providers at 5 a.m. is a config change and not a refactor.

---

## 5. Browser layer

```
app/page.tsx                    dashboard, service cards, aggregate flow bar
app/session/[service]/page.tsx  live session: ticker, prompt/upload, STOP, receipt
lib/useSession.ts               open, watch, stop
lib/useTicker.ts                100ms local tick + 5s chain reconcile
```

**Wallet:** wagmi v2 + viem, injected connector only. No wallet-selection modal library — it is a dependency and a failure mode we do not need for a demo on one machine.

**The ticker is a display, not an accountant.** It runs locally at 100 ms for smoothness and reconciles against `accrued()` every 5 seconds. On disagreement, chain truth wins, eased in over ~300 ms so the number never visibly jumps backwards. The authoritative number on every receipt comes from the settlement event, never from the local ticker.

**Aggregate flow** across simultaneous sessions is a client-side sum over active sessions. Sessions are independent on chain, so this needs no contract support — see [D-11](./DECISIONS.md#d-11--multi-session-aggregation-is-a-view-concern).

---

## 6. Trust boundaries

Three lines, and it is worth being able to draw them on a whiteboard when asked.

| Boundary | Crossing | Protection |
|----------|----------|-----------|
| Browser → Gateway | Session claim | `personal_sign` recovered against the on-chain `payer` |
| Gateway → Chain | Authorization read | Direct RPC read of contract state; no client input is trusted |
| Gateway → Provider | API credentials | Server-side environment only; never sent to or through the browser |

**Known hackathon limitations, stated plainly.** The gateway trusts its own RPC endpoint — a malicious RPC could lie about session state. Nonce replay protection may be cut under time pressure. Neither is defensible in production and both are the right trade for a seven-hour build. Say so if a judge asks; the answer is stronger than a bluff.

---

## 7. What is deliberately absent

No database — session state lives on chain and in memory for the request's lifetime. No user accounts — the wallet is the identity. No queue or job store — requests are synchronous and short-lived. No indexer — receipts read from transaction logs. No multi-provider routing, no pricing oracle, no upgrade proxy.

Every one of these is a reasonable thing for a real product to have and a fatal thing to start building at hour three of seven.
