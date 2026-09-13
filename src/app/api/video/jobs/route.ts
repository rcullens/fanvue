import { NextRequest, NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { createAndProcessJob, listVideoJobs } from "@/lib/video/jobs";
import { FREE_VOICES, detectTtsEngine } from "@/lib/video/tts";
import { providerBadge, resolveProvider } from "@/lib/video/providers";
import { LOCAL_RENDER_LABEL } from "@/lib/video/render";
import { mediaFileUrl } from "@/lib/video/paths";
import { assertMediaWriteAccess } from "@/lib/video/fanvue-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Sync ffmpeg+tts can take a bit */
export const maxDuration = 120;

export async function GET() {
  const data = await readStore();
  const jobs = await listVideoJobs();
  const ttsEngine = await detectTtsEngine();
  const provider = resolveProvider(null);
  const access = await assertMediaWriteAccess();
  return NextResponse.json({
    jobs,
    voices: FREE_VOICES,
    ttsEngine,
    defaultProvider: provider,
    providerBadge: providerBadge(provider),
    renderLabel: LOCAL_RENDER_LABEL,
    activePersonaId: data.settings.activePersonaId,
    personas: data.personas.map((p) => ({
      id: p.id,
      name: p.name,
      portraitPath: p.portraitPath,
      portraitUrl: p.portraitPath ? mediaFileUrl(p.portraitPath) : null,
      voiceId: p.voiceId,
      isActive: p.isActive,
      ppvCatalogCount: p.ppvCatalog?.length || 0,
    })),
    fanvueUpload: access.ok
      ? { ready: true }
      : { ready: false, error: access.error, checklist: access.checklist },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const personaId = String(body.personaId || "");
    const script = String(body.script || "");
    if (!personaId) {
      return NextResponse.json({ error: "personaId required" }, { status: 400 });
    }
    const job = await createAndProcessJob({
      personaId,
      script,
      provider: body.provider,
      voiceId: body.voiceId,
    });
    return NextResponse.json(
      {
        job,
        videoUrl: job.videoPath ? mediaFileUrl(job.videoPath) : null,
        audioUrl: job.audioPath ? mediaFileUrl(job.audioPath) : null,
      },
      { status: job.status === "failed" ? 500 : 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
