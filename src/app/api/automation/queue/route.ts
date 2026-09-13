import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { loadTokens } from "@/lib/fanvue/tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readStore();
  const tokens = await loadTokens();
  const persona =
    data.personas.find((p) => p.id === data.settings.activePersonaId) ||
    data.personas[0] ||
    null;

  return NextResponse.json({
    queue: data.automationQueue,
    log: data.automationLog.slice(0, 50),
    connected: Boolean(tokens),
    activePersona: persona
      ? {
          id: persona.id,
          name: persona.name,
          salesPolicy: persona.salesPolicy,
          ppvCatalog: persona.ppvCatalog,
          contentTone: persona.contentTone,
        }
      : null,
    personas: data.personas.map((p) => ({ id: p.id, name: p.name })),
    webhookPath: "/api/automation/webhook",
    engine: process.env.OPENAI_API_KEY && process.env.FORCE_MOCK_ENGINE !== "1"
      ? "openai-compatible"
      : "mock",
  });
}
