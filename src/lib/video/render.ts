/**
 * Local mock talking-head: still portrait + Ken Burns zoom + audio + soft captions.
 * Honest: not neural lip-sync. Hook SadTalker/LivePortrait via VIDEO_RENDER_CMD.
 */
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import {
  TMP_DIR,
  VIDEOS_DIR,
  ensureMediaDirs,
  toMediaRel,
} from "./paths";

export type LocalRenderResult = {
  videoPath: string;
  videoRel: string;
  provider: "local-ffmpeg";
  label: string;
};

function run(
  cmd: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 127, stdout, stderr: String(err) });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function probeDurationSeconds(audioPath: string): Promise<number> {
  const r = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    audioPath,
  ]);
  const n = parseFloat((r.stdout || "").trim());
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ")
    .slice(0, 180);
}

function writeSrt(script: string, duration: number): string {
  const lines = script
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const chunks =
    lines.length > 0
      ? lines
      : script.match(/.{1,80}(\s|$)/g)?.map((s) => s.trim()) || [script];
  const slice = chunks.slice(0, 12);
  const each = duration / Math.max(1, slice.length);
  const pad = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };
  let out = "";
  slice.forEach((text, i) => {
    const start = i * each;
    const end = Math.min(duration, (i + 1) * each);
    out += `${i + 1}\n${pad(start)} --> ${pad(end)}\n${text.slice(0, 120)}\n\n`;
  });
  return out;
}

export const LOCAL_RENDER_LABEL =
  "Local preview render (not neural lip-sync). Hook SadTalker/LivePortrait for real talking heads.";

/**
 * Still image + subtle Ken Burns + audio + optional soft subtitle of script.
 */
export async function renderLocalFfmpeg(opts: {
  imagePath: string;
  audioPath: string;
  script: string;
  jobId: string;
}): Promise<LocalRenderResult> {
  await ensureMediaDirs();
  const duration = await probeDurationSeconds(opts.audioPath);
  const frames = Math.max(25, Math.ceil(duration * 25));
  const outMp4 = path.join(VIDEOS_DIR, `${opts.jobId}.mp4`);
  const srtPath = path.join(TMP_DIR, `${opts.jobId}.srt`);
  await fs.writeFile(srtPath, writeSrt(opts.script, duration), "utf8");

  // Escape srt path for subtitles filter (colons / Windows)
  const srtEsc = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

  const vf = [
    `scale=720:1280:force_original_aspect_ratio=increase`,
    `crop=720:1280`,
    `zoompan=z='min(1.0+0.00045*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=25`,
    `subtitles='${srtEsc}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginV=48'`,
    `drawtext=text='Preview · not lip-sync':fontsize=14:fontcolor=white@0.55:x=16:y=16`,
  ].join(",");

  const args = [
    "-y",
    "-loop",
    "1",
    "-i",
    opts.imagePath,
    "-i",
    opts.audioPath,
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-tune",
    "stillimage",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    "-t",
    String(duration + 0.3),
    "-movflags",
    "+faststart",
    outMp4,
  ];

  const r = await run("ffmpeg", args);
  if (r.code !== 0) {
    // Retry without subtitles filter (fontconfig / libass issues)
    const vfSimple = [
      `scale=720:1280:force_original_aspect_ratio=increase`,
      `crop=720:1280`,
      `zoompan=z='min(1.0+0.00045*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=25`,
      `drawtext=text='${escapeDrawtext(opts.script.slice(0, 100))}':fontsize=16:fontcolor=white@0.85:x=(w-text_w)/2:y=h-120:box=1:boxcolor=black@0.45:boxborderw=8`,
      `drawtext=text='Preview · not lip-sync':fontsize=14:fontcolor=white@0.55:x=16:y=16`,
    ].join(",");
    const r2 = await run("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-i",
      opts.imagePath,
      "-i",
      opts.audioPath,
      "-vf",
      vfSimple,
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-t",
      String(duration + 0.3),
      "-movflags",
      "+faststart",
      outMp4,
    ]);
    if (r2.code !== 0) {
      throw new Error(
        `ffmpeg local render failed: ${(r2.stderr || r.stderr).slice(-800)}`
      );
    }
  }

  await fs.access(outMp4);
  void frames;
  return {
    videoPath: outMp4,
    videoRel: toMediaRel(outMp4),
    provider: "local-ffmpeg",
    label: LOCAL_RENDER_LABEL,
  };
}
