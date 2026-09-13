/**
 * Fanvue multipart media upload (creator session, mediaType: video).
 * Needs write:media (+ write:creator for creator-scoped endpoints).
 *
 * Flow:
 * 1. POST /creators/{uuid}/media/uploads
 * 2. GET part signed URLs → PUT bytes to S3
 * 3. PATCH complete upload
 * 4. Poll GET /media/{mediaUuid} until FINALISED / ready
 */
import { promises as fs } from "fs";
import { FanvueApiError, fanvueFetch, ensureValidTokens } from "../fanvue/api";
import { FANVUE_API_VERSION, getFanvueConfig } from "../fanvue/config";
import { loadTokens } from "../fanvue/tokens";
import { resolveMediaPath } from "./paths";
import { updateStore } from "../store";
import { VideoJob } from "../types";

export type FanvueUploadResult = {
  ok: boolean;
  mediaUuid?: string;
  status?: string;
  error?: string;
  checklist?: string[];
};

const DONE_STATUSES = new Set([
  "FINALISED",
  "FINALIZED",
  "finalised",
  "finalized",
  "ready",
  "READY",
]);

function scopeList(scope?: string): string[] {
  return (scope || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mediaUploadChecklist(missing: string[]): string[] {
  return [
    "Open Fanvue Creator Tools → Build → your app → Scopes",
    `Add missing scope(s): ${missing.join(", ") || "write:media"}`,
    "Also keep write:creator for creator-scoped upload endpoints",
    "Update FANVUE_SCOPES in .env.local to include write:media",
    "Reconnect OAuth (logout → Connect Fanvue) so the new scopes are granted",
    "Re-try Upload to Fanvue from the Video page",
  ];
}

export async function assertMediaWriteAccess(): Promise<
  | { ok: true; creatorUuid: string; scopes: string[] }
  | { ok: false; error: string; checklist: string[]; missing: string[] }
> {
  const tokens = await ensureValidTokens();
  if (!tokens) {
    return {
      ok: false,
      error: "Not connected to Fanvue — connect OAuth first (Maintainer).",
      missing: ["write:media", "write:creator"],
      checklist: [
        "Configure FANVUE_CLIENT_ID / SECRET in .env.local",
        "Add write:media (and write:creator) in Builder scopes",
        "Maintainer → Connect Fanvue over HTTPS",
        ...mediaUploadChecklist(["write:media"]),
      ],
    };
  }
  const scopes = scopeList(tokens.scope);
  const missing: string[] = [];
  if (!scopes.includes("write:media")) missing.push("write:media");
  // write:creator needed for /creators/{uuid}/media/uploads
  if (!scopes.includes("write:creator")) missing.push("write:creator");

  let creatorUuid = tokens.profile?.uuid;
  if (!creatorUuid) {
    try {
      const me = await fanvueFetch<{ uuid: string }>("/users/me");
      creatorUuid = me.uuid;
    } catch {
      creatorUuid = undefined;
    }
  }
  if (!creatorUuid) {
    return {
      ok: false,
      error: "Could not resolve creator UUID from Fanvue profile.",
      missing,
      checklist: mediaUploadChecklist(missing),
    };
  }
  if (missing.length) {
    return {
      ok: false,
      error: `Missing Fanvue OAuth scope(s): ${missing.join(", ")}. Upload requires write:media.`,
      missing,
      checklist: mediaUploadChecklist(missing),
    };
  }
  return { ok: true, creatorUuid, scopes };
}

async function getPartUrl(
  creatorUuid: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const cfg = getFanvueConfig();
  const tokens = await ensureValidTokens();
  if (!tokens) throw new FanvueApiError("Not connected", 401, null);
  const path = `/creators/${creatorUuid}/media/uploads/${encodeURIComponent(uploadId)}/parts/${partNumber}/url`;
  const res = await fetch(`${cfg.apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "X-Fanvue-API-Version": FANVUE_API_VERSION,
      Accept: "text/plain, application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new FanvueApiError(
      `Signed URL failed (${res.status}): ${text.slice(0, 200)}`,
      res.status,
      text
    );
  }
  // May be raw URL or JSON {"url":"..."}
  try {
    const j = JSON.parse(text) as { url?: string };
    if (j.url) return j.url;
  } catch {
    /* plain text */
  }
  return text.trim().replace(/^"|"$/g, "");
}

async function putPart(
  url: string,
  chunk: Buffer,
  partNumber: number
): Promise<{ ETag: string; PartNumber: number }> {
  const res = await fetch(url, {
    method: "PUT",
    body: new Uint8Array(chunk),
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(chunk.length),
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`S3 PUT part ${partNumber} failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const etag =
    res.headers.get("etag") ||
    res.headers.get("ETag") ||
    `"part-${partNumber}"`;
  return { ETag: etag.replace(/"/g, ""), PartNumber: partNumber };
}

async function completeUpload(
  creatorUuid: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
): Promise<{ status: string }> {
  // Prefer creator-scoped complete; fall back to self-scoped
  const body = {
    parts: parts.map((p) => ({
      ETag: p.ETag.includes('"') ? p.ETag : `"${p.ETag}"`,
      PartNumber: p.PartNumber,
    })),
  };
  try {
    return await fanvueFetch<{ status: string }>(
      `/creators/${creatorUuid}/media/uploads/${encodeURIComponent(uploadId)}`,
      { method: "PATCH", body: JSON.stringify(body) }
    );
  } catch (err) {
    if (err instanceof FanvueApiError && (err.status === 404 || err.status === 405)) {
      return fanvueFetch<{ status: string }>(
        `/media/uploads/${encodeURIComponent(uploadId)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      );
    }
    throw err;
  }
}

async function pollMediaReady(
  mediaUuid: string,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<{ uuid: string; status: string }> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const intervalMs = opts?.intervalMs ?? 2500;
  const start = Date.now();
  let last = { uuid: mediaUuid, status: "processing" };
  while (Date.now() - start < timeoutMs) {
    const media = await fanvueFetch<{ uuid: string; status: string }>(
      `/media/${mediaUuid}`
    );
    last = media;
    if (DONE_STATUSES.has(media.status) || media.status === "error") {
      return media;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

export async function uploadVideoJobToFanvue(
  jobId: string
): Promise<FanvueUploadResult> {
  const access = await assertMediaWriteAccess();
  if (!access.ok) {
    return {
      ok: false,
      error: access.error,
      checklist: access.checklist,
    };
  }

  const tokens = await loadTokens();
  const data = await (await import("../store")).readStore();
  const job = (data.videoJobs || []).find((j: VideoJob) => j.id === jobId);
  if (!job) return { ok: false, error: "job not found" };
  if (job.status !== "done" || !job.videoPath) {
    return { ok: false, error: "job must be done with a local MP4 first" };
  }

  const abs = resolveMediaPath(job.videoPath);
  const bytes = await fs.readFile(abs);
  const filename = abs.split(/[/\\]/).pop() || `${jobId}.mp4`;
  const name = `studio-video-${jobId.slice(0, 8)}`;

  try {
    const session = await fanvueFetch<{
      mediaUuid: string;
      uploadId: string;
      partSize: number;
      maxParts: number;
      totalParts: number | null;
    }>(`/creators/${access.creatorUuid}/media/uploads`, {
      method: "POST",
      body: JSON.stringify({
        name,
        filename,
        mediaType: "video",
        sizeBytes: bytes.length,
      }),
    });

    const partSize = session.partSize || 6 * 1024 * 1024;
    const totalParts =
      session.totalParts ?? Math.ceil(bytes.length / partSize);
    const parts: { ETag: string; PartNumber: number }[] = [];

    for (let i = 0; i < totalParts; i++) {
      const partNumber = i + 1;
      const start = i * partSize;
      const chunk = bytes.subarray(start, Math.min(bytes.length, start + partSize));
      const url = await getPartUrl(
        access.creatorUuid,
        session.uploadId,
        partNumber
      );
      const part = await putPart(url, Buffer.from(chunk), partNumber);
      parts.push(part);
    }

    await completeUpload(access.creatorUuid, session.uploadId, parts);
    const media = await pollMediaReady(session.mediaUuid);

    if (media.status === "error") {
      return {
        ok: false,
        mediaUuid: session.mediaUuid,
        status: media.status,
        error: "Fanvue media processing returned error",
      };
    }

    await updateStore((store) => {
      const j = (store.videoJobs || []).find((x) => x.id === jobId);
      if (j) {
        j.fanvueMediaUuid = session.mediaUuid;
        j.fanvueMediaStatus = media.status;
        j.updatedAt = new Date().toISOString();
      }
      // Attach uuid to linked PPV catalog item if any
      if (j?.ppvCatalogItemId) {
        const persona = store.personas.find((p) => p.id === j.personaId);
        const item = persona?.ppvCatalog?.find((c) => c.id === j.ppvCatalogItemId);
        if (item) {
          const set = new Set(item.mediaUuids || []);
          set.add(session.mediaUuid);
          item.mediaUuids = Array.from(set);
        }
      }
    });

    void tokens;
    return {
      ok: true,
      mediaUuid: session.mediaUuid,
      status: media.status,
    };
  } catch (err) {
    const message =
      err instanceof FanvueApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const scopes = scopeList((await loadTokens())?.scope);
    const looksScope =
      /scope|forbidden|403|write:media/i.test(message) ||
      (err instanceof FanvueApiError && err.status === 403);
    return {
      ok: false,
      error: message,
      checklist: looksScope
        ? mediaUploadChecklist(
            ["write:media", "write:creator"].filter((s) => !scopes.includes(s))
          )
        : undefined,
    };
  }
}
