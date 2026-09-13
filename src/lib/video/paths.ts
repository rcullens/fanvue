/**
 * Media path helpers — everything lives under data/media/ (sandboxed).
 */
import { promises as fs } from "fs";
import path from "path";

export const MEDIA_ROOT = path.join(process.cwd(), "data", "media");
export const PORTRAITS_DIR = path.join(MEDIA_ROOT, "portraits");
export const VIDEOS_DIR = path.join(MEDIA_ROOT, "videos");
export const AUDIO_DIR = path.join(MEDIA_ROOT, "audio");
export const TMP_DIR = path.join(MEDIA_ROOT, "tmp");

export async function ensureMediaDirs(): Promise<void> {
  await Promise.all([
    fs.mkdir(PORTRAITS_DIR, { recursive: true }),
    fs.mkdir(VIDEOS_DIR, { recursive: true }),
    fs.mkdir(AUDIO_DIR, { recursive: true }),
    fs.mkdir(TMP_DIR, { recursive: true }),
  ]);
}

/** Absolute path → relative under data/media (posix-style for store). */
export function toMediaRel(absPath: string): string {
  const rel = path.relative(MEDIA_ROOT, absPath);
  return rel.split(path.sep).join("/");
}

/** Relative store path → absolute; throws if outside sandbox. */
export function resolveMediaPath(relOrAbs: string): string {
  const candidate = path.isAbsolute(relOrAbs)
    ? path.normalize(relOrAbs)
    : path.normalize(path.join(MEDIA_ROOT, relOrAbs));
  const root = path.normalize(MEDIA_ROOT + path.sep);
  if (candidate !== path.normalize(MEDIA_ROOT) && !candidate.startsWith(root)) {
    throw new Error("Path escapes data/media sandbox");
  }
  return candidate;
}

export function mediaFileUrl(relPath: string): string {
  return `/api/video/file?path=${encodeURIComponent(relPath)}`;
}
