"use client";

import { Activity, Copy, Loader2, PlugZap, Square, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  keccak256,
  parseEther,
  parseEventLogs,
  stringToBytes,
  type Address,
} from "viem";
import { useAccount, useBalance, useConnect, useDisconnect, usePublicClient, useWriteContract } from "wagmi";
import { STREAM_CONTRACT_ADDRESS, STREAM_SESSION_ABI, monadTestnet } from "@/lib/chain";
import { formatMon } from "@/lib/money";
import { useTicker } from "@/lib/useTicker";

function shorten(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

type SessionView = {
  id: bigint;
  payer: Address;
  service: `0x${string}`;
  ratePerSecond: bigint;
  maxBudget: bigint;
  startTime: bigint;
  active: boolean;
};

const CLAUDE_SERVICE = keccak256(stringToBytes("CLAUDE"));

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [rateInput, setRateInput] = useState("0.002");
  const [budgetInput, setBudgetInput] = useState("2");
  const [session, setSession] = useState<SessionView | undefined>();
  const [chainAccrued, setChainAccrued] = useState<bigint | undefined>();
  const [status, setStatus] = useState<"idle" | "opening" | "active" | "stopping" | "stopped">("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [stopHash, setStopHash] = useState<`0x${string}` | undefined>();
  const [sessionError, setSessionError] = useState<string | undefined>();
  const { address, chain, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance, isLoading: balanceLoading } = useBalance({ address });
  const publicClient = usePublicClient({ chainId: monadTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const injectedConnector = useMemo(
    () => connectors.find((connector) => connector.type === "injected") ?? connectors[0],
    [connectors],
  );
  const ticker = useTicker({
    active: Boolean(session?.active),
    startTime: session?.startTime,
    ratePerSecond: session?.ratePerSecond,
    maxBudget: session?.maxBudget,
    chainAccrued,
  });

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("sessionId");
    if (!sessionId || !publicClient) {
      return;
    }

    void recoverSession(BigInt(sessionId));
  }, [publicClient]);

  useEffect(() => {
    if (!session?.active || !publicClient) {
      return;
    }

    const reconcile = async () => {
      const accrued = await publicClient.readContract({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "accrued",
        args: [session.id],
      });
      setChainAccrued(accrued);
    };

    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 5000);
    return () => window.clearInterval(timer);
  }, [publicClient, session?.active, session?.id]);

  const onCopy = async () => {
    if (!address) {
      return;
    }

    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const openSession = async () => {
    if (!publicClient) {
      setSessionError("Connect a Monad wallet first.");
      return;
    }

    try {
      setSessionError(undefined);
      setStatus("opening");

      const ratePerSecond = parseEther(rateInput);
      const maxBudget = parseEther(budgetInput);
      const hash = await writeContractAsync({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "openSession",
        args: [CLAUDE_SERVICE, ratePerSecond],
        value: maxBudget,
      });

      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const opened = parseEventLogs({
        abi: STREAM_SESSION_ABI,
        eventName: "SessionOpened",
        logs: receipt.logs,
      })[0];

      if (!opened) {
        throw new Error("SessionOpened event missing from receipt.");
      }

      const nextSession: SessionView = {
        id: opened.args.id,
        payer: opened.args.payer,
        service: opened.args.service,
        ratePerSecond: opened.args.ratePerSecond,
        maxBudget: opened.args.maxBudget,
        startTime: BigInt(opened.args.startTime),
        active: true,
      };

      setSession(nextSession);
      setChainAccrued(BigInt(0));
      setStatus("active");
      window.history.replaceState(null, "", `/?sessionId=${nextSession.id.toString()}`);
    } catch (error) {
      setStatus("idle");
      setSessionError(error instanceof Error ? error.message : "Failed to open session.");
    }
  };

  const stopSession = async () => {
    if (!session || !publicClient) {
      return;
    }

    try {
      setSessionError(undefined);
      setStatus("stopping");
      const hash = await writeContractAsync({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "stopSession",
        args: [session.id],
      });

      setStopHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      const finalAccrued = await publicClient.readContract({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "accrued",
        args: [session.id],
      });
      setChainAccrued(finalAccrued);
      setSession({ ...session, active: false });
      setStatus("stopped");
    } catch (error) {
      setStatus(session.active ? "active" : "idle");
      setSessionError(error instanceof Error ? error.message : "Failed to stop session.");
    }
  };

  const recoverSession = async (sessionId: bigint) => {
    if (!publicClient) {
      return;
    }

    try {
      setSessionError(undefined);
      const sessionData = await publicClient.readContract({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "sessions",
        args: [sessionId],
      });
      const accrued = await publicClient.readContract({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "accrued",
        args: [sessionId],
      });

      if (sessionData[0] === "0x0000000000000000000000000000000000000000") {
        return;
      }

      setSession({
        id: sessionId,
        payer: sessionData[0],
        service: sessionData[1],
        ratePerSecond: sessionData[2],
        maxBudget: sessionData[3],
        startTime: sessionData[4],
        active: sessionData[7],
      });
      setChainAccrued(accrued);
      setStatus(sessionData[7] ? "active" : "stopped");
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Failed to recover session.");
    }
  };

  const explorerTx = txHash ? `${monadTestnet.blockExplorers.default.url}/tx/${txHash}` : undefined;
  const stopExplorerTx = stopHash ? `${monadTestnet.blockExplorers.default.url}/tx/${stopHash}` : undefined;
  const canOpen = isConnected && chain?.id === monadTestnet.id && status !== "opening" && status !== "stopping";

  return (
    <main className="min-h-screen bg-[#0a0a0c] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">STREAM</h1>
            <p className="mt-1 text-sm text-neutral-400">
              AI services that only cost you while they are working.
            </p>
          </div>
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-200">
            Monad Testnet · 10143
          </div>
        </header>

        <section className="grid flex-1 gap-5 py-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="border border-white/10 bg-neutral-950 p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-normal">Wallet</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Connect the injected browser wallet that will fund Stream sessions.
                </p>
              </div>
              <Wallet className="h-6 w-6 text-emerald-300" aria-hidden="true" />
            </div>

            <div className="mt-6 space-y-3">
              {isConnected && address ? (
                <>
                  <div className="grid gap-3 border border-white/10 bg-black/30 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-neutral-400">Address</span>
                      <button
                        type="button"
                        onClick={onCopy}
                        className="inline-flex items-center gap-2 font-mono text-neutral-100 hover:text-emerald-200"
                        title="Copy wallet address"
                      >
                        {shorten(address)}
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-neutral-400">Balance</span>
                      <span className="font-mono text-neutral-100">
                        {balanceLoading ? "loading..." : `${formatMon(balance?.value, 4)} MON`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-neutral-400">Network</span>
                      <span className="font-mono text-neutral-100">
                        {chain ? `${chain.name} · ${chain.id}` : "unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-neutral-500">
                      {copied ? "Address copied" : "Ready to open a Claude session"}
                    </span>
                    <button
                      type="button"
                      onClick={() => disconnect()}
                      className="inline-flex items-center justify-center border border-white/15 px-4 py-2 text-sm text-neutral-200 hover:border-white/30 hover:bg-white/5"
                    >
                      Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!injectedConnector || isPending}
                    onClick={() => injectedConnector && connect({ connector: injectedConnector })}
                    className="inline-flex w-full items-center justify-center gap-2 bg-emerald-300 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                  >
                    <PlugZap className="h-4 w-4" aria-hidden="true" />
                    {isPending ? "Connecting..." : "Connect Injected Wallet"}
                  </button>
                  <p className="text-xs text-neutral-500">
                    {error
                      ? error.message
                      : injectedConnector
                        ? "Uses only the browser-injected wallet connector."
                        : "No injected wallet detected in this browser."}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="border border-white/10 bg-neutral-950 p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-normal">Claude Stream</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Start a funded on-chain session and watch the live MON counter.
                </p>
              </div>
              <Activity className="h-6 w-6 text-sky-300" aria-hidden="true" />
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="text-neutral-400">Rate, MON/s</span>
                <input
                  value={rateInput}
                  onChange={(event) => setRateInput(event.target.value)}
                  className="border border-white/10 bg-black/30 px-3 py-2 font-mono text-neutral-100 outline-none focus:border-emerald-300"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-neutral-400">Budget, MON</span>
                <input
                  value={budgetInput}
                  onChange={(event) => setBudgetInput(event.target.value)}
                  className="border border-white/10 bg-black/30 px-3 py-2 font-mono text-neutral-100 outline-none focus:border-emerald-300"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-400">Status</span>
                <span className="font-mono uppercase text-neutral-100">{status}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-400">Session</span>
                <span className="font-mono text-neutral-100">{session ? session.id.toString() : "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-400">Consumed</span>
                <span className="font-mono tabular-nums text-emerald-200">
                  {formatMon(ticker.consumed)} MON
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-400">Remaining</span>
                <span className="font-mono tabular-nums text-neutral-100">
                  {session ? `${formatMon(ticker.remaining)} MON` : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-400">Chain accrued</span>
                <span className="font-mono tabular-nums text-neutral-100">
                  {chainAccrued === undefined ? "-" : `${formatMon(chainAccrued)} MON`}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canOpen || status === "active"}
                onClick={openSession}
                className="inline-flex items-center justify-center gap-2 bg-emerald-300 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              >
                {status === "opening" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Open Claude Session
              </button>
              <button
                type="button"
                disabled={!session?.active || status === "stopping"}
                onClick={stopSession}
                className="inline-flex items-center justify-center gap-2 border border-white/15 px-4 py-3 text-sm text-neutral-200 hover:border-white/30 hover:bg-white/5 disabled:cursor-not-allowed disabled:text-neutral-600"
              >
                {status === "stopping" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                Stop
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs text-neutral-500">
              {chain?.id !== undefined && chain.id !== monadTestnet.id ? (
                <p>Switch wallet network to Monad Testnet before opening a session.</p>
              ) : null}
              {explorerTx ? (
                <p>
                  Open tx:{" "}
                  <a className="text-emerald-200 hover:underline" href={explorerTx} target="_blank" rel="noreferrer">
                    {txHash}
                  </a>
                </p>
              ) : null}
              {stopExplorerTx ? (
                <p>
                  Stop tx:{" "}
                  <a className="text-emerald-200 hover:underline" href={stopExplorerTx} target="_blank" rel="noreferrer">
                    {stopHash}
                  </a>
                </p>
              ) : null}
              {sessionError ? <p className="text-red-300">{sessionError}</p> : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
