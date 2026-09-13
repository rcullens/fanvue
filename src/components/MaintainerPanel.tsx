"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActionLogEntry,
  MaintainerState,
  Persona,
  PricingConfig,
} from "@/lib/types";
import type { PriceProposal } from "@/lib/adapters/fanvue-client";

type FanvueStatus = {
  connected: boolean;
  oauthConfigured?: boolean;
  handle?: string;
  displayName?: string;
  uuid?: string;
  status?: string;
  subscriptionPriceDollars?: number | null;
  subscribers?: number | null;
  tokenExpiresAt?: number;
};

type Bundle = {
  maintainer: MaintainerState;
  persona: Persona | null;
  proposal: PriceProposal | null;
  adapter: { id: string; label: string };
  adapters: { id: string; label: string }[];
  liveError?: string | null;
};

export function MaintainerPanel() {
  const [data, setData] = useState<Bundle | null>(null);
  const [adapter, setAdapter] = useState("mock");
  const [checklist, setChecklist] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fv, setFv] = useState<FanvueStatus | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/fanvue/status");
      setFv(await res.json());
    } catch {
      setFv({ connected: false });
    }
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      const res = await fetch(
        `/api/maintainer?adapter=${adapter}${refresh ? "&refresh=1" : ""}`
      );
      const json = await res.json();
      setData(json);
      if (json.liveError) setMessage(json.liveError);
    },
    [adapter]
  );

  useEffect(() => {
    load(true);
    loadStatus();
  }, [load, loadStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (oauth === "connected") {
      setMessage("Fanvue connected via OAuth.");
      setAdapter("live");
      loadStatus();
    } else if (oauth === "error") {
      setMessage(params.get("msg") || "OAuth error");
    }
  }, [loadStatus]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/maintainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adapter, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "Action failed");
        return json;
      }
      if (json.maintainer) {
        setData((d) =>
          d
            ? {
                ...d,
                maintainer: json.maintainer,
                proposal: json.proposal ?? d.proposal,
                persona: json.persona ?? d.persona,
              }
            : d
        );
      }
      if (json.checklist) setChecklist(json.checklist);
      if (json.result?.message) setMessage(json.result.message);
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/fanvue/oauth/logout", { method: "POST" });
      await loadStatus();
      setMessage("Disconnected from Fanvue.");
      if (adapter === "live") setAdapter("mock");
    } finally {
      setBusy(false);
    }
  }

  function updatePricing<K extends keyof PricingConfig>(
    key: K,
    value: PricingConfig[K]
  ) {
    setData((d) =>
      d
        ? {
            ...d,
            maintainer: {
              ...d.maintainer,
              pricing: { ...d.maintainer.pricing, [key]: value },
            },
          }
        : d
    );
  }

  async function applyPricing() {
    if (!data?.persona || !data.proposal) return;
    const isIncrease =
      data.proposal.subPrice > data.maintainer.metrics.currentSubPrice;
    const live = adapter === "live";
    if (live && !fv?.connected) {
      setMessage("Connect Fanvue before applying live pricing.");
      return;
    }
    const warn = live
      ? isIncrease
        ? `Apply LIVE subscription price $${data.proposal.subPrice.toFixed(
            2
          )}?\n\nWARNING: Price INCREASES move existing subscribers to re-opt-in (they must accept the new price). Tip/PPV suggestions are local heuristics only.`
        : `Apply LIVE subscription price $${data.proposal.subPrice.toFixed(
            2
          )} on Fanvue?\n\nTip/PPV suggestions stay local — only sub price is written remotely.`
      : `Apply prices locally (${adapter})? No Fanvue write.`;
    if (!confirm(warn)) return;
    await post("apply_pricing", {
      personaId: data.persona.id,
      proposal: data.proposal,
    });
    if (live) await loadStatus();
  }

  if (!data) {
    return (
      <div className="card p-10 text-center text-sm text-[var(--muted)]">
        Loading maintainer…
      </div>
    );
  }

  const { maintainer, persona, proposal } = data;
  const m = maintainer.metrics;

  if (!persona) {
    return (
      <div className="empty-state">
        <div className="text-4xl opacity-40">📊</div>
        <h3 className="text-lg font-semibold">No persona linked</h3>
        <p className="text-sm text-[var(--muted)]">
          Create and activate a persona to run the Fanvue ops panel.
        </p>
        <a href="/personas" className="btn-primary">
          Personas
        </a>
      </div>
    );
  }

  const trend = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          {message}
        </div>
      )}

      {/* Connection banner */}
      <div
        className={`card flex flex-wrap items-center justify-between gap-3 p-4 ${
          fv?.connected ? "border-emerald-500/30" : ""
        }`}
      >
        <div>
          <div className="text-sm font-semibold text-white">
            {fv?.connected
              ? `Fanvue connected · @${fv.handle}`
              : "Fanvue not connected"}
          </div>
          <p className="text-xs text-[var(--muted)]">
            {fv?.connected
              ? `${fv.displayName || ""} · sub $${
                  fv.subscriptionPriceDollars?.toFixed(2) ?? "—"
                } · ${fv.subscribers ?? "—"} subscribers`
              : fv?.oauthConfigured
                ? "OAuth app configured — connect to use Live adapter & chat automation."
                : "Add FANVUE_CLIENT_ID / SECRET in .env.local (your own Builder app)."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {fv?.connected ? (
            <button className="btn-danger" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          ) : (
            <a
              className={`btn-primary ${!fv?.oauthConfigured ? "pointer-events-none opacity-50" : ""}`}
              href="/api/fanvue/oauth/start"
            >
              Connect Fanvue
            </a>
          )}
          <a href="/automation" className="btn-secondary">
            Automation
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Account maintainer</h2>
          <p className="text-xs text-[var(--muted)]">
            {persona.name} · {m.liveLabel || m.dataSource || adapter} adapter
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input !w-auto"
            value={adapter}
            onChange={(e) => setAdapter(e.target.value)}
          >
            {data.adapters.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => post("refresh_metrics", { personaId: persona.id })}
          >
            Refresh metrics
          </button>
        </div>
      </div>

      {adapter === "live" && fv?.connected && (
        <div className="card-glow grid gap-3 p-4 sm:grid-cols-4">
          <div>
            <div className="text-[11px] uppercase text-[var(--muted)]">Handle</div>
            <div className="font-medium">@{fv.handle}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-[var(--muted)]">Status</div>
            <div className="font-medium capitalize">{fv.status || "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-[var(--muted)]">Live sub</div>
            <div className="font-medium">
              ${fv.subscriptionPriceDollars?.toFixed(2) ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-[var(--muted)]">Subscribers</div>
            <div className="font-medium">{fv.subscribers ?? "—"}</div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Profile status"
          value={maintainer.status}
          trend={null}
          control={
            <select
              className="input mt-2 !py-1.5 text-xs"
              value={maintainer.status}
              onChange={(e) => post("set_status", { status: e.target.value })}
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="review">review</option>
            </select>
          }
        />
        <Stat label="Subscribers" value={String(m.subscriberCount)} trend={trend(2)} />
        <Stat
          label="Engagement"
          value={`${(m.engagementRate * 100).toFixed(1)}%`}
          trend={trend(0.4)}
        />
        <Stat
          label="Popularity"
          value={`${m.popularityScore.toFixed(0)}/100`}
          trend={trend(1)}
        />
        <Stat label="Msgs / day" value={String(m.messagesPerDay)} trend={trend(-3)} />
        <Stat label="Tips (7d)" value={`$${m.tipRevenue7d.toFixed(2)}`} trend={trend(12)} />
        <Stat
          label="PPV conversion"
          value={`${(m.ppvConversionRate * 100).toFixed(1)}%`}
          trend={trend(0.2)}
        />
        <Stat label="Current sub" value={`$${m.currentSubPrice.toFixed(2)}`} trend={null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Dynamic pricing controls</h3>
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={maintainer.pricing.autoAdjustEnabled}
                onChange={(e) =>
                  updatePricing("autoAdjustEnabled", e.target.checked)
                }
              />
              Auto-adjust enabled
            </label>
          </div>
          <RangeRow
            label="Aggressiveness"
            value={maintainer.pricing.aggressiveness}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(maintainer.pricing.aggressiveness * 100)}%`}
            onChange={(v) => updatePricing("aggressiveness", v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Num label="Min sub" value={maintainer.pricing.minSubPrice} onChange={(v) => updatePricing("minSubPrice", v)} />
            <Num label="Max sub" value={maintainer.pricing.maxSubPrice} onChange={(v) => updatePricing("maxSubPrice", v)} />
            <Num label="Min tip" value={maintainer.pricing.minTipSuggest} onChange={(v) => updatePricing("minTipSuggest", v)} />
            <Num label="Max tip" value={maintainer.pricing.maxTipSuggest} onChange={(v) => updatePricing("maxTipSuggest", v)} />
            <Num label="Min PPV" value={maintainer.pricing.minPpv} onChange={(v) => updatePricing("minPpv", v)} />
            <Num label="Max PPV" value={maintainer.pricing.maxPpv} onChange={(v) => updatePricing("maxPpv", v)} />
          </div>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() =>
              post("update_pricing_config", { pricing: maintainer.pricing })
            }
          >
            Save pricing config
          </button>
        </div>

        <div className="card-glow space-y-4 p-5">
          <h3 className="font-semibold">Proposed adjustments</h3>
          {proposal ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <PriceChip label="Sub" value={proposal.subPrice} current={m.currentSubPrice} />
                <PriceChip label="Tip" value={proposal.tipSuggest} />
                <PriceChip label="PPV" value={proposal.ppvPrice} />
              </div>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                {proposal.rationale}
              </p>
              {adapter === "live" &&
                proposal.subPrice > m.currentSubPrice && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    Price increase will move existing subscribers to re-opt-in
                    on Fanvue.
                  </div>
                )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={
                    busy || (adapter === "live" && !fv?.connected)
                  }
                  onClick={applyPricing}
                >
                  {adapter === "live"
                    ? "Apply live sub price"
                    : adapter === "checklist"
                      ? "Generate checklist apply"
                      : "Apply (local mock)"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    post("export_checklist", {
                      personaId: persona.id,
                      proposal,
                    })
                  }
                >
                  Export checklist
                </button>
              </div>
              <p className="text-[11px] text-amber-200/80">
                {adapter === "live"
                  ? "Live apply writes only subscriptionPrice via PATCH /users/me/subscription-price. Never fakes success."
                  : "Mock/checklist never writes to Fanvue. Tip & PPV menus may still need manual UI steps."}
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">No proposal yet.</p>
          )}
        </div>
      </div>

      {checklist && (
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Manual checklist</h3>
            <button
              className="btn-secondary !py-1.5 !text-xs"
              onClick={() => navigator.clipboard.writeText(checklist)}
            >
              Copy
            </button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-xl bg-black/40 p-4 text-xs text-white/80 whitespace-pre-wrap">
            {checklist}
          </pre>
        </div>
      )}

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Action log</h3>
          <button
            className="btn-secondary !py-1.5 !text-xs"
            disabled={busy}
            onClick={() => post("reset_defaults")}
          >
            Reset defaults
          </button>
        </div>
        {!maintainer.actionLog.length ? (
          <p className="text-sm text-[var(--muted)]">No actions yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {maintainer.actionLog.map((e: ActionLogEntry) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <div className="font-medium text-white/90">{e.summary}</div>
                  {e.detail && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
                      {e.detail}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right text-[11px] text-[var(--muted)]">
                  <div>{e.kind}</div>
                  <div>{e.applied ? "applied" : "proposed"}</div>
                  <div>{new Date(e.createdAt).toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  trend,
  control,
}: {
  label: string;
  value: string;
  trend: string | null;
  control?: ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
          {label}
        </div>
        {trend && (
          <span
            className={`badge text-[10px] ${
              trend.startsWith("-")
                ? "bg-rose-500/15 text-rose-300"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
      <div className="mt-1 text-xl font-semibold capitalize text-white">
        {value}
      </div>
      {control}
    </div>
  );
}

function PriceChip({
  label,
  value,
  current,
}: {
  label: string;
  value: number;
  current?: number;
}) {
  const up = current != null && value > current;
  return (
    <div className="rounded-xl bg-white/5 px-2 py-3">
      <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
      <div className="text-lg font-semibold text-violet-200">
        ${value.toFixed(2)}
      </div>
      {current != null && (
        <div className="text-[10px] text-[var(--muted)]">
          was ${current.toFixed(2)}
          {up ? " ↑" : value < current ? " ↓" : ""}
        </div>
      )}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="text-violet-200">{display}</span>
      </div>
      <input
        type="range"
        className="tone-slider w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
