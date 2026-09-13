import { NextRequest, NextResponse } from "next/server";
import { addJobToPpv } from "@/lib/video/jobs";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const result = await addJobToPpv({
      jobId: params.id,
      title: String(body.title || ""),
      priceCents: Number(body.priceCents),
      description: body.description ? String(body.description) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
