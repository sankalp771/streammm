import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, publicClient, STREAM_CONTRACT_ADDRESS, STREAM_SESSION_ABI } from "./chain";

export type SettlementResult = {
  accrued: bigint;
  refunded: bigint;
  alreadySettled: boolean;
  hash?: Hex;
};

export async function settleSession(sessionId: bigint): Promise<SettlementResult> {
  const before = await readSettlementState(sessionId);
  if (!before.active) {
    return {
      accrued: before.accrued,
      refunded: before.maxBudget - before.accrued,
      alreadySettled: true,
    };
  }

  const privateKey = process.env.SETTLER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("settler_private_key_missing");
  }

  const normalizedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(normalizedPrivateKey as Hex);
  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz"),
  });

  try {
    const hash = await walletClient.writeContract({
      address: STREAM_CONTRACT_ADDRESS,
      abi: STREAM_SESSION_ABI,
      functionName: "stopSession",
      args: [sessionId],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    const after = await readSettlementState(sessionId);
    return {
      accrued: after.accrued,
      refunded: after.maxBudget - after.accrued,
      alreadySettled: false,
      hash,
    };
  } catch (error) {
    if (!isSessionNotActive(error)) {
      throw error;
    }

    const after = await readSettlementState(sessionId);
    return {
      accrued: after.accrued,
      refunded: after.maxBudget - after.accrued,
      alreadySettled: true,
    };
  }
}

async function readSettlementState(sessionId: bigint) {
  const [session, accrued] = await Promise.all([
    publicClient.readContract({
      address: STREAM_CONTRACT_ADDRESS,
      abi: STREAM_SESSION_ABI,
      functionName: "sessions",
      args: [sessionId],
    }),
    publicClient.readContract({
      address: STREAM_CONTRACT_ADDRESS,
      abi: STREAM_SESSION_ABI,
      functionName: "accrued",
      args: [sessionId],
    }),
  ]);

  return {
    active: session[7],
    accrued,
    maxBudget: session[3],
  };
}

function isSessionNotActive(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("SessionNotActive");
}
