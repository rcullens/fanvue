import { NextRequest, NextResponse } from "next/server";
import { approveQueueItem } from "@/lib/automation/worker";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    const item = await approveQueueItem(params.id, body.text);
    return NextResponse.json({
      ok: item.status === "sent",
      remote: item.mode === "live" && item.status === "sent",
      queueItem: item,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approve failed" },
      { status: 400 }
    );
  }
}
