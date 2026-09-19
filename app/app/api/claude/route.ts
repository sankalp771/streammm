import { NextRequest, NextResponse } from "next/server";
import { AuthError, authorize, watchAuthorization, type RevocationReason } from "@/lib/auth";
import { settleSession } from "@/lib/settle";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const stream = new ReadableStream({
      async start(streamController) {
        const encoder = new TextEncoder();

        const send = (event: string, data: unknown) => {
          streamController.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          console.info("PROVIDER_CALL_STARTED claude");
          send("authorized", { sessionId: auth.sessionId.toString() });

          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY || "",
            },
            body: JSON.stringify({
              model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
              max_tokens: 1200,
              stream: true,
              messages: [{ role: "user", content: parsed.value.prompt }],
            }),
          });

          if (!response.ok || !response.body) {
            const detail = await response.text();
            send("error", { error: "provider_error", detail, ...(await terminalSettlement(auth.sessionId)) });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() || "";

            for (const frame of frames) {
              const dataLine = frame
                .split("\n")
                .find((line) => line.startsWith("data: "));

              if (!dataLine) {
                continue;
              }

              const payload = JSON.parse(dataLine.slice(6)) as AnthropicStreamEvent;
              if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta") {
                send("token", { text: payload.delta.text });
              }
            }
          }

          send("complete", { sessionId: auth.sessionId.toString() });
        } catch (error) {
          if (controller.signal.aborted) {
            const settlement = revoked === "budget_exhausted"
              ? await terminalSettlement(auth.sessionId)
              : {};
            send("terminated", { reason: revoked || "aborted", ...settlement });
            return;
          }

          send("error", {
            error: error instanceof Error ? error.message : "claude_stream_failed",
            ...(await terminalSettlement(auth.sessionId)),
          });
        } finally {
          stopWatching();
          if (revoked) {
            console.info(`AUTHORIZATION_REVOKED ${revoked}`);
          }
          streamController.close();
        }
      },
      cancel() {
        controller.abort("client_disconnected");
        stopWatching();
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache, no-transform",
        "content-type": "text/event-stream; charset=utf-8",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "chain_read_failed" }, { status: 403 });
  }
}

async function terminalSettlement(sessionId: bigint) {
  try {
    const settlement = await settleSession(sessionId);
    return {
      settlement: settlement.alreadySettled ? "already_settled" : "settled",
      settledAmount: settlement.accrued.toString(),
      refundedAmount: settlement.refunded.toString(),
      stopHash: settlement.hash,
    };
  } catch (error) {
    return { settlementError: error instanceof Error ? error.message : "settlement_failed" };
  }
}

type AnthropicStreamEvent = {
  type: string;
  delta?: {
    type?: string;
    text?: string;
  };
};

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
