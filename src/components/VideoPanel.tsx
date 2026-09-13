"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VideoJob, MIN_PPV_CENTS } from "@/lib/types";

type Voice = { id: string; label: string; gender?: string };
type PersonaRow = {
  id: string;
  name: string;
  portraitPath?: string;
  portraitUrl?: string | null;
  voiceId?: string;
  isActive: boolean;
  ppvCatalogCount: number;
};

type Bundle = {
  jobs: VideoJob[];
  voices: Voice[];
  ttsEngine: string;
  defaultProvider: string;
  providerBadge: string;
  renderLabel: string;
  activePersonaId: string | null;
  personas: PersonaRow[];
  fanvueUpload: { ready: boolean; error?: string; checklist?: string[] };
};

export function VideoPanel() {
  const [data, setData] = useState<Bundle | null>(null);
  const [personaId, setPersonaId] = useState<string>("");
  const [script, setScript] = useState(
    "hey… i made this just for you. stay a little longer?"
  );
  const [voiceId, setVoiceId] = useState("en-US-AriaNeural");
  const [provider, setProvider] = useState("local-ffmpeg");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"ok" | "warn" | "err">("ok");
  const [ppvTitle, setPpvTitle] = useState("Exclusive video clip");
  const [ppvCents, setPpvCents] = useState(MIN_PPV_CENTS);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/video/jobs");
    const json = (await res.json()) as Bundle;
    setData(json);
    const active =
      json.activePersonaId ||
      json.personas.find((p) => p.isActive)?.id ||
      json.personas[0]?.id ||
      "";
    setPersonaId((prev) => prev || active);
    if (json.voices?.[0] && !json.voices.find((v) => v.id === voiceId)) {
      setVoiceId(json.voices[0].id);
    }
    setProvider(json.defaultProvider || "local-ffmpeg");
  }, [voiceId]);

  useEffect(() => {
    load();
  }, [load]);

  const persona = useMemo(
    () => data?.personas.find((p) => p.id === personaId),
    [data, personaId]
  );

  const selectedJob = useMemo(
    () => data?.jobs.find((j) => j.id === selectedJobId) || data?.jobs[0],
    [data, selectedJobId]
  );

  function flash(text: string, tone: "ok" | "warn" | "err" = "ok") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function setActivePersona(id: string) {
    setPersonaId(id);
    await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    }).catch(() => undefined);
  }

  async function onPortrait(file: File | null) {
    if (!file || !personaId) return;
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.set("personaId", personaId);
      fd.set("file", file);
      const res = await fetch("/api/video/portrait", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        flash(json.error || "Portrait upload failed", "err");
        return;
      }
      flash("Portrait saved under data/media/portraits/", "ok");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function useSamplePortrait() {
    if (!personaId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        "/api/video/file?path=" + encodeURIComponent("portraits/sample-placeholder.png")
      );
      if (!res.ok) {
        flash("Sample portrait missing — upload your own PNG", "err");
        return;
      }
      const blob = await res.blob();
      const file = new File([blob], "sample-placeholder.png", {
        type: "image/png",
      });
      await onPortrait(file);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!personaId) {
      flash("Pick a persona first", "warn");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId,
          script,
          voiceId,
          provider,
        }),
      });
      const json = await res.json();
      if (!res.ok && !json.job) {
        flash(json.error || "Generate failed", "err");
        return;
      }
      if (json.job?.status === "failed") {
        flash(json.job.error || "Job failed", "err");
      } else {
        flash(
          `Job ${json.job.status} · ${json.job.provider} · MP4 ready under data/media/videos/`,
          "ok"
        );
        setSelectedJobId(json.job.id);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addToPpv() {
    if (!selectedJob || selectedJob.status !== "done") {
      flash("Select a finished job first", "warn");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/video/jobs/${selectedJob.id}/to-ppv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ppvTitle,
          priceCents: ppvCents,
          description: script.slice(0, 280),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        flash(json.error || "PPV add failed", "err");
        return;
      }
      flash(`Added to PPV catalog (${json.catalogItemId.slice(0, 8)}…)`, "ok");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function uploadFanvue() {
    if (!selectedJob || selectedJob.status !== "done") {
      flash("Select a finished job first", "warn");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/video/jobs/${selectedJob.id}/upload-fanvue`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!json.ok) {
        const extra = json.checklist?.length
          ? "\n• " + json.checklist.join("\n• ")
          : "";
        flash((json.error || "Upload failed") + extra, "err");
        return;
      }
      flash(
        `Uploaded to Fanvue · mediaUuid ${json.mediaUuid} · status ${json.status}`,
        "ok"
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="card p-6 text-sm text-[var(--muted)]">Loading video studio…</div>
    );
  }

  const videoUrl = selectedJob?.videoPath
    ? `/api/video/file?path=${encodeURIComponent(selectedJob.videoPath)}`
    : null;

  return (
    <div className="space-y-4">
      <div className="card-glow p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Video bots</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              $0 default path: free TTS (edge-tts) + local ffmpeg Ken Burns preview.
              Not neural lip-sync — hook SadTalker/LivePortrait on a GPU box via{" "}
              <code className="text-violet-200">VIDEO_RENDER_CMD</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="badge border border-emerald-500/30 bg-emerald-500/15 text-emerald-200">
              {data.providerBadge}
            </span>
            <span className="badge border border-white/10 bg-white/5 text-[var(--muted)]">
              TTS: {data.ttsEngine}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-amber-200/90">
          Age 21+ fictional personas only · no CSAM · no under-21 likenesses
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">{data.renderLabel}</p>
      </div>

      {message && (
        <div
          className={`card whitespace-pre-wrap p-4 text-sm ${
            messageTone === "ok"
              ? "border-emerald-500/30 text-emerald-100"
              : messageTone === "warn"
                ? "border-amber-500/30 text-amber-100"
                : "border-rose-500/30 text-rose-100"
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">Active persona</label>
            <select
              className="input"
              value={personaId}
              onChange={(e) => setActivePersona(e.target.value)}
            >
              {data.personas.length === 0 && (
                <option value="">No personas — create one first</option>
              )}
              {data.personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id.slice(0, 8)}
                  {p.portraitPath ? "" : " · needs portrait"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Portrait image</label>
            <div className="flex flex-wrap items-center gap-3">
              {persona?.portraitUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={persona.portraitUrl}
                  alt="Portrait"
                  className="h-28 w-20 rounded-xl object-cover border border-white/10"
                />
              ) : (
                <div className="flex h-28 w-20 items-center justify-center rounded-xl border border-dashed border-white/20 text-[10px] text-[var(--muted)]">
                  No portrait
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy || !personaId}
                  onChange={(e) => onPortrait(e.target.files?.[0] || null)}
                  className="text-xs text-[var(--muted)]"
                />
                <button
                  type="button"
                  className="btn-secondary !py-1.5 text-xs"
                  disabled={busy || !personaId}
                  onClick={useSamplePortrait}
                >
                  Use sample portrait
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Script (what the bot “says”)</label>
            <textarea
              className="input min-h-[120px]"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Chat-style lines…"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Voice (free TTS)</label>
              <select
                className="input"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
              >
                {data.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Render provider</label>
              <select
                className="input"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="local-ffmpeg">local-ffmpeg ($0 preview)</option>
                <option value="external-cli">external-cli (VIDEO_RENDER_CMD)</option>
                <option value="replicate">replicate (stub)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !personaId}
            onClick={generate}
          >
            {busy ? "Working…" : "Generate video job"}
          </button>
        </div>

        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Preview & catalog</h3>
            {selectedJob && (
              <span className="badge border border-white/10 bg-white/5">
                {selectedJob.provider} · {selectedJob.status}
              </span>
            )}
          </div>

          {videoUrl && selectedJob?.status === "done" ? (
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              className="w-full max-h-[420px] rounded-xl border border-white/10 bg-black"
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-[var(--muted)]">
              Generate a job to preview MP4
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">PPV title</label>
              <input
                className="input"
                value={ppvTitle}
                onChange={(e) => setPpvTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Price (cents, min {MIN_PPV_CENTS})</label>
              <input
                className="input"
                type="number"
                min={MIN_PPV_CENTS}
                value={ppvCents}
                onChange={(e) => setPpvCents(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-success"
              disabled={busy || selectedJob?.status !== "done"}
              onClick={addToPpv}
            >
              Add to PPV catalog
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || selectedJob?.status !== "done"}
              onClick={uploadFanvue}
              title={
                data.fanvueUpload.ready
                  ? "Upload via write:media"
                  : data.fanvueUpload.error || "Needs write:media"
              }
            >
              Upload to Fanvue
            </button>
          </div>

          {!data.fanvueUpload.ready && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
              <div className="font-medium">Fanvue upload not ready</div>
              <p className="mt-1 opacity-90">
                {data.fanvueUpload.error || "Missing write:media scope or OAuth."}
              </p>
              {data.fanvueUpload.checklist && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 opacity-90">
                  {data.fanvueUpload.checklist.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Jobs</h3>
        {data.jobs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No jobs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="pb-2 pr-3">Created</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Provider</th>
                  <th className="pb-2 pr-3">TTS</th>
                  <th className="pb-2">Script</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr
                    key={j.id}
                    className={`cursor-pointer border-t border-white/5 hover:bg-white/5 ${
                      selectedJob?.id === j.id ? "bg-violet-500/10" : ""
                    }`}
                    onClick={() => setSelectedJobId(j.id)}
                  >
                    <td className="py-2.5 pr-3 text-xs text-[var(--muted)]">
                      {new Date(j.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`badge ${
                          j.status === "done"
                            ? "bg-emerald-500/15 text-emerald-200"
                            : j.status === "failed"
                              ? "bg-rose-500/15 text-rose-200"
                              : "bg-white/10 text-white/80"
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">{j.provider}</td>
                    <td className="py-2.5 pr-3 text-xs">{j.ttsEngine || "—"}</td>
                    <td className="py-2.5 max-w-xs truncate text-xs text-[var(--muted)]">
                      {j.error ? (
                        <span className="text-rose-300">{j.error}</span>
                      ) : (
                        j.script
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
