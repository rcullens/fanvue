import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { resolveMediaPath } from "@/lib/video/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};

export async function GET(req: NextRequest) {
  try {
    const rel = req.nextUrl.searchParams.get("path");
    if (!rel) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }
    const abs = resolveMediaPath(rel);
    const data = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /escape|sandbox/i.test(message)
      ? 403
      : /ENOENT|no such/i.test(message)
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
