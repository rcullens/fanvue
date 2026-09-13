import { NextRequest, NextResponse } from "next/server";
import { getVideoJob } from "@/lib/video/jobs";
import { mediaFileUrl } from "@/lib/video/paths";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const job = await getVideoJob(params.id);
  if (!job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    job,
    videoUrl: job.videoPath ? mediaFileUrl(job.videoPath) : null,
    audioUrl: job.audioPath ? mediaFileUrl(job.audioPath) : null,
  });
}
