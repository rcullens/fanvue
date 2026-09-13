import { NextRequest, NextResponse } from "next/server";
import { readStore, updateStore } from "@/lib/store";
import { DEFAULT_SALES_POLICY, MIN_PPV_CENTS, PpvCatalogItem, SalesPolicy } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const personaId = req.nextUrl.searchParams.get("personaId");
  const data = await readStore();
  const persona =
    data.personas.find((p) => p.id === (personaId || data.settings.activePersonaId)) ||
    data.personas[0];
  if (!persona) {
    return NextResponse.json({ error: "No persona" }, { status: 404 });
  }
  return NextResponse.json({
    personaId: persona.id,
    name: persona.name,
    salesPolicy: persona.salesPolicy || DEFAULT_SALES_POLICY,
    ppvCatalog: persona.ppvCatalog || [],
    contentTone: persona.contentTone,
    mistakeRate: persona.mistakeRate,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const personaId = String(body.personaId || "");
  const data = await readStore();
  const targetId =
    personaId || data.settings.activePersonaId || data.personas[0]?.id;
  if (!targetId) {
    return NextResponse.json({ error: "No persona" }, { status: 400 });
  }

  let salesPolicy: SalesPolicy | undefined;
  if (body.salesPolicy) {
    const sp = body.salesPolicy;
    salesPolicy = {
      maxPpvOffersPerDay: Math.max(0, Math.min(50, Number(sp.maxPpvOffersPerDay) || 0)),
      minMessagesBeforePitch: Math.max(0, Math.min(100, Number(sp.minMessagesBeforePitch) || 0)),
      cooldownHoursAfterOfferOrPurchase: Math.max(
        0,
        Math.min(168, Number(sp.cooldownHoursAfterOfferOrPurchase) || 0)
      ),
      allowAutoSend: sp.allowAutoSend === true,
      quietHours:
        sp.quietHours?.start && sp.quietHours?.end
          ? { start: String(sp.quietHours.start), end: String(sp.quietHours.end) }
          : undefined,
    };
  }

  let ppvCatalog: PpvCatalogItem[] | undefined;
  if (Array.isArray(body.ppvCatalog)) {
    ppvCatalog = body.ppvCatalog
      .map((item: PpvCatalogItem) => ({
        id: String(item.id || crypto.randomUUID()),
        title: String(item.title || "").trim().slice(0, 120),
        description: String(item.description || "").trim().slice(0, 500),
        priceCents: Math.max(
          MIN_PPV_CENTS,
          Math.round(Number(item.priceCents) || MIN_PPV_CENTS)
        ),
        mediaUuids: Array.isArray(item.mediaUuids)
          ? item.mediaUuids.map(String).slice(0, 20)
          : undefined,
        pitchHints: item.pitchHints
          ? String(item.pitchHints).trim().slice(0, 240)
          : undefined,
      }))
      .filter((i: PpvCatalogItem) => i.title)
      .slice(0, 40);
  }

  const updated = await updateStore((store) => {
    const p = store.personas.find((x) => x.id === targetId);
    if (!p) return;
    if (salesPolicy) p.salesPolicy = salesPolicy;
    if (ppvCatalog) p.ppvCatalog = ppvCatalog;
    p.updatedAt = new Date().toISOString();
  });

  const persona = updated.personas.find((p) => p.id === targetId)!;
  return NextResponse.json({
    ok: true,
    personaId: persona.id,
    salesPolicy: persona.salesPolicy,
    ppvCatalog: persona.ppvCatalog,
  });
}
