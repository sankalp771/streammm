# STREAM Operator Manual

Live app: https://app-ruddy-five-86.vercel.app/

Stream turns a funded MON session into a live authorization signal for AI work. The user chooses a rate and a maximum budget, opens a session on Monad Testnet, and pays only the amount accrued before the service settles.

## Before You Start

- Use a desktop browser with MetaMask installed.
- Switch MetaMask to Monad Testnet (chain ID `10143`).
- Keep enough testnet MON for session budgets and transaction gas.
- Open the live app and connect the injected wallet.

The app never asks for an API key. Provider keys and the settler key stay on the server.

## Choose A Service

The home page is the service selector:

- Claude: `https://app-ruddy-five-86.vercel.app/claude`
- Image: `https://app-ruddy-five-86.vercel.app/image`

The `Services` link or the `STREAM` wordmark returns to the selector.

## Claude Flow

1. Open the Claude page.
2. Connect the injected wallet.
3. Set `Rate, MON/s` and `Budget, MON`.
4. Click `Open Claude Session` and confirm the `openSession` transaction in MetaMask.
5. Enter a prompt and click `Stream Claude`.
6. Approve the authorization signature. This signature authorizes this request; it is not a payment.
7. Watch the live output and spend ticker.
8. Click `Stop` to end the stream, or let the provider finish.

The terminal receipt shows the reason, runtime, settled amount, refund, and a MonadScan settlement link.

For the main demo, use `0.002 MON/s` and a budget of `2 MON`. Stop during a response to show that the stream terminates and the on-chain session settles.

## Image Flow

1. Open the Image page.
2. Connect the wallet if it is not already connected.
3. Set the image rate and budget.
4. Click `Open Image Session` and confirm the transaction.
5. Enter a prompt and click `Generate Image`.
6. Wait for the poster to render. The gateway settles the session when the image arrives.
7. Check the rendered image, provider label, settlement status, and explorer links.

For the main demo, use `0.010 MON/s` and a budget of `1 MON`.

If the deployment uses the mock image provider, the page labels it as mock output. The economic session, authorization, accrual, settlement, and refund are still real.

## Two Services At Once

Open Claude and Image in separate browser tabs or use their separate routes. With the default demo rates, the aggregate flow should read:

```text
CLAUDE  0.002 MON/s
IMAGE   0.010 MON/s
TOTAL   0.012 MON/s
```

Stop Claude and the total should fall to `0.010 MON/s` while Image continues independently.

## Receipts And Transactions

Each service has two important transaction links:

- Open tx: the wallet-funded `openSession` transaction.
- Settlement tx: the payer or backend settler `stopSession` transaction.

The contract is deployed at:

```text
0x3e515c11B9B7A5E1398B614FbFe87A8570c95882
```

View transactions at https://testnet.monadscan.com/.

## Failure Recovery

Wrong network: use the `Switch network` button in the banner, then retry.

Cancelled MetaMask transaction: the app returns to its pre-session state. No session is opened.

Rate-limited RPC: wait a moment and retry the transaction. Check that the session state and receipt are settled before starting another run.

Provider error: the gateway reports the provider failure and attempts to settle the session for the elapsed amount. Use the receipt and `Stop` backstop if the session remains active.

Budget exhaustion: a session at `0.010 MON/s` with a `0.05 MON` budget should terminate at the cap and show a zero-refund settlement receipt.

## Demo Framing

Use this line:

> Stream turns money into a live control signal: users continuously fund an AI service on Monad, and the service can only keep working while that economic stream is active.

Do not say that Claude or the image provider bills by the second. Stream adds a MON-denominated economic session and uses its live on-chain state to authorize execution.
