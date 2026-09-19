import { NextRequest, NextResponse } from "next/server";
import { AuthError, authorize, watchAuthorization, type RevocationReason } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 401 });
  }

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: "bad_request" }, { status: 401 });
  }

  try {
    const auth = await authorize(
      parsed.value.sessionId,
      parsed.value.signature,
      parsed.value.nonce,
      "CLAUDE",
      parsed.value.issued,
    );

    const controller = new AbortController();
    let revoked: RevocationReason | undefined;
    const stopWatching = watchAuthorization(
      auth.sessionId,
      (reason) => {
        revoked = reason;
        controller.abort(reason);
      },
      { payer: auth.payer, service: "CLAUDE" },
    );

    try {
      console.info("PROVIDER_CALL_STARTED claude");
      return NextResponse.json({
        ok: true,
        service: "CLAUDE",
        sessionId: auth.sessionId.toString(),
        provider: "placeholder",
        message: "Claude provider call path authorized; streaming lands in P4.",
      });
    } finally {
      stopWatching();
      if (revoked) {
        console.info(`AUTHORIZATION_REVOKED ${revoked}`);
      }
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "chain_read_failed" }, { status: 403 });
  }
}

function parseBody(body: unknown):
  | { ok: true; value: { sessionId: string; signature: `0x${string}`; nonce: string; issued?: string; prompt: string } }
  | { ok: false } {
  if (!body || typeof body !== "object") {
    return { ok: false };
  }

  const value = body as Record<string, unknown>;
  if (
    typeof value.sessionId !== "string" &&
    typeof value.sessionId !== "number" &&
    typeof value.sessionId !== "bigint"
  ) {
    return { ok: false };
  }
  if (typeof value.signature !== "string" || !value.signature.startsWith("0x")) {
    return { ok: false };
  }
  if (typeof value.nonce !== "string") {
    return { ok: false };
  }
  if (typeof value.prompt !== "string" || value.prompt.trim().length === 0) {
    return { ok: false };
  }
  if (value.issued !== undefined && typeof value.issued !== "string") {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      sessionId: value.sessionId.toString(),
      signature: value.signature as `0x${string}`,
      nonce: value.nonce,
      issued: value.issued,
      prompt: value.prompt,
    },
  };
}
