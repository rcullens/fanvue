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
      <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
        <div className="text-4xl opacity-40">✦</div>
        <h3 className="text-lg font-semibold">No personas yet</h3>
        <p className="max-w-sm text-sm text-[var(--muted)]">
          Create your first AI creator profile. Age 21+ only. You can chat-test
          and manage pricing from the other tabs.
        </p>
        <button className="btn-primary" onClick={onCreateNew}>
          Create persona
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Saved profiles</h2>
        <button className="btn-secondary !py-1.5 !text-xs" onClick={onCreateNew}>
          + New
        </button>
      </div>
      <ul className="space-y-2">
        {personas.map((p) => {
          const selected = selectedId === p.id;
          const active = activeId === p.id;
          return (
            <li
              key={p.id}
              className={`card cursor-pointer p-4 transition hover:border-violet-400/40 ${
                selected ? "border-violet-400/50 ring-1 ring-violet-400/30" : ""
              }`}
              onClick={() => onSelect(p)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{p.name || "Untitled"}</span>
                    {active && (
                      <span className="badge bg-emerald-500/20 text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {p.age} · {p.location || "—"} · ${p.baseSubscriptionPrice}/mo
                  </p>
                  {p.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="badge bg-white/5 text-white/60"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
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
