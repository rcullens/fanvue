"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatMessage, Persona } from "@/lib/types";
import { ToneSlider } from "./ToneSlider";

type Props = {
  personas: Persona[];
  activePersonaId: string | null;
  onPersonaMetaChange?: (p: Persona) => void;
};

export function ChatPanel({ personas, activePersonaId, onPersonaMetaChange }: Props) {
  const [personaId, setPersonaId] = useState<string | null>(activePersonaId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<"mock" | "openai" | null>(null);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const persona = personas.find((p) => p.id === personaId) ?? null;

  useEffect(() => {
    if (activePersonaId) setPersonaId(activePersonaId);
    else if (personas[0]) setPersonaId(personas[0].id);
  }, [activePersonaId, personas]);

  useEffect(() => {
    if (!personaId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/chat?personaId=${personaId}`);
      const json = await res.json();
      if (!cancelled) {
        setMessages(json.session?.messages || []);
        setOpenaiConfigured(Boolean(json.openaiConfigured));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personaId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!personaId || !input.trim() || busy) return;
    const content = input.trim();
    setInput("");
    setBusy(true);
    const optimistic: ChatMessage = {
      id: "tmp-" + Date.now(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, content }),
      });
      const json = await res.json();
      if (res.ok) {
        setMessages(json.messages);
        setSource(json.source);
      } else {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        alert(json.error || "Chat failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function clearChat() {
    if (!personaId) return;
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId, clear: true }),
    });
    setMessages([]);
    setSource(null);
  }

  async function updateTone(v: number) {
    if (!persona) return;
    const res = await fetch(`/api/personas/${persona.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tone", contentTone: v }),
    });
    const json = await res.json();
    if (res.ok && json.persona) onPersonaMetaChange?.(json.persona);
  }

  if (!personas.length) {
    return (
      <div className="empty-state">
        <div className="text-4xl opacity-40">💬</div>
        <h3 className="text-lg font-semibold">No persona to chat with</h3>
        <p className="text-sm text-[var(--muted)]">
          Create a 21+ AI creator profile in Personas first. Local mock engine
          works with $0 — no API key needed.
        </p>
        <a href="/personas" className="btn-primary">
          Go to Personas
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4">
        <div className="card p-4">
          <label className="label">Active chat persona</label>
          <select
            className="input"
            value={personaId || ""}
            onChange={(e) => setPersonaId(e.target.value)}
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.age}+)
              </option>
            ))}
          </select>
          {persona && (
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              {persona.bio || persona.personalityTraits || "No bio yet."}
            </p>
          )}
        </div>

        {persona && <ToneSlider value={persona.contentTone} onChange={updateTone} />}

        <div className="card space-y-2 p-4 text-xs text-[var(--muted)]">
          <div className="flex justify-between">
            <span>Reply engine</span>
            <span className="text-white/80">
              {openaiConfigured ? "OpenAI-compatible" : "Local mock ($0)"}
            </span>
          </div>
          {source && (
            <div className="flex justify-between">
              <span>Last reply</span>
              <span className="text-violet-200">{source}</span>
            </div>
          )}
          {persona && (
            <div className="flex justify-between">
              <span>Mistake rate</span>
              <span>{Math.round(persona.mistakeRate * 100)}%</span>
            </div>
          )}
          <p className="pt-1 leading-relaxed">
            Default is free local mock. Optional free/cheap endpoints via{" "}
            <code className="text-violet-200">OPENAI_BASE_URL</code> (Ollama,
            Groq, Gemini compat).
          </p>
        </div>
      </aside>

      <div className="card flex h-[min(72vh,720px)] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">
              {persona?.name || "Chat"} · hyperrealistic sim
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              Occasional typos · filler · emoji · uneven length
            </p>
          </div>
          <button className="btn-secondary !py-1.5 !text-xs" onClick={clearChat}>
            Clear
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!messages.length && (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-[var(--muted)]">
              <p className="text-base text-white/80">Say hi — the bot replies in character.</p>
              <p className="mt-1 text-xs">Adult (21+) roleplay only · mock engine is free</p>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  m.role === "user" ? "chat-bubble-user" : "chat-bubble-bot"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="chat-bubble-bot flex items-center gap-1.5 !py-3">
                <span className="typing-dot" />
                <span className="typing-dot [animation-delay:150ms]" />
                <span className="typing-dot [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
          <input
            className="input flex-1"
            placeholder="Message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button className="btn-primary" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
