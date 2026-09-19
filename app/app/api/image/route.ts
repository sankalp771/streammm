import { NextRequest, NextResponse } from "next/server";
import { AuthError, authorize, watchAuthorization, type RevocationReason } from "@/lib/auth";
import { getImageProvider } from "@/lib/providers/image";
import { settleSession } from "@/lib/settle";

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
      "IMAGE",
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
      { payer: auth.payer, service: "IMAGE" },
    );

    try {
      console.info("PROVIDER_CALL_STARTED image");
      const { name, provider } = getImageProvider();
      let result: { url: string };

      try {
        result = await provider.generate(parsed.value.prompt, undefined, controller.signal);
      } catch (error) {
        if (revoked) {
          return NextResponse.json({ error: revoked }, { status: 403 });
        }

        console.error("IMAGE_PROVIDER_FAILED", errorMessage(error));
        return NextResponse.json(
          {
            error: "image_provider_failed",
            detail: errorMessage(error),
            provider: name,
          },
          { status: 502 },
        );
      }

      try {
        const settlement = await settleSession(auth.sessionId);

        return NextResponse.json({
          ok: true,
          service: "IMAGE",
          sessionId: auth.sessionId.toString(),
          provider: name,
          url: result.url,
          settlement: settlement.alreadySettled ? "already_settled" : "settled",
          settledAmount: settlement.accrued.toString(),
          stopHash: settlement.hash,
        });
      } catch (error) {
        console.error("IMAGE_SETTLEMENT_FAILED", shortErrorMessage(error));
        return NextResponse.json(
          {
            error: "settlement_failed",
            detail: shortErrorMessage(error),
            service: "IMAGE",
            sessionId: auth.sessionId.toString(),
            provider: name,
            url: result.url,
          },
          { status: 502 },
        );
      }
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown_error";
}

function shortErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "unknown_error";
  }

  if (error.message.includes("SessionNotActive")) {
    return "session_not_active";
  }

  return error.message.split("\n")[0] || "unknown_error";
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
