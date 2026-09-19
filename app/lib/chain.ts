import { defineChain, type Address } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Monad",
    symbol: "MON",
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "MonadScan",
      url: "https://testnet.monadscan.com",
    },
  },
  testnet: true,
});

// Contract deployed on Monad Testnet at block 63820620
export const STREAM_CONTRACT_ADDRESS: Address = (
  process.env.NEXT_PUBLIC_STREAM_CONTRACT || "0x3e515c11B9B7A5E1398B614FbFe87A8570c95882"
) as Address;

export const STREAM_SESSION_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "_treasury", type: "address", internalType: "address" },
      { name: "_settler", type: "address", internalType: "address" }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "accrued",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isAuthorized",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "payer", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "nextSessionId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "openSession",
    inputs: [
      { name: "service", type: "bytes32", internalType: "bytes32" },
      { name: "ratePerSecond", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "remaining",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "sessions",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "payer", type: "address", internalType: "address" },
      { name: "service", type: "bytes32", internalType: "bytes32" },
      { name: "ratePerSecond", type: "uint256", internalType: "uint256" },
      { name: "maxBudget", type: "uint256", internalType: "uint256" },
      { name: "startTime", type: "uint64", internalType: "uint64" },
      { name: "lastCheckpoint", type: "uint64", internalType: "uint64" },
      { name: "settledAmount", type: "uint256", internalType: "uint256" },
      { name: "active", type: "bool", internalType: "bool" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "settler",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "stopSession",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "treasury",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "SessionOpened",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "payer", type: "address", indexed: true, internalType: "address" },
      { name: "service", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "ratePerSecond", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "maxBudget", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "startTime", type: "uint64", indexed: false, internalType: "uint64" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "SessionSettled",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "payer", type: "address", indexed: true, internalType: "address" },
      { name: "settledAmount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "refundedAmount", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  { type: "error", name: "InsufficientDeposit", inputs: [] },
  { type: "error", name: "InvalidRate", inputs: [] },
  { type: "error", name: "SessionNotActive", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "Unauthorized", inputs: [] }
] as const;
