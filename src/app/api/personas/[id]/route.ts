import { NextRequest, NextResponse } from "next/server";
import { MIN_AGE, Persona } from "@/lib/types";
import { updateStore, readStore } from "@/lib/store";
import { validatePersona } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const data = await readStore();
  const persona = data.personas.find((p) => p.id === params.id);
  if (!persona) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ persona });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  const result = validatePersona(body);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  let updated: Persona | null = null;
  try {
    await updateStore((store) => {
      const idx = store.personas.findIndex((p) => p.id === params.id);
      if (idx < 0) throw new Error("NOT_FOUND");
      const prev = store.personas[idx];
      const next: Persona = {
        ...prev,
        ...result.data,
        id: prev.id,
        age: Math.max(MIN_AGE, Number(result.data.age ?? prev.age)),
        createdAt: prev.createdAt,
        updatedAt: new Date().toISOString(),
        tags: result.data.tags ?? prev.tags,
        name: String(result.data.name ?? prev.name),
        isActive: prev.isActive,
      };
      store.personas[idx] = next;
      updated = next;
    });
    return NextResponse.json({ persona: updated });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  await updateStore((store) => {
    store.personas = store.personas.filter((p) => p.id !== params.id);
    delete store.chatSessions[params.id];
    if (store.settings.activePersonaId === params.id) {
      store.settings.activePersonaId = store.personas[0]?.id ?? null;
      store.personas = store.personas.map((p, i) => ({
        ...p,
        isActive: i === 0,
      }));
    }
    if (store.maintainer.personaId === params.id) {
      store.maintainer.personaId = store.settings.activePersonaId;
    }
  });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const body = await req.json();
  const action = body.action as string;

  if (action === "activate") {
    try {
      const data = await updateStore((store) => {
        if (!store.personas.some((p) => p.id === params.id)) throw new Error("NOT_FOUND");
        store.settings.activePersonaId = params.id;
        store.personas = store.personas.map((p) => ({
          ...p,
          isActive: p.id === params.id,
          updatedAt: p.id === params.id ? new Date().toISOString() : p.updatedAt,
        }));
        store.maintainer.personaId = params.id;
      });
      return NextResponse.json({
        activePersonaId: data.settings.activePersonaId,
        personas: data.personas,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }
  }

  if (action === "tone") {
    const tone = Number(body.contentTone);
    if (!Number.isFinite(tone) || tone < 0 || tone > 100) {
      return NextResponse.json({ error: "contentTone must be 0–100" }, { status: 400 });
    }
    try {
      const data = await updateStore((store) => {
        const p = store.personas.find((x) => x.id === params.id);
        if (!p) throw new Error("NOT_FOUND");
        p.contentTone = tone;
        p.updatedAt = new Date().toISOString();
      });
      return NextResponse.json({
        persona: data.personas.find((p) => p.id === params.id),
      });
    } catch (e) {
      if (e instanceof Error && e.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
