import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { MIN_AGE } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    activePersonaId: data.settings.activePersonaId,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    minAge: MIN_AGE,
    personaCount: data.personas.length,
  });
}
