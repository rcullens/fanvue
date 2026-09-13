import { NextRequest, NextResponse } from "next/server";
import { readStore, updateStore } from "@/lib/store";
import { generateReply } from "@/lib/chat-engine";
import { ChatMessage, MIN_AGE } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const personaId = req.nextUrl.searchParams.get("personaId");
  if (!personaId) {
    return NextResponse.json({ error: "personaId required" }, { status: 400 });
  }
  const data = await readStore();
  const session = data.chatSessions[personaId] ?? {
    personaId,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  return NextResponse.json({
    session,
    openaiConfigured: data.settings.openaiConfigured,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const personaId = String(body.personaId || "");
  const content = String(body.content || "").trim();
  const clear = Boolean(body.clear);

  if (!personaId) {
    return NextResponse.json({ error: "personaId required" }, { status: 400 });
  }

  if (clear) {
    await updateStore((store) => {
      store.chatSessions[personaId] = {
        personaId,
        messages: [],
        updatedAt: new Date().toISOString(),
      };
    });
    return NextResponse.json({ ok: true, messages: [] });
  }

  if (!content) {
    return NextResponse.json({ error: "Message content required" }, { status: 400 });
  }

  const data = await readStore();
  const persona = data.personas.find((p) => p.id === personaId);
  if (!persona) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }
  if (persona.age < MIN_AGE) {
    return NextResponse.json(
      { error: `Persona age must be ${MIN_AGE}+` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: now,
  };

  const session = data.chatSessions[personaId] ?? {
    personaId,
    messages: [],
    updatedAt: now,
  };

  const { content: reply, source } = await generateReply(
    persona,
    session.messages,
    content
  );

  const assistantMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: reply,
    createdAt: new Date().toISOString(),
  };

  await updateStore((store) => {
    const prev = store.chatSessions[personaId] ?? {
      personaId,
      messages: [],
      updatedAt: now,
    };
    store.chatSessions[personaId] = {
      personaId,
      messages: [...prev.messages, userMsg, assistantMsg].slice(-200),
      updatedAt: new Date().toISOString(),
    };
  });

  const fresh = await readStore();
  return NextResponse.json({
    messages: fresh.chatSessions[personaId].messages,
    source,
  });
}
