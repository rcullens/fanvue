import { NextRequest, NextResponse } from "next/server";
import { processInboundMessage } from "@/lib/automation/worker";
import { updateStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Stub webhook for Fanvue creator.message.* events.
 * TODO: verify Standard Webhooks signature (FANVUE_WEBHOOK_SECRET) before trusting body.
 * Prefer webhooks over polling — cheaper + fewer API calls.
 */
export async function POST(req: NextRequest) {
  // TODO(security): implement Standard Webhooks HMAC verification
  // using header webhook-id / webhook-timestamp / webhook-signature
  // and FANVUE_WEBHOOK_SECRET from Creator Tools. Reject unsigned in production.
  const unverified = process.env.FANVUE_WEBHOOK_SECRET
    ? "signature verification TODO — secret present but not verified yet"
    : "no FANVUE_WEBHOOK_SECRET — accepting unsigned stub (dev only)";

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await updateStore((s) => {
    s.automationLog.unshift({
      id: crypto.randomUUID(),
      kind: "webhook",
      summary: `Webhook received (${unverified})`,
      detail: JSON.stringify(body).slice(0, 800),
      createdAt: new Date().toISOString(),
    });
    s.automationLog = s.automationLog.slice(0, 300);
  });

  // Best-effort extract from Fanvue-style payloads
  const data = (body.data || body) as Record<string, unknown>;
  const obj = (data.object || data) as Record<string, unknown>;
  const fanUserUuid = String(
    obj.senderUuid ||
      obj.userUuid ||
      (obj.sender as { uuid?: string } | undefined)?.uuid ||
      body.fanUserUuid ||
      ""
  );
  const text = String(
    obj.text || obj.message || body.text || body.inboundText || ""
  ).trim();

  if (!fanUserUuid || !text) {
    return NextResponse.json({
      ok: true,
      queued: false,
      note: "Event logged; could not extract fanUserUuid+text. Wire payload mapping when enabling live webhooks.",
      verification: unverified,
    });
  }

  try {
    const { queueItem, autoSent } = await processInboundMessage({
      fanUserUuid,
      inboundText: text,
      fanHandle: String(
        (obj.sender as { handle?: string } | undefined)?.handle ||
          body.fanHandle ||
          ""
      ) || undefined,
      preferLive: true,
      source: "webhook",
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      autoSent,
      queueId: queueItem.id,
      status: queueItem.status,
      verification: unverified,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Webhook processing failed",
        verification: unverified,
      },
      { status: 500 }
    );
  }
}
