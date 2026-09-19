"use client";

import { http, createConfig } from "wagmi";
import { injected } from "@wagmi/core";
import { monadTestnet } from "./chain";

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz"),
  },
  ssr: true,
});
