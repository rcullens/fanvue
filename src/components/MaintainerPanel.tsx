"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActionLogEntry,
  MaintainerState,
  Persona,
  PricingConfig,
} from "@/lib/types";
import type { PriceProposal } from "@/lib/adapters/fanvue-client";

type Bundle = {
  maintainer: MaintainerState;
  persona: Persona | null;
  proposal: PriceProposal | null;
  adapter: { id: string; label: string };
  adapters: { id: string; label: string }[];
};

export function MaintainerPanel() {
  const [data, setData] = useState<Bundle | null>(null);
  const [adapter, setAdapter] = useState("mock");
  const [checklist, setChecklist] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      const res = await fetch(
        `/api/maintainer?adapter=${adapter}${refresh ? "&refresh=1" : ""}`
      );
      const json = await res.json();
      setData(json);
    },
    [adapter]
  );

  useEffect(() => {
    load(true);
  }, [load]);

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

  function updatePricing<K extends keyof PricingConfig>(key: K, value: PricingConfig[K]) {
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
      <div className="card flex flex-col items-center gap-3 p-12 text-center">
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

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          {message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Account maintainer</h2>
          <p className="text-xs text-[var(--muted)]">
            {persona.name} · mock metrics by default · no live Fanvue writes
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

      {/* Status + KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Profile status"
          value={maintainer.status}
          control={
            <select
              className="input mt-2 !py-1.5 text-xs"
              value={maintainer.status}
              onChange={(e) =>
                post("set_status", { status: e.target.value })
              }
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="review">review</option>
            </select>
          }
        />
        <Stat label="Subscribers" value={String(m.subscriberCount)} />
        <Stat
          label="Engagement"
          value={`${(m.engagementRate * 100).toFixed(1)}%`}
        />
        <Stat
          label="Popularity"
          value={`${m.popularityScore.toFixed(0)}/100`}
        />
        <Stat label="Msgs / day" value={String(m.messagesPerDay)} />
        <Stat label="Tips (7d)" value={`$${m.tipRevenue7d.toFixed(2)}`} />
        <Stat
          label="PPV conversion"
          value={`${(m.ppvConversionRate * 100).toFixed(1)}%`}
        />
        <Stat label="Current sub" value={`$${m.currentSubPrice.toFixed(2)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pricing config */}
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
            <Num
              label="Min sub"
              value={maintainer.pricing.minSubPrice}
              onChange={(v) => updatePricing("minSubPrice", v)}
            />
            <Num
              label="Max sub"
              value={maintainer.pricing.maxSubPrice}
              onChange={(v) => updatePricing("maxSubPrice", v)}
            />
            <Num
              label="Min tip"
              value={maintainer.pricing.minTipSuggest}
              onChange={(v) => updatePricing("minTipSuggest", v)}
            />
            <Num
              label="Max tip"
              value={maintainer.pricing.maxTipSuggest}
              onChange={(v) => updatePricing("maxTipSuggest", v)}
            />
            <Num
              label="Min PPV"
              value={maintainer.pricing.minPpv}
              onChange={(v) => updatePricing("minPpv", v)}
            />
            <Num
              label="Max PPV"
              value={maintainer.pricing.maxPpv}
              onChange={(v) => updatePricing("maxPpv", v)}
            />
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

        {/* Proposal */}
        <div className="card space-y-4 p-5">
          <h3 className="font-semibold">Proposed adjustments</h3>
          {proposal ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <PriceChip label="Sub" value={proposal.subPrice} />
                <PriceChip label="Tip" value={proposal.tipSuggest} />
                <PriceChip label="PPV" value={proposal.ppvPrice} />
              </div>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                {proposal.rationale}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  disabled={busy}
                  onClick={() =>
                    post("apply_pricing", {
                      personaId: persona.id,
                      proposal,
                    })
                  }
                >
                  Apply (local mock)
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
                Apply updates local mock state only. Real Fanvue changes require
                the checklist or a future FanvueClient backend.
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
          <h3 className="font-semibold">Action queue</h3>
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
              <li key={e.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium text-white/90">{e.summary}</div>
                  {e.detail && (
                    <div className="mt-0.5 text-xs text-[var(--muted)] line-clamp-2">
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
  control,
}: {
  label: string;
  value: string;
  control?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold capitalize text-white">{value}</div>
      {control}
    </div>
  );
}

function PriceChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-3">
      <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
      <div className="text-lg font-semibold text-violet-200">
        ${value.toFixed(2)}
      </div>
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
