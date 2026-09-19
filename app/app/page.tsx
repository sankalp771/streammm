"use client";

import { Activity, Copy, ImageIcon, Loader2, PlugZap, Square, Wallet } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  keccak256,
  parseEther,
  parseEventLogs,
  stringToBytes,
  type Address,
} from "viem";
import { useAccount, useBalance, useConnect, useDisconnect, usePublicClient, useWriteContract } from "wagmi";
import { useSignMessage } from "wagmi";
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
const IMAGE_SERVICE = keccak256(stringToBytes("IMAGE"));

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
  const [prompt, setPrompt] = useState("Give me a crisp one-paragraph demo pitch for Stream.");
  const [claudeText, setClaudeText] = useState("");
  const [claudeStatus, setClaudeStatus] = useState<"idle" | "signing" | "streaming" | "complete" | "terminated" | "error">("idle");
  const [claudeError, setClaudeError] = useState<string | undefined>();
  const [imagePrompt, setImagePrompt] = useState(
    "A cinematic poster for Stream: pay-per-second AI on Monad, neon green and sky blue, futuristic dashboard",
  );
  const [imageRateInput, setImageRateInput] = useState("0.010");
  const [imageBudgetInput, setImageBudgetInput] = useState("1");
  const [imageSession, setImageSession] = useState<SessionView | undefined>();
  const [imageChainAccrued, setImageChainAccrued] = useState<bigint | undefined>();
  const [imageStatus, setImageStatus] = useState<
    "idle" | "opening" | "active" | "generating" | "stopping" | "settled" | "error"
  >("idle");
  const [imageOpenHash, setImageOpenHash] = useState<`0x${string}` | undefined>();
  const [imageStopHash, setImageStopHash] = useState<`0x${string}` | undefined>();
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [imageProvider, setImageProvider] = useState<string | undefined>();
  const [imageSettlement, setImageSettlement] = useState<string | undefined>();
  const [imageError, setImageError] = useState<string | undefined>();
  const { address, chain, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance, isLoading: balanceLoading } = useBalance({ address });
  const publicClient = usePublicClient({ chainId: monadTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
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
  const imageTicker = useTicker({
    active: Boolean(imageSession?.active),
    startTime: imageSession?.startTime,
    ratePerSecond: imageSession?.ratePerSecond,
    maxBudget: imageSession?.maxBudget,
    chainAccrued: imageChainAccrued,
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

  useEffect(() => {
    if (!imageSession?.active || !publicClient) {
      return;
    }

    const reconcile = async () => {
      const accrued = await publicClient.readContract({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "accrued",
        args: [imageSession.id],
      });
      setImageChainAccrued(accrued);
    };

    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 5000);
    return () => window.clearInterval(timer);
  }, [imageSession?.active, imageSession?.id, publicClient]);

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

      const { hash, session: nextSession } = await openFundedSession(
        CLAUDE_SERVICE,
        parseEther(rateInput),
        parseEther(budgetInput),
      );

      setTxHash(hash);
      setSession(nextSession);
      setChainAccrued(BigInt(0));
      setStatus("active");
      window.history.replaceState(null, "", `/?sessionId=${nextSession.id.toString()}`);
    } catch (error) {
      setStatus("idle");
      setSessionError(error instanceof Error ? error.message : "Failed to open session.");
    }
  };

  const openImageSession = async () => {
    if (!publicClient) {
      setImageError("Connect a Monad wallet first.");
      return;
    }

    try {
      setImageError(undefined);
      setImageUrl(undefined);
      setImageProvider(undefined);
      setImageSettlement(undefined);
      setImageStopHash(undefined);
      setImageStatus("opening");

      const { hash, session: nextSession } = await openFundedSession(
        IMAGE_SERVICE,
        parseEther(imageRateInput),
        parseEther(imageBudgetInput),
      );

      setImageOpenHash(hash);
      setImageSession(nextSession);
      setImageChainAccrued(BigInt(0));
      setImageStatus("active");
    } catch (error) {
      setImageStatus("idle");
      setImageError(error instanceof Error ? error.message : "Failed to open image session.");
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

  const runClaude = async () => {
    if (!session?.active) {
      setClaudeError("Open an active Claude session first.");
      return;
    }

    try {
      setClaudeError(undefined);
      setClaudeText("");
      setClaudeStatus("signing");

      const nonce = `0x${crypto.randomUUID().replaceAll("-", "")}`;
      const issued = new Date().toISOString();
      const message = buildAuthorizationMessage(session.id, nonce, issued);
      const signature = await signMessageAsync({ message });

      setClaudeStatus("streaming");
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id.toString(),
          nonce,
          issued,
          signature,
          prompt,
        }),
      });

      if (!response.ok || !response.body) {
        const body = await response.text();
        throw new Error(body || `Claude request failed with ${response.status}`);
      }

      await readSse(response.body, {
        token(data) {
          if (typeof data.text === "string") {
            setClaudeText((current) => current + data.text);
          }
        },
        complete() {
          setClaudeStatus("complete");
        },
        terminated(data) {
          setClaudeStatus("terminated");
          setClaudeError(`Stream terminated: ${String(data.reason || "revoked")}`);
        },
        error(data) {
          setClaudeStatus("error");
          setClaudeError(String(data.detail || data.error || "claude_stream_failed"));
        },
      });
    } catch (error) {
      setClaudeStatus("error");
      setClaudeError(error instanceof Error ? error.message : "Claude request failed.");
    }
  };

  const runImage = async () => {
    if (!imageSession?.active) {
      setImageError("Open an active image session first.");
      return;
    }

    try {
      setImageError(undefined);
      setImageUrl(undefined);
      setImageProvider(undefined);
      setImageSettlement(undefined);
      setImageStopHash(undefined);
      setImageStatus("generating");

      const nonce = `0x${crypto.randomUUID().replaceAll("-", "")}`;
      const issued = new Date().toISOString();
      const message = buildAuthorizationMessage(imageSession.id, nonce, issued);
      const signature = await signMessageAsync({ message });
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: imageSession.id.toString(),
          nonce,
          issued,
          signature,
          prompt: imagePrompt,
        }),
      });
      const body = (await response.json()) as {
        detail?: string;
        error?: string;
        provider?: string;
        settledAmount?: string;
        settlement?: string;
        stopHash?: `0x${string}`;
        url?: string;
      };

      if (!response.ok || !body.url) {
        if (body.url) {
          setImageUrl(body.url);
        }
        if (body.provider) {
          setImageProvider(body.provider);
        }
        if (body.settlement) {
          setImageSettlement(body.settlement);
        }
        if (body.stopHash) {
          setImageStopHash(body.stopHash);
        }
        throw new Error(body.detail || body.error || `Image request failed with ${response.status}`);
      }

      setImageUrl(body.url);
      setImageProvider(body.provider);
      setImageSettlement(body.settlement);
      setImageStopHash(body.stopHash);
      setImageChainAccrued(body.settledAmount ? BigInt(body.settledAmount) : imageChainAccrued);
      setImageSession({ ...imageSession, active: false });
      setImageStatus("settled");
    } catch (error) {
      setImageStatus("error");
      setImageError(error instanceof Error ? error.message : "Image generation failed.");
    }
  };

  const stopImageSession = async () => {
    if (!imageSession || !publicClient) {
      return;
    }

    try {
      setImageError(undefined);
      setImageStatus("stopping");
      const hash = await writeContractAsync({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "stopSession",
        args: [imageSession.id],
      });

      setImageStopHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      const finalAccrued = await publicClient.readContract({
        address: STREAM_CONTRACT_ADDRESS,
        abi: STREAM_SESSION_ABI,
        functionName: "accrued",
        args: [imageSession.id],
      });
      setImageChainAccrued(finalAccrued);
      setImageSession({ ...imageSession, active: false });
      setImageStatus("settled");
    } catch (error) {
      setImageStatus(imageSession.active ? "error" : "idle");
      setImageError(error instanceof Error ? error.message : "Failed to stop image session.");
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
  const imageExplorerTx = imageOpenHash ? `${monadTestnet.blockExplorers.default.url}/tx/${imageOpenHash}` : undefined;
  const imageStopExplorerTx = imageStopHash ? `${monadTestnet.blockExplorers.default.url}/tx/${imageStopHash}` : undefined;
  const claudeLiveRate = session?.active ? session.ratePerSecond : BigInt(0);
  const imageLiveRate = imageSession?.active ? imageSession.ratePerSecond : BigInt(0);
  const totalLiveRate = claudeLiveRate + imageLiveRate;
  const totalConsumed = ticker.consumed + imageTicker.consumed;
  const activeSessionCount = Number(Boolean(session?.active)) + Number(Boolean(imageSession?.active));
  const canOpen = isConnected && chain?.id === monadTestnet.id && status !== "opening" && status !== "stopping";
  const canOpenImage =
    isConnected &&
    chain?.id === monadTestnet.id &&
    imageStatus !== "opening" &&
    imageStatus !== "generating" &&
    imageStatus !== "stopping" &&
    !imageSession?.active;

  const openFundedSession = async (
    service: `0x${string}`,
    ratePerSecond: bigint,
    maxBudget: bigint,
  ): Promise<{ hash: `0x${string}`; session: SessionView }> => {
    if (!publicClient) {
      throw new Error("Connect a Monad wallet first.");
    }

    const hash = await writeContractAsync({
      address: STREAM_CONTRACT_ADDRESS,
      abi: STREAM_SESSION_ABI,
      functionName: "openSession",
      args: [service, ratePerSecond],
      value: maxBudget,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const opened = parseEventLogs({
      abi: STREAM_SESSION_ABI,
      eventName: "SessionOpened",
      logs: receipt.logs,
    })[0];

    if (!opened) {
      throw new Error("SessionOpened event missing from receipt.");
    }

    return {
      hash,
      session: {
        id: opened.args.id,
        payer: opened.args.payer,
        service: opened.args.service,
        ratePerSecond: opened.args.ratePerSecond,
        maxBudget: opened.args.maxBudget,
        startTime: BigInt(opened.args.startTime),
        active: true,
      },
    };
  };

  return (
    <main className="min-h-screen bg-[#0a0a0c] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
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

        <section className="mt-5 border border-white/10 bg-neutral-950 px-5 py-4 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-normal text-neutral-300">Aggregate Flow</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Client-side sum of active on-chain sessions. No contract change required.
              </p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:min-w-[560px]">
              <div className="border border-white/10 bg-black/30 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-400">CLAUDE</span>
                  <span className={session?.active ? "font-mono text-emerald-200" : "font-mono text-neutral-600"}>
                    {formatMon(claudeLiveRate, 3)} MON/s
                  </span>
                </div>
              </div>
              <div className="border border-white/10 bg-black/30 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-400">IMAGE</span>
                  <span className={imageSession?.active ? "font-mono text-emerald-200" : "font-mono text-neutral-600"}>
                    {formatMon(imageLiveRate, 3)} MON/s
                  </span>
                </div>
              </div>
              <div className="border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <div className="flex min-w-44 items-center justify-between gap-4">
                  <span className="text-emerald-100">TOTAL</span>
                  <span className="font-mono text-emerald-200">{formatMon(totalLiveRate, 3)} MON/s</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-neutral-500">
            <span>
              Active sessions: <span className="font-mono text-neutral-300">{activeSessionCount}</span>
            </span>
            <span>
              Total consumed shown on this page:{" "}
              <span className="font-mono text-neutral-300">{formatMon(totalConsumed)} MON</span>
            </span>
          </div>
        </section>

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

            <div className="mt-6 border-t border-white/10 pt-5">
              <label className="grid gap-2 text-sm">
                <span className="text-neutral-400">Prompt Claude</span>
                <textarea
                  value={prompt}
                  disabled={!session?.active || claudeStatus === "streaming" || claudeStatus === "signing"}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={4}
                  className="resize-none border border-white/10 bg-black/30 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-300 disabled:text-neutral-500"
                />
              </label>
              <button
                type="button"
                disabled={!session?.active || claudeStatus === "streaming" || claudeStatus === "signing"}
                onClick={runClaude}
                className="mt-3 inline-flex items-center justify-center gap-2 bg-sky-300 px-4 py-3 text-sm font-semibold text-black hover:bg-sky-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              >
                {claudeStatus === "signing" || claudeStatus === "streaming" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                Stream Claude
              </button>
              <div className="mt-4 max-h-[520px] min-h-32 overflow-y-auto border border-white/10 bg-black/30 p-4 text-sm leading-6 text-neutral-100">
                {claudeText ? renderMarkdown(claudeText) : <span className="text-neutral-500">Claude output will stream here.</span>}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-neutral-500">
                <span>Claude status: {claudeStatus}</span>
                {claudeError ? <span className="text-red-300">{claudeError}</span> : null}
              </div>
            </div>
          </div>

          <div className="border border-white/10 bg-neutral-950 p-6 shadow-2xl shadow-black/30 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-normal">Image Stream</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Generate a poster inside a funded IMAGE session that settles when the image lands.
                </p>
              </div>
              <ImageIcon className="h-6 w-6 text-emerald-300" aria-hidden="true" />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    <span className="text-neutral-400">Rate, MON/s</span>
                    <input
                      value={imageRateInput}
                      disabled={imageStatus === "opening" || imageStatus === "generating" || imageStatus === "stopping"}
                      onChange={(event) => setImageRateInput(event.target.value)}
                      className="border border-white/10 bg-black/30 px-3 py-2 font-mono text-neutral-100 outline-none focus:border-emerald-300 disabled:text-neutral-500"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="text-neutral-400">Budget, MON</span>
                    <input
                      value={imageBudgetInput}
                      disabled={imageStatus === "opening" || imageStatus === "generating" || imageStatus === "stopping"}
                      onChange={(event) => setImageBudgetInput(event.target.value)}
                      className="border border-white/10 bg-black/30 px-3 py-2 font-mono text-neutral-100 outline-none focus:border-emerald-300 disabled:text-neutral-500"
                    />
                  </label>
                </div>

                <div className="grid gap-3 border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-neutral-400">Status</span>
                    <span className="font-mono uppercase text-neutral-100">{imageStatus}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-neutral-400">Session</span>
                    <span className="font-mono text-neutral-100">
                      {imageSession ? imageSession.id.toString() : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-neutral-400">Consumed</span>
                    <span className="font-mono tabular-nums text-emerald-200">
                      {formatMon(imageTicker.consumed)} MON
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-neutral-400">Remaining</span>
                    <span className="font-mono tabular-nums text-neutral-100">
                      {imageSession ? `${formatMon(imageTicker.remaining)} MON` : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-neutral-400">Chain accrued</span>
                    <span className="font-mono tabular-nums text-neutral-100">
                      {imageChainAccrued === undefined ? "-" : `${formatMon(imageChainAccrued)} MON`}
                    </span>
                  </div>
                </div>

                <label className="grid gap-2 text-sm">
                  <span className="text-neutral-400">Prompt Image</span>
                  <textarea
                    value={imagePrompt}
                    disabled={imageStatus === "opening" || imageStatus === "generating" || imageStatus === "stopping"}
                    onChange={(event) => setImagePrompt(event.target.value)}
                    rows={4}
                    className="resize-none border border-white/10 bg-black/30 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-300 disabled:text-neutral-500"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!canOpenImage || imageStatus === "active"}
                    onClick={openImageSession}
                    className="inline-flex items-center justify-center gap-2 bg-emerald-300 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                  >
                    {imageStatus === "opening" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlugZap className="h-4 w-4" />
                    )}
                    Open Image Session
                  </button>
                  <button
                    type="button"
                    disabled={!imageSession?.active || imageStatus === "generating" || imageStatus === "stopping"}
                    onClick={runImage}
                    className="inline-flex items-center justify-center gap-2 bg-sky-300 px-4 py-3 text-sm font-semibold text-black hover:bg-sky-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                  >
                    {imageStatus === "generating" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                    Generate Image
                  </button>
                  <button
                    type="button"
                    disabled={!imageSession?.active || imageStatus === "opening" || imageStatus === "stopping"}
                    onClick={stopImageSession}
                    className="inline-flex items-center justify-center gap-2 border border-white/15 px-4 py-3 text-sm text-neutral-200 hover:border-white/30 hover:bg-white/5 disabled:cursor-not-allowed disabled:text-neutral-600"
                  >
                    {imageStatus === "stopping" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    Stop Image
                  </button>
                </div>

                <div className="space-y-2 text-xs text-neutral-500">
                  {imageProvider ? (
                    <p>
                      Image provider:{" "}
                      <span className="font-mono text-neutral-300">{imageProvider}</span>
                      {imageProvider === "mock" ? " - mock output, real economic session." : null}
                    </p>
                  ) : null}
                  {imageSettlement ? (
                    <p>
                      Settlement: <span className="font-mono text-neutral-300">{imageSettlement}</span>
                    </p>
                  ) : null}
                  {imageExplorerTx ? (
                    <p>
                      Open tx:{" "}
                      <a className="text-emerald-200 hover:underline" href={imageExplorerTx} target="_blank" rel="noreferrer">
                        {imageOpenHash}
                      </a>
                    </p>
                  ) : null}
                  {imageStopExplorerTx ? (
                    <p>
                      Auto-settle tx:{" "}
                      <a className="text-emerald-200 hover:underline" href={imageStopExplorerTx} target="_blank" rel="noreferrer">
                        {imageStopHash}
                      </a>
                    </p>
                  ) : null}
                  {imageError ? <p className="text-red-300">{imageError}</p> : null}
                </div>
              </div>

              <div className="flex min-h-[360px] items-center justify-center border border-white/10 bg-black/30 p-4">
                {imageStatus === "generating" ? (
                  <div className="flex flex-col items-center gap-3 text-sm text-neutral-400">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
                    Image job running while MON accrues.
                  </div>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Generated Stream poster"
                    className="max-h-[560px] w-full object-contain"
                  />
                ) : (
                  <span className="text-sm text-neutral-500">Generated poster will render here.</span>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function buildAuthorizationMessage(sessionId: bigint | number | string, nonce: string, issued: string) {
  return [
    "Stream session authorization",
    `sessionId: ${sessionId.toString()}`,
    `nonce: ${nonce}`,
    `issued: ${issued}`,
  ].join("\n");
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      blocks.push(<hr key={index} className="border-white/10" />);
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2]);
      const className = level === 1
        ? "text-lg font-semibold text-white"
        : level === 2
          ? "text-base font-semibold text-white"
          : "text-sm font-semibold text-neutral-100";

      blocks.push(
        <div key={index} className={className}>
          {text}
        </div>,
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(
          <li key={index} className="pl-1">
            {renderInline(lines[index].trim().replace(/^[-*]\s+/, ""))}
          </li>,
        );
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`} className="list-disc space-y-1 pl-5">
          {items}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(
          <li key={index} className="pl-1">
            {renderInline(lines[index].trim().replace(/^\d+\.\s+/, ""))}
          </li>,
        );
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index].trim()) &&
      !/^[-*]\s+/.test(lines[index].trim()) &&
      !/^\d+\.\s+/.test(lines[index].trim()) &&
      !/^-{3,}$/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    blocks.push(
      <p key={`p-${index}`} className="text-neutral-100">
        {renderInline(paragraph.join(" "))}
      </p>,
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}

type SseHandlers = {
  token(data: Record<string, unknown>): void;
  complete(data: Record<string, unknown>): void;
  terminated(data: Record<string, unknown>): void;
  error(data: Record<string, unknown>): void;
};

async function readSse(body: ReadableStream<Uint8Array>, handlers: SseHandlers) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      const event = frame
        .split("\n")
        .find((line) => line.startsWith("event: "))
        ?.slice(7);
      const dataLine = frame
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!event || !dataLine) {
        continue;
      }

      const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
      if (event === "token" || event === "complete" || event === "terminated" || event === "error") {
        handlers[event](data);
      }
    }
  }
}
