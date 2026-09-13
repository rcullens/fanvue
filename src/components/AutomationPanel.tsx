"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AutomationLogEntry,
  AutomationQueueItem,
  DEFAULT_SALES_POLICY,
  PpvCatalogItem,
  SalesPolicy,
} from "@/lib/types";

type Bundle = {
  queue: AutomationQueueItem[];
  log: AutomationLogEntry[];
  connected: boolean;
  activePersona: {
    id: string;
    name: string;
    salesPolicy: SalesPolicy;
    ppvCatalog: PpvCatalogItem[];
    contentTone: number;
  } | null;
  personas: { id: string; name: string }[];
  webhookPath: string;
  engine: string;
};

export function AutomationPanel() {
  const [data, setData] = useState<Bundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [simText, setSimText] = useState("hey :) how are you tonight?");
  const [policy, setPolicy] = useState<SalesPolicy>(DEFAULT_SALES_POLICY);
  const [catalog, setCatalog] = useState<PpvCatalogItem[]>([]);
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/automation/queue");
    const json = await res.json();
    setData(json);
    if (json.activePersona) {
      setPolicy({
        ...DEFAULT_SALES_POLICY,
        ...json.activePersona.salesPolicy,
        allowAutoSend: json.activePersona.salesPolicy?.allowAutoSend === true,
      });
      setCatalog(json.activePersona.ppvCatalog || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function savePack() {
    if (!data?.activePersona) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/automation/persona-pack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId: data.activePersona.id,
          salesPolicy: policy,
          ppvCatalog: catalog,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "Save failed");
        return;
      }
      setMessage("Persona pack saved (policy + PPV catalog).");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function run(action: "simulate" | "pull_unread") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "simulate"
            ? { action, text: simText }
            : { action, limit: 10 }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "Run failed");
      } else if (action === "simulate") {
        setMessage(
          json.autoSent
            ? "Simulated & auto-sent (mock)."
            : "Simulated draft queued for approval ($0 mock)."
        );
      } else {
        setMessage(`Drafted ${json.processed} unread chat(s).`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/automation/queue/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editDrafts[id] }),
      });
      const json = await res.json();
      if (!res.ok) setMessage(json.error || "Approve failed");
      else
        setMessage(
          json.remote
            ? "Sent live to Fanvue."
            : "Marked sent in mock (no remote write)."
        );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/automation/queue/${id}/reject`, { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function addCatalogItem() {
    setCatalog((c) => [
      ...c,
      {
        id: crypto.randomUUID(),
        title: "New PPV",
        description: "Short teaser description",
        priceCents: 999,
        pitchHints: "soft pitch line",
      },
    ]);
  }

  if (!data) {
    return (
      <div className="card p-10 text-center text-sm text-[var(--muted)]">
        Loading automation…
      </div>
    );
  }

  if (!data.activePersona) {
    return (
      <div className="empty-state">
        <div className="text-4xl opacity-40">🤖</div>
        <h3 className="text-lg font-semibold">Activate a persona first</h3>
        <p className="max-w-md text-sm text-[var(--muted)]">
          Automation uses one shared LLM/mock engine with many persona packs.
          Create a 21+ persona, then configure sales policy + PPV catalog here.
        </p>
        <a href="/personas" className="btn-primary">
          Personas
        </a>
      </div>
    );
  }

  const pending = data.queue.filter((q) => q.status === "pending");
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-host";

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          {message}
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm font-semibold text-white">
            Pack · {data.activePersona.name} · engine {data.engine}
          </div>
          <p className="text-xs text-[var(--muted)]">
            {data.connected
              ? "Fanvue connected — pull unread / approve can send live"
              : "Mock mode ($0) — simulate fans without Fanvue credentials"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => run("simulate")}
          >
            Simulate fan message
          </button>
          <button
            className="btn-primary"
            disabled={busy || !data.connected}
            onClick={() => run("pull_unread")}
            title={!data.connected ? "Connect Fanvue first" : ""}
          >
            Pull unread & draft
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sales policy */}
        <div className="card space-y-4 p-5">
          <div>
            <h3 className="font-semibold">Sales policy</h3>
            <p className="text-xs text-[var(--muted)]">
              Policy decides WHETHER to pitch; the model only writes the line.
              Auto-send defaults OFF.
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm">
            <span>
              Allow auto-send
              <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                OFF = queue for approval (safer, recommended)
              </span>
            </span>
            <input
              type="checkbox"
              checked={policy.allowAutoSend}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, allowAutoSend: e.target.checked }))
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Max PPV offers / day</label>
              <input
                type="number"
                className="input"
                value={policy.maxPpvOffersPerDay}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    maxPpvOffersPerDay: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="label">Min msgs before pitch</label>
              <input
                type="number"
                className="input"
                value={policy.minMessagesBeforePitch}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    minMessagesBeforePitch: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="label">Cooldown hours</label>
              <input
                type="number"
                className="input"
                value={policy.cooldownHoursAfterOfferOrPurchase}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    cooldownHoursAfterOfferOrPurchase: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Quiet start</label>
                <input
                  className="input"
                  placeholder="22:00"
                  value={policy.quietHours?.start || ""}
                  onChange={(e) =>
                    setPolicy((p) => ({
                      ...p,
                      quietHours: {
                        start: e.target.value,
                        end: p.quietHours?.end || "08:00",
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label className="label">Quiet end</label>
                <input
                  className="input"
                  placeholder="08:00"
                  value={policy.quietHours?.end || ""}
                  onChange={(e) =>
                    setPolicy((p) => ({
                      ...p,
                      quietHours: {
                        start: p.quietHours?.start || "22:00",
                        end: e.target.value,
                      },
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <div>
            <label className="label">Simulate inbound text</label>
            <input
              className="input"
              value={simText}
              onChange={(e) => setSimText(e.target.value)}
            />
          </div>
        </div>

        {/* PPV catalog */}
        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">PPV catalog</h3>
              <p className="text-xs text-[var(--muted)]">
                Fanvue message PPV min $3.00 (300¢). Optional mediaUuids from
                vault.
              </p>
            </div>
            <button className="btn-secondary !py-1.5 !text-xs" onClick={addCatalogItem}>
              + Item
            </button>
          </div>
          {!catalog.length ? (
            <p className="text-sm text-[var(--muted)]">
              Empty catalog → reply-only (no pitches).
            </p>
          ) : (
            <ul className="max-h-80 space-y-3 overflow-auto">
              {catalog.map((item, idx) => (
                <li key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      className="input"
                      value={item.title}
                      onChange={(e) =>
                        setCatalog((c) =>
                          c.map((x, i) =>
                            i === idx ? { ...x, title: e.target.value } : x
                          )
                        )
                      }
                      placeholder="Title"
                    />
                    <input
                      type="number"
                      className="input"
                      value={item.priceCents}
                      onChange={(e) =>
                        setCatalog((c) =>
                          c.map((x, i) =>
                            i === idx
                              ? {
                                  ...x,
                                  priceCents: Math.max(
                                    300,
                                    Number(e.target.value) || 300
                                  ),
                                }
                              : x
                          )
                        )
                      }
                      placeholder="Price cents"
                    />
                  </div>
                  <textarea
                    className="input mt-2 min-h-[60px]"
                    value={item.description}
                    onChange={(e) =>
                      setCatalog((c) =>
                        c.map((x, i) =>
                          i === idx ? { ...x, description: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Description"
                  />
                  <input
                    className="input mt-2"
                    value={item.pitchHints || ""}
                    onChange={(e) =>
                      setCatalog((c) =>
                        c.map((x, i) =>
                          i === idx ? { ...x, pitchHints: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Pitch hints"
                  />
                  <input
                    className="input mt-2"
                    value={(item.mediaUuids || []).join(", ")}
                    onChange={(e) =>
                      setCatalog((c) =>
                        c.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                mediaUuids: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : x
                        )
                      )
                    }
                    placeholder="mediaUuids (comma-separated, optional)"
                  />
                  <button
                    className="btn-danger mt-2 !py-1 !text-[11px]"
                    onClick={() =>
                      setCatalog((c) => c.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-primary" disabled={busy} onClick={savePack}>
            Save policy + catalog
          </button>
        </div>
      </div>

      {/* Webhook info */}
      <div className="card p-5 text-sm">
        <h3 className="font-semibold">24/7 via webhooks (preferred over polling)</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Register this URL in Fanvue Creator Tools → webhooks for{" "}
          <code className="text-violet-200">creator.message.*</code>. Cheaper
          than polling unread. Signature verification is stubbed — set{" "}
          <code className="text-violet-200">FANVUE_WEBHOOK_SECRET</code> and
          finish Standard Webhooks verify before production.
        </p>
        <code className="mt-3 block overflow-x-auto rounded-xl bg-black/40 px-3 py-2 text-xs text-violet-100">
          {origin}
          {data.webhookPath}
        </code>
      </div>

      {/* Pending queue */}
      <div className="card p-5">
        <h3 className="mb-3 font-semibold">
          Pending drafts ({pending.length})
        </h3>
        {!pending.length ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-[var(--muted)]">
            No pending drafts. Simulate a fan message ($0) or pull unread when
            connected.
          </div>
        ) : (
          <ul className="space-y-4">
            {pending.map((q) => (
              <li
                key={q.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                  <span>
                    {q.fanDisplayName || q.fanHandle || q.fanUserUuid} ·{" "}
                    <span className="text-violet-200">{q.mode}</span> · {q.source}
                  </span>
                  {q.ppvItemId && (
                    <span className="badge bg-fuchsia-500/20 text-fuchsia-200">
                      PPV {(q.ppvPriceCents || 0) / 100}$
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">Fan: {q.inboundText}</p>
                <textarea
                  className="input mt-2 min-h-[88px]"
                  value={editDrafts[q.id] ?? q.draftText}
                  onChange={(e) =>
                    setEditDrafts((d) => ({ ...d, [q.id]: e.target.value }))
                  }
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="btn-success"
                    disabled={busy}
                    onClick={() => approve(q.id)}
                  >
                    Approve & {q.mode === "live" ? "send" : "mark sent"}
                  </button>
                  <button
                    className="btn-danger"
                    disabled={busy}
                    onClick={() => reject(q.id)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent log + all queue */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">Automation log</h3>
          <ul className="max-h-64 divide-y divide-white/5 overflow-auto text-sm">
            {data.log.map((e) => (
              <li key={e.id} className="py-2">
                <div className="font-medium text-white/90">{e.summary}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {e.kind} · {new Date(e.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
            {!data.log.length && (
              <li className="py-4 text-[var(--muted)]">No events yet.</li>
            )}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">Recent queue</h3>
          <ul className="max-h-64 divide-y divide-white/5 overflow-auto text-sm">
            {data.queue.slice(0, 20).map((q) => (
              <li key={q.id} className="flex justify-between gap-2 py-2">
                <span className="truncate">
                  {q.fanHandle || q.fanUserUuid}
                </span>
                <span
                  className={`badge ${
                    q.status === "sent"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : q.status === "pending"
                        ? "bg-amber-500/20 text-amber-200"
                        : q.status === "failed"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-white/10 text-white/70"
                  }`}
                >
                  {q.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
