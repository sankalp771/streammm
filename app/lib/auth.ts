import {
  isAddressEqual,
  keccak256,
  recoverMessageAddress,
  stringToBytes,
  type Address,
  type Hex,
} from "viem";
import { publicClient, STREAM_CONTRACT_ADDRESS, STREAM_SESSION_ABI } from "./chain";

export type StreamService = "CLAUDE" | "IMAGE";

export type Authorization = {
  sessionId: bigint;
  payer: Address;
  service: StreamService;
  ratePerSecond: bigint;
  maxBudget: bigint;
  startTime: bigint;
};

export type RevocationReason =
  | "session_inactive"
  | "budget_exhausted"
  | "service_mismatch"
  | "signer_mismatch"
  | "chain_read_failed";

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code:
      | "bad_request"
      | "invalid_signature"
      | "replay"
      | "signer_mismatch"
      | "session_inactive"
      | "budget_exhausted"
      | "service_mismatch"
      | "chain_read_failed",
  ) {
    super(code);
  }
}

type RawSession = readonly [
  Address,
  Hex,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
];

const usedNonces = new Set<string>();

export function buildAuthorizationMessage(sessionId: bigint | number | string, nonce: string, issued?: string) {
  const lines = [
    "Stream session authorization",
    `sessionId: ${sessionId.toString()}`,
    `nonce: ${nonce}`,
  ];

  if (issued) {
    lines.push(`issued: ${issued}`);
  }

  return lines.join("\n");
}

export function serviceHash(service: StreamService): Hex {
  return keccak256(stringToBytes(service));
}

export async function authorize(
  sessionId: bigint | number | string,
  signature: Hex,
  nonce: string,
  service: StreamService,
  issued?: string,
): Promise<Authorization> {
  const id = parseSessionId(sessionId);
  assertNonce(nonce);

  const message = buildAuthorizationMessage(id, nonce, issued);
  const signer = await recoverSigner(message, signature);
  const session = await readSession(id);
  const accrued = await readAccrued(id);
  const nonceKey = `${id.toString()}:${signer.toLowerCase()}:${nonce}`;

  if (usedNonces.has(nonceKey)) {
    throw new AuthError(401, "replay");
  }

  if (!isAddressEqual(signer, session[0])) {
    throw new AuthError(401, "signer_mismatch");
  }

  if (!session[7]) {
    throw new AuthError(403, "session_inactive");
  }

  if (accrued >= session[3]) {
    throw new AuthError(403, "budget_exhausted");
  }

  if (session[1].toLowerCase() !== serviceHash(service).toLowerCase()) {
    throw new AuthError(403, "service_mismatch");
  }

  usedNonces.add(nonceKey);

  return {
    sessionId: id,
    payer: session[0],
    service,
    ratePerSecond: session[2],
    maxBudget: session[3],
    startTime: session[4],
  };
}

export function watchAuthorization(
  sessionId: bigint | number | string,
  onRevoked: (reason: RevocationReason) => void,
  options: { payer?: Address; service?: StreamService; intervalMs?: number } = {},
) {
  let stopped = false;
  const id = parseSessionId(sessionId);
  const intervalMs = options.intervalMs ?? 1000;

  const check = async () => {
    try {
      const session = await readSession(id);
      const accrued = await readAccrued(id);

      if (!session[7]) {
        revoke("session_inactive");
        return;
      }

      if (accrued >= session[3]) {
        revoke("budget_exhausted");
        return;
      }

      if (options.payer && !isAddressEqual(options.payer, session[0])) {
        revoke("signer_mismatch");
        return;
      }

      if (options.service && session[1].toLowerCase() !== serviceHash(options.service).toLowerCase()) {
        revoke("service_mismatch");
      }
    } catch {
      revoke("chain_read_failed");
    }
  };

  const timer = setInterval(check, intervalMs);
  void check();

  return () => {
    stopped = true;
    clearInterval(timer);
  };

  function revoke(reason: RevocationReason) {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(timer);
    onRevoked(reason);
  }
}

async function recoverSigner(message: string, signature: Hex): Promise<Address> {
  try {
    return await recoverMessageAddress({ message, signature });
  } catch {
    throw new AuthError(401, "invalid_signature");
  }
}

async function readSession(sessionId: bigint): Promise<RawSession> {
  try {
    return await publicClient.readContract({
      address: STREAM_CONTRACT_ADDRESS,
      abi: STREAM_SESSION_ABI,
      functionName: "sessions",
      args: [sessionId],
    });
  } catch {
    throw new AuthError(403, "chain_read_failed");
  }
}

async function readAccrued(sessionId: bigint): Promise<bigint> {
  try {
    return await publicClient.readContract({
      address: STREAM_CONTRACT_ADDRESS,
      abi: STREAM_SESSION_ABI,
      functionName: "accrued",
      args: [sessionId],
    });
  } catch {
    throw new AuthError(403, "chain_read_failed");
  }
}

function parseSessionId(sessionId: bigint | number | string): bigint {
  try {
    const id = BigInt(sessionId);
    if (id < BigInt(0)) {
      throw new Error("negative");
    }
    return id;
  } catch {
    throw new AuthError(401, "bad_request");
  }
}

function assertNonce(nonce: string) {
  if (typeof nonce !== "string" || nonce.length < 8 || nonce.length > 132) {
    throw new AuthError(401, "bad_request");
  }
}
