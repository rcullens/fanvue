"use client";

import { Persona } from "@/lib/types";

type Props = {
  personas: Persona[];
  activeId: string | null;
  selectedId: string | null;
  onSelect: (p: Persona) => void;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
};

function tonePreview(v: number): string {
  if (v < 20) return "SFW";
  if (v < 45) return "Flirty";
  if (v < 70) return "Suggestive";
  if (v < 90) return "NSFW";
  return "XXX";
}

export function PersonaList({
  personas,
  activeId,
  selectedId,
  onSelect,
  onActivate,
  onDelete,
  onCreateNew,
}: Props) {
  if (!personas.length) {
    return (
      <div className="empty-state">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-2xl">
          ✦
        </div>
        <h3 className="text-lg font-semibold">No personas yet</h3>
        <p className="max-w-sm text-sm text-[var(--muted)]">
          Create your first AI creator pack. Age 21+ only. Chat, automation, and
          pricing all use this profile.
        </p>
        <button className="btn-primary" onClick={onCreateNew}>
          Create persona
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Saved profiles</h2>
        <button className="btn-secondary !py-1.5 !text-xs" onClick={onCreateNew}>
          + New
        </button>
      </div>
      <ul className="space-y-2.5">
        {personas.map((p) => {
          const selected = selectedId === p.id;
          const active = activeId === p.id;
          return (
            <li
              key={p.id}
              className={`cursor-pointer p-4 transition ${
                selected || active ? "card-glow" : "card hover:border-violet-400/40"
              } ${active ? "ring-1 ring-emerald-400/30" : ""}`}
              onClick={() => onSelect(p)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-white">
                      {p.name || "Untitled"}
                    </span>
                    <span className="badge bg-white/10 text-white/80">
                      {p.age}+
                    </span>
                    {active && (
                      <span className="badge bg-emerald-500/20 text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {p.location || "—"} · ${p.baseSubscriptionPrice}/mo
                  </p>
                  <div className="mt-2.5">
                    <div className="mb-1 flex justify-between text-[10px] text-[var(--muted)]">
                      <span>Tone</span>
                      <span className="text-violet-200">
                        {tonePreview(p.contentTone)} · {p.contentTone}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-violet-400 to-rose-400"
                        style={{ width: `${Math.min(100, p.contentTone)}%` }}
                      />
                    </div>
                  </div>
                  {p.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.tags.slice(0, 4).map((t) => (
                        <span key={t} className="badge bg-white/5 text-white/60">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className="flex shrink-0 flex-col gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!active && (
                    <button
                      className="btn-secondary !px-2 !py-1 !text-[11px]"
                      onClick={() => onActivate(p.id)}
                    >
                      Set active
                    </button>
                  )}
                  <button
                    className="btn-danger !px-2 !py-1 !text-[11px]"
                    onClick={() => {
                      if (confirm(`Delete ${p.name}?`)) onDelete(p.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
