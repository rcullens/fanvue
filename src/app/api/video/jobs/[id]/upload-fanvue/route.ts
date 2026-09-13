import { NextRequest, NextResponse } from "next/server";
import { uploadVideoJobToFanvue } from "@/lib/video/fanvue-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await uploadVideoJobToFanvue(params.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
