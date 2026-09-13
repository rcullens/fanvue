/**
 * Pluggable video render providers.
 * - local-ffmpeg (default, $0)
 * - external-cli — VIDEO_RENDER_CMD template with {image} {audio} {out}
 * - replicate — stub documented behind env key (not required)
 */
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { renderLocalFfmpeg, LOCAL_RENDER_LABEL } from "./render";
import { VIDEOS_DIR, ensureMediaDirs, toMediaRel } from "./paths";

export type VideoProviderId = "local-ffmpeg" | "external-cli" | "replicate";

export type RenderProviderResult = {
  videoPath: string;
  videoRel: string;
  provider: VideoProviderId;
  label: string;
};

export function resolveProvider(requested?: string | null): VideoProviderId {
  const envDefault = (process.env.VIDEO_PROVIDER || "local-ffmpeg").toLowerCase();
  const id = (requested || envDefault || "local-ffmpeg").toLowerCase();
  if (id === "external-cli" || id === "external") return "external-cli";
  if (id === "replicate") return "replicate";
  return "local-ffmpeg";
}

export function providerBadge(id: VideoProviderId): string {
  switch (id) {
    case "local-ffmpeg":
      return "local-ffmpeg · $0 preview";
    case "external-cli":
      return "external-cli · VIDEO_RENDER_CMD";
    case "replicate":
      return "replicate · stub";
    default:
      return id;
  }
}

function runShell(command: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], { env: process.env });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 127, stderr: String(err) });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

/**
 * VIDEO_RENDER_CMD example (GPU box with SadTalker):
 *   python inference.py --source_image {image} --driven_audio {audio} --result_dir /tmp && cp /tmp/.../result.mp4 {out}
 * Placeholders: {image} {audio} {out}
 */
export async function renderExternalCli(opts: {
  imagePath: string;
  audioPath: string;
  jobId: string;
}): Promise<RenderProviderResult> {
  const tmpl = process.env.VIDEO_RENDER_CMD;
  if (!tmpl || !tmpl.trim()) {
    throw new Error(
      "VIDEO_RENDER_CMD is not set. Point it at SadTalker/LivePortrait on a GPU machine, e.g. " +
        "'python inference.py --source_image {image} --driven_audio {audio} --result_dir /tmp && cp ... {out}'"
    );
  }
  await ensureMediaDirs();
  const outMp4 = path.join(VIDEOS_DIR, `${opts.jobId}.mp4`);
  // Substitute placeholders; quote paths for shell safety
  const q = (s: string) => `'${s.replace(/'/g, `'\''`)}'`;
  const cmd = tmpl
    .split("{image}")
    .join(q(opts.imagePath))
    .split("{audio}")
    .join(q(opts.audioPath))
    .split("{out}")
    .join(q(outMp4));

  const r = await runShell(cmd);
  if (r.code !== 0) {
    throw new Error(`external-cli render failed (exit ${r.code}): ${r.stderr.slice(-600)}`);
  }
  await fs.access(outMp4);
  return {
    videoPath: outMp4,
    videoRel: toMediaRel(outMp4),
    provider: "external-cli",
    label: "External CLI render (VIDEO_RENDER_CMD — e.g. SadTalker on GPU).",
  };
}

export async function renderReplicateStub(): Promise<never> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error(
      "replicate provider is a stub. Set REPLICATE_API_TOKEN and implement a talking-head model later. " +
        "Default remains local-ffmpeg ($0)."
    );
  }
  throw new Error(
    "replicate provider not implemented yet — use local-ffmpeg or external-cli. Documented for later."
  );
}

export async function renderWithProvider(opts: {
  provider?: string | null;
  imagePath: string;
  audioPath: string;
  script: string;
  jobId: string;
}): Promise<RenderProviderResult> {
  const id = resolveProvider(opts.provider);
  if (id === "external-cli") {
    return renderExternalCli({
      imagePath: opts.imagePath,
      audioPath: opts.audioPath,
      jobId: opts.jobId,
    });
  }
  if (id === "replicate") {
    await renderReplicateStub();
  }
  const local = await renderLocalFfmpeg({
    imagePath: opts.imagePath,
    audioPath: opts.audioPath,
    script: opts.script,
    jobId: opts.jobId,
  });
  return {
    ...local,
    provider: "local-ffmpeg",
    label: LOCAL_RENDER_LABEL,
  };
}

export { LOCAL_RENDER_LABEL };
