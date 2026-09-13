import { NextRequest, NextResponse } from "next/server";
import {
  processInboundMessage,
  pullUnreadAndDraft,
} from "@/lib/automation/worker";

export const dynamic = "force-dynamic";

/**
 * POST body:
 * - { action: "simulate", text?, fanHandle? } — $0 mock fan message
 * - { action: "pull_unread", limit? } — live unread → draft (needs OAuth)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "simulate");

  try {
    if (action === "simulate") {
      const fanUserUuid =
        String(body.fanUserUuid || "") ||
        `mock-fan-${crypto.randomUUID().slice(0, 8)}`;
      const text =
        String(body.text || "").trim() ||
        "hey :) how are you doing tonight?";
      const { queueItem, autoSent } = await processInboundMessage({
        fanUserUuid,
        inboundText: text,
        fanHandle: String(body.fanHandle || "mock_fan"),
        fanDisplayName: String(body.fanDisplayName || "Mock Fan"),
        personaId: body.personaId,
        forceMock: true,
        preferLive: false,
        source: "simulate",
      });
      return NextResponse.json({
        ok: true,
        mode: "mock",
        autoSent,
        queueItem,
        note: "Simulated with local mock engine ($0). No Fanvue API calls.",
      });
    }

    if (action === "pull_unread") {
      const result = await pullUnreadAndDraft({
        personaId: body.personaId,
        limit: Number(body.limit) || 10,
      });

      if (result.error && result.processed === 0 && !result.empty) {
        const status =
          /auth|connect|expired|401/i.test(result.error)
            ? 401
            : /rate limit|429/i.test(result.error)
              ? 429
              : 400;
        return NextResponse.json(
          {
            ok: false,
            error: result.error,
            items: [],
            processed: 0,
          },
          { status }
        );
      }

      return NextResponse.json({
        ok: true,
        mode: "live",
        processed: result.processed,
        items: result.items,
        empty: Boolean(result.empty) || result.processed === 0,
        skipped: result.skipped ?? 0,
        message:
          result.processed === 0
            ? "No unread chats to draft (inbox clear, or last messages were yours)."
            : `Drafted ${result.processed} unread chat(s) for approval.`,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Run failed" },
      { status: 500 }
    );
  }
}
