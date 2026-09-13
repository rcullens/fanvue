"use client";

import { useCallback, useEffect, useState } from "react";
import { Persona } from "@/lib/types";
import { ChatPanel } from "@/components/ChatPanel";

export default function ChatPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/personas");
    const json = await res.json();
    setPersonas(json.personas || []);
    setActiveId(json.activePersonaId);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Chat simulation</h1>
        <p className="page-sub">
          Hyperrealistic replies · SFW↔XXX tone · local mock ($0) or free
          OpenAI-compatible providers
        </p>
      </div>
      <ChatPanel
        personas={personas}
        activePersonaId={activeId}
        onPersonaMetaChange={(p) => {
          setPersonas((list) => list.map((x) => (x.id === p.id ? p : x)));
        }}
      />
    </div>
  );
}
