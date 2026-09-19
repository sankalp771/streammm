"use client";

import { Copy, PlugZap, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";

function shorten(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatMon(value: bigint | undefined) {
  if (value === undefined) {
    return "0.0000";
  }

  return Number(formatEther(value)).toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 4,
  });
}

export default function Home() {
  const [copied, setCopied] = useState(false);
  const { address, chain, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance, isLoading: balanceLoading } = useBalance({ address });
  const injectedConnector = useMemo(
    () => connectors.find((connector) => connector.type === "injected") ?? connectors[0],
    [connectors],
  );

  const onCopy = async () => {
    if (!address) {
      return;
    }

    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

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

        <section className="grid flex-1 place-items-center py-12">
          <div className="w-full max-w-xl border border-white/10 bg-neutral-950 p-6 shadow-2xl shadow-black/30">
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
                        {balanceLoading ? "loading..." : `${formatMon(balance?.value)} MON`}
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
                      {copied ? "Address copied" : "Ready for the P3 session start flow"}
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
        </section>
      </div>
    </main>
  );
}
