/**
 * Video job queue in JSON store — sync process in API for v1.
 */
import { promises as fs } from "fs";
import path from "path";
import {
  VideoJob,
  VideoJobStatus,
  MIN_PPV_CENTS,
} from "../types";
import { readStore, updateStore } from "../store";
import { synthesizeSpeech } from "./tts";
import { renderWithProvider, resolveProvider, providerBadge } from "./providers";
import {
  ensureMediaDirs,
  resolveMediaPath,
  PORTRAITS_DIR,
} from "./paths";

export function listJobsFrom(data: { videoJobs?: VideoJob[] }): VideoJob[] {
  return Array.isArray(data.videoJobs) ? data.videoJobs : [];
}

export async function listVideoJobs(): Promise<VideoJob[]> {
  const data = await readStore();
  return listJobsFrom(data).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  );
}

export async function getVideoJob(id: string): Promise<VideoJob | undefined> {
  const jobs = await listVideoJobs();
  return jobs.find((j) => j.id === id);
}

export async function createAndProcessJob(input: {
  personaId: string;
  script: string;
  provider?: string | null;
  voiceId?: string | null;
}): Promise<VideoJob> {
  await ensureMediaDirs();
  const script = (input.script || "").trim();
  if (!script) {
    throw new Error("script is required");
  }
  if (script.length > 8000) {
    throw new Error("script too long (max 8000 chars)");
  }

  const provider = resolveProvider(input.provider);
  let job: VideoJob = {
    id: crypto.randomUUID(),
    personaId: input.personaId,
    script,
    status: "pending",
    provider,
    voiceId: input.voiceId || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await updateStore((store) => {
    if (!store.videoJobs) store.videoJobs = [];
    const persona = store.personas.find((p) => p.id === input.personaId);
    if (!persona) {
      throw new Error("persona not found");
    }
    if (!persona.portraitPath) {
      throw new Error(
        "persona has no portraitPath — upload a portrait first (POST /api/video/portrait)"
      );
    }
    if (input.voiceId) {
      persona.voiceId = input.voiceId;
      persona.updatedAt = new Date().toISOString();
    }
    store.videoJobs.unshift(job);
  });

  // Sync process for v1
  job = await processJob(job.id);
  return job;
}

export async function processJob(jobId: string): Promise<VideoJob> {
  const bump = async (
    status: VideoJobStatus,
    patch: Partial<VideoJob> = {}
  ) => {
    const data = await updateStore((store) => {
      if (!store.videoJobs) store.videoJobs = [];
      const idx = store.videoJobs.findIndex((j) => j.id === jobId);
      if (idx < 0) throw new Error("job not found");
      store.videoJobs[idx] = {
        ...store.videoJobs[idx],
        ...patch,
        status,
        updatedAt: new Date().toISOString(),
      };
    });
    return data.videoJobs!.find((j) => j.id === jobId)!;
  };

  let job = await bump("running");
  try {
    const data = await readStore();
    const persona = data.personas.find((p) => p.id === job.personaId);
    if (!persona?.portraitPath) {
      throw new Error("persona portrait missing");
    }
    const imagePath = resolveMediaPath(persona.portraitPath);
    await fs.access(imagePath);

    const voiceId = job.voiceId || persona.voiceId;
    const tts = await synthesizeSpeech({
      text: job.script,
      voiceId,
      jobId: job.id,
    });
    job = await bump("running", {
      audioPath: tts.audioRel,
      voiceId: tts.voiceId,
      ttsEngine: tts.engine,
    });

    const rendered = await renderWithProvider({
      provider: job.provider,
      imagePath,
      audioPath: tts.audioPath,
      script: job.script,
      jobId: job.id,
    });

    job = await bump("done", {
      videoPath: rendered.videoRel,
      provider: rendered.provider,
      providerLabel: rendered.label,
      error: undefined,
    });
    return job;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return bump("failed", { error: message });
  }
}

export async function addJobToPpv(opts: {
  jobId: string;
  title: string;
  priceCents: number;
  description?: string;
}): Promise<{ job: VideoJob; catalogItemId: string }> {
  const title = opts.title.trim();
  if (!title) throw new Error("title is required");
  const priceCents = Math.round(Number(opts.priceCents));
  if (!Number.isFinite(priceCents) || priceCents < MIN_PPV_CENTS) {
    throw new Error(`priceCents must be >= ${MIN_PPV_CENTS} (Fanvue chat PPV min $3)`);
  }

  let catalogItemId = "";
  const data = await updateStore((store) => {
    if (!store.videoJobs) store.videoJobs = [];
    const job = store.videoJobs.find((j) => j.id === opts.jobId);
    if (!job) throw new Error("job not found");
    if (job.status !== "done" || !job.videoPath) {
      throw new Error("job must be done with a videoPath before adding to PPV");
    }
    const persona = store.personas.find((p) => p.id === job.personaId);
    if (!persona) throw new Error("persona not found");
    catalogItemId = crypto.randomUUID();
    const mediaUuids = job.fanvueMediaUuid ? [job.fanvueMediaUuid] : [];
    persona.ppvCatalog = persona.ppvCatalog || [];
    persona.ppvCatalog.push({
      id: catalogItemId,
      title,
      description: opts.description || job.script.slice(0, 280),
      priceCents,
      mediaUuids,
      videoJobId: job.id,
      pitchHints: "video bot clip",
    });
    persona.updatedAt = new Date().toISOString();
    job.ppvCatalogItemId = catalogItemId;
    job.updatedAt = new Date().toISOString();
  });

  const job = data.videoJobs!.find((j) => j.id === opts.jobId)!;
  return { job, catalogItemId };
}

export async function savePortraitForPersona(opts: {
  personaId: string;
  bytes: Buffer;
  ext: string;
}): Promise<{ portraitPath: string; absPath: string }> {
  await ensureMediaDirs();
  const ext = opts.ext.replace(/^\./, "").toLowerCase() || "png";
  const allowed = new Set(["png", "jpg", "jpeg", "webp"]);
  if (!allowed.has(ext)) {
    throw new Error("portrait must be png, jpg, jpeg, or webp");
  }
  const filename = `${opts.personaId}-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
  const absPath = path.join(PORTRAITS_DIR, filename);
  await fs.writeFile(absPath, opts.bytes);
  const portraitPath = `portraits/${filename}`;

  await updateStore((store) => {
    const persona = store.personas.find((p) => p.id === opts.personaId);
    if (!persona) throw new Error("persona not found");
    persona.portraitPath = portraitPath;
    persona.updatedAt = new Date().toISOString();
  });

  return { portraitPath, absPath };
}

export { providerBadge, resolveProvider };
