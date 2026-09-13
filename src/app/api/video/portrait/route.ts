import { NextRequest, NextResponse } from "next/server";
import { savePortraitForPersona } from "@/lib/video/jobs";
import { mediaFileUrl } from "@/lib/video/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const personaId = String(form.get("personaId") || "");
    const file = form.get("file");
    if (!personaId) {
      return NextResponse.json({ error: "personaId required" }, { status: 400 });
    }
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const name = (file as File).name || "portrait.png";
    const ext = name.split(".").pop()?.toLowerCase() || "png";
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "portrait max 12MB" }, { status: 400 });
    }
    const saved = await savePortraitForPersona({
      personaId,
      bytes: buf,
      ext,
    });
    return NextResponse.json({
      portraitPath: saved.portraitPath,
      url: mediaFileUrl(saved.portraitPath),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
