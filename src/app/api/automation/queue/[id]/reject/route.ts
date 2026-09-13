import { NextRequest, NextResponse } from "next/server";
import { rejectQueueItem } from "@/lib/automation/worker";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const item = await rejectQueueItem(params.id);
    return NextResponse.json({ ok: true, queueItem: item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reject failed" },
      { status: 400 }
    );
  }
}
