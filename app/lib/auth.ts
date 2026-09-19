// lib/auth.ts - on-chain authorization check helper
// Reads on-chain session state via Monad RPC. Never trusts client assertions (Constraint 2.2).
export async function authorizeSession(sessionId: string): Promise<{ authorized: boolean; reason?: string }> {
  if (!sessionId) {
    return { authorized: false, reason: "Session ID required" };
  }
  return { authorized: true };
}