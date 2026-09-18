# TEST CHECKLIST

> AI claiming success and code actually working are two different facts. This file is how you stop confusing them.

Actual commands, actual expected outputs. Not a vibe check. **A phase is done when its section here passes and the real output is pasted into [HANDOVER.md](./HANDOVER.md)** — not when the code exists.

Shell variables assumed throughout:

```bash
export RPC=https://testnet-rpc.monad.xyz
export CONTRACT=0x…        # filled at P1
export DEPLOYER=0x…
```

---

## 1. Environment (gate for P0)

```bash
cast chain-id --rpc-url $RPC
```
→ `10143`

```bash
cast balance $DEPLOYER --rpc-url $RPC
```
→ non-zero. If zero, the faucet has not landed. Do not proceed to deployment.

```bash
cd app && npm run build
```
→ exit code 0, no type errors.

```bash
git status --porcelain | grep -E '\.env$|\.env\.local'
```
→ **no output.** Any output here means a secret is staged. Stop and fix before anything else.

---

## 2. Contract (gate for P1)

```bash
cd contracts && forge test -vv
```

All of these must be present and passing by name:

| Test | Asserts |
|------|---------|
| `test_AccrualMatchesRateTimesElapsed` | After warping 60 s at 0.002 MON/s, `accrued == 0.12e18` |
| `test_AccrualCapsAtMaxBudget` | After warping past the runway, `accrued == maxBudget` exactly, never more |
| `test_StopSettlesAndRefundsExactly` | `treasury balance + payer refund == maxBudget`, to the wei |
| `test_StopByStranger_Reverts` | A third address calling `stopSession` reverts |
| `test_StopTwice_Reverts` | Second `stopSession` on an inactive session reverts |
| `test_IsAuthorizedFalseWhenExhausted` | `isAuthorized` returns false once `accrued == maxBudget` |
| `test_ReentrantStop_Reverts` | A malicious treasury re-entering `stopSession` cannot double-settle |
| `test_OpenWithZeroRate_Reverts` | `ratePerSecond == 0` is rejected |
| `test_OpenWithBudgetBelowOneSecond_Reverts` | `msg.value < ratePerSecond` is rejected |

Then live on testnet:

```bash
forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
# record the address into .env.local and HANDOVER.md

cast send $CONTRACT "openSession(bytes32,uint256)" \
  $(cast keccak "CLAUDE") 2000000000000000 \
  --value 0.1ether --rpc-url $RPC --private-key $PK

cast call $CONTRACT "accrued(uint256)(uint256)" 0 --rpc-url $RPC
sleep 10
cast call $CONTRACT "accrued(uint256)(uint256)" 0 --rpc-url $RPC
```
→ the second value exceeds the first by roughly `10 × 2000000000000000` = `2e16` wei. Tolerance of one or two blocks is expected and fine.

```bash
cast call $CONTRACT "remaining(uint256)(uint256)" 0 --rpc-url $RPC
```
→ `0.1e18 − accrued`. The two must sum to the escrowed budget.

---

## 3. Authorization (gate for P2)

**This section is the one most likely to be skipped and the one most worth running.** An authorization layer that has never been observed refusing anything has not been tested.

```bash
# 3.1 — no signature at all
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/claude \
  -H 'content-type: application/json' \
  -d '{"sessionId":0,"prompt":"hello"}'
```
→ `401`

```bash
# 3.2 — signature from a wallet that is not the payer
```
→ `401`, body `{"error":"signer_mismatch"}`

```bash
# 3.3 — valid signature, but the session was stopped first
```
→ `403`, body `{"error":"session_inactive"}`

```bash
# 3.4 — valid CLAUDE session used against the image endpoint
```
→ `403`, body `{"error":"service_mismatch"}`

```bash
# 3.5 — valid session whose budget is already exhausted
```
→ `403`, body `{"error":"budget_exhausted"}`

**3.6 — The provider is never touched on a refusal.** Put a log line as the first statement inside the provider call path, run all five cases above, then:

```bash
grep -c "PROVIDER_CALL_STARTED" app/.next/server.log
```
→ `0`

**3.7 — The key never reaches the browser.** With the app running, in DevTools:

```js
// Console, on the session page:
Object.keys(window).filter(k => /anthropic|api_?key|sk-/i.test(k))   // → []
```
Then in the Network tab, search all responses for `sk-ant`. → no matches. Then:

```bash
cd app && npm run build && grep -r "sk-ant" .next/static/ | wc -l
```
→ `0`

---

## 4. STOP enforcement

This is the gate for P4 and the most important section in this file.

**4.1 — Happy path, three consecutive clean runs.** Start a Claude session, prompt, let tokens stream ~15 s, press STOP.

- The counter freezes immediately.
- The response visibly halts mid-sentence.
- A receipt appears with runtime, settled amount, refund, and an explorer link.
- Settled amount is within 2% of `0.002 × elapsed seconds`.
- The transaction resolves on `https://testnet.monadscan.com`.

**4.2 — The negative test, which is the one that proves the thesis.** Disable the optimistic abort path (comment out the client's `POST /api/abort`). Start a session, prompt, and stop.

→ The stream must still die within two seconds, from the chain poll alone.

If this fails, the product's central claim is false — the chain would be a bystander and the client would be doing the enforcing. Fix it before anything else. See [FLOW §3](./FLOW.md#path-3--stop-the-one-that-matters).

**4.3 — Stranger cannot stop.** With a session open under wallet A, call `stopSession` from wallet B.

```bash
cast send $CONTRACT "stopSession(uint256)" 0 --rpc-url $RPC --private-key $OTHER_PK
```
→ reverts. The session stays active and the stream keeps running.

**4.4 — Settlement arithmetic balances.** For any completed session:

```
settledAmount + refundToPayer == maxBudget
```
Verify from the `SessionSettled` event, not from the UI.

---

## 5. Service paths (gates for P4 and P5)

**5.1 — Claude completes naturally.** Prompt something short. The stream ends on its own, the stream settles without a stop click, and the receipt shows `✓ TASK COMPLETE`. Crucially: **accrual stops at completion, not at some later tick.** Watch the counter at the moment the last token lands — if it keeps climbing, that falsifies the product thesis and is the highest-priority bug in the project.

**5.2 — Image generation completes.** Upload a photo, prompt the poster, watch the ticker run for the real duration, see the image render, see the settlement happen unprompted. Elapsed × rate matches settled within 2%.

**5.3 — Provider swap works.** Flip the provider environment variable between mock and real; restart; both paths produce an image through the same interface with no code change.

---

## 6. Failure paths (gate for P7)

| Scenario | How to trigger | Expected |
|----------|---------------|----------|
| Budget exhaustion | Open at 0.01 MON/s with a 0.05 MON budget | At ~5 s: gateway terminates, UI shows `BUDGET EXHAUSTED`, ticker frozen at exactly `maxBudget`, receipt with zero refund |
| Rejected transaction | Cancel in the wallet at the Start prompt | UI returns to pre-session state, no orphaned local state, no phantom session |
| Wrong network | Switch the wallet to another chain | Network banner with a one-click switch to Monad testnet; Start is disabled |
| Provider error | Set an invalid provider key | Stream settles at elapsed time, error surfaced, user billed only for seconds consumed |
| RPC failure | Point at an unreachable RPC | Ticker keeps running locally, a "reconnecting" indicator appears, no crash, no blank screen |

```bash
# console must be clean across all five
# DevTools → Console → filter: Errors
```
→ zero unhandled rejections, zero raw stack traces reaching the user.

---

## 7. The explain-it-back gate

Field guide habit 15, and it applies at every phase boundary. Before tagging a checkpoint, say out loud, without reading the code:

- What this phase's code does, in your own words
- What calls into it and what it calls
- What breaks if it fails, and what the user would see

**If you cannot do this, the phase is not done** — no matter how green the tests are. At hour six with a broken demo, the only code you can fix is the code you actually understand. This is the whole reason the other fourteen habits exist.

---

## 8. Pre-demo checklist (gate for P8)

Run this immediately before the demo, on the demo machine, in the demo browser, on the demo network.

- [ ] Demo wallet holds 20+ MON on Monad testnet
- [ ] Contract address in `.env.local` matches the deployed address in HANDOVER
- [ ] `npm run build && npm start` — production build, not dev server
- [ ] Source photo pre-loaded and the Claude prompt pre-written somewhere copy-pasteable
- [ ] Block explorer open in a second tab, already on the contract page
- [ ] Wallet already connected and on Monad testnet
- [ ] Browser notifications and Slack silenced; screen-share tested
- [ ] Backup screen recording exists and plays
- [ ] Three full run-throughs completed inside three minutes
- [ ] The [PRD §3](./PRD_V2.md#3-the-correction-that-must-never-be-garbled) correction delivered from memory **while someone interrupts you mid-sentence**
- [ ] The [PRD §15](./PRD_V2.md#15-the-sentence-to-memorize) one-liner memorized
- [ ] If the mock image provider is in use, the disclosure line is rehearsed
