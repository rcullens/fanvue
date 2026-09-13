import { NextRequest, NextResponse } from "next/server";
import { emptyPersona, MIN_AGE } from "@/lib/types";
import { readStore, updateStore } from "@/lib/store";
import { validatePersona } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    personas: data.personas,
    activePersonaId: data.settings.activePersonaId,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = validatePersona(body);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  const persona = emptyPersona({
    ...result.data,
    age: Math.max(MIN_AGE, Number(result.data.age)),
    isActive: false,
  });

  const data = await updateStore((store) => {
    store.personas.push(persona);
    if (!store.settings.activePersonaId) {
      store.settings.activePersonaId = persona.id;
      persona.isActive = true;
      store.personas = store.personas.map((p) =>
        p.id === persona.id ? { ...p, isActive: true } : { ...p, isActive: false }
      );
    }
  });

  const saved = data.personas.find((p) => p.id === persona.id)!;
  return NextResponse.json({ persona: saved }, { status: 201 });
}
