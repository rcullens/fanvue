"use client";

import { useCallback, useEffect, useState } from "react";
import { Persona } from "@/lib/types";
import { PersonaForm } from "@/components/PersonaForm";
import { PersonaList } from "@/components/PersonaList";

export default function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Persona | null>(null);
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/personas");
    const json = await res.json();
    setPersonas(json.personas || []);
    setActiveId(json.activePersonaId);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function activate(id: string) {
    const res = await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    const json = await res.json();
    if (res.ok) {
      setPersonas(json.personas);
      setActiveId(json.activePersonaId);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/personas/${id}`, { method: "DELETE" });
    if (selected?.id === id) {
      setSelected(null);
      setMode("list");
    }
    await load();
  }

  if (loading) {
    return (
      <div className="card p-10 text-center text-sm text-[var(--muted)]">
        Loading personas…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Personas</h1>
        <p className="text-sm text-[var(--muted)]">
          Build AI creator profiles · age minimum 21 · tone & mistake rate persist
          per profile
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <PersonaList
          personas={personas}
          activeId={activeId}
          selectedId={selected?.id ?? null}
          onSelect={(p) => {
            setSelected(p);
            setMode("edit");
          }}
          onActivate={activate}
          onDelete={remove}
          onCreateNew={() => {
            setSelected(null);
            setMode("create");
          }}
        />

        <div className="card p-5 sm:p-6">
          {mode === "list" && !personas.length ? (
            <div className="py-8 text-center text-sm text-[var(--muted)]">
              Your form will appear here once you start creating.
            </div>
          ) : mode === "create" || mode === "edit" ? (
            <>
              <h2 className="mb-4 text-lg font-semibold">
                {mode === "create" ? "New persona" : `Edit · ${selected?.name}`}
              </h2>
              <PersonaForm
                initial={mode === "edit" ? selected : null}
                onCancel={() => {
                  setMode(personas.length ? "list" : "create");
                  setSelected(null);
                }}
                onSaved={async (p) => {
                  await load();
                  setSelected(p);
                  setMode("edit");
                }}
              />
            </>
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-[var(--muted)]">
                Select a persona to edit, or create a new one.
              </p>
              <button
                className="btn-primary"
                onClick={() => {
                  setSelected(null);
                  setMode("create");
                }}
              >
                Create persona
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
