import { NextRequest, NextResponse } from "next/server";
import { readStore, updateStore } from "@/lib/store";
import { getAdapter } from "@/lib/adapters/checklist-export";
import { DEFAULT_PRICING, defaultMetrics } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adapterId = req.nextUrl.searchParams.get("adapter") || "mock";
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const data = await readStore();
  const personaId =
    data.maintainer.personaId || data.settings.activePersonaId || data.personas[0]?.id;
  const persona = data.personas.find((p) => p.id === personaId) ?? null;
  const adapter = getAdapter(adapterId);

  let metrics = data.maintainer.metrics;
  let liveError: string | null = null;
  if (persona && (refresh || !metrics)) {
    try {
      metrics = await adapter.fetchMetrics(persona, data.maintainer.pricing);
      await updateStore((store) => {
        store.maintainer.metrics = metrics;
        store.maintainer.personaId = persona.id;
      });
    } catch (err) {
      liveError = err instanceof Error ? err.message : "Failed to fetch metrics";
      if (adapterId === "live") {
        return NextResponse.json({
          maintainer: {
            ...data.maintainer,
            personaId: persona?.id ?? null,
            metrics: data.maintainer.metrics,
          },
          persona,
          proposal: null,
          adapter: { id: adapter.id, label: adapter.label },
          adapters: [
            { id: "mock", label: "Mock adapter (simulated metrics)" },
            { id: "checklist", label: "Manual checklist export" },
            { id: "live", label: "Live Fanvue (OAuth API)" },
          ],
          liveError,
        });
      }
      throw err;
    }
  }

  const proposal = persona
    ? await adapter.proposePricing(metrics, data.maintainer.pricing, persona)
    : null;

  return NextResponse.json({
    maintainer: {
      ...data.maintainer,
      personaId: persona?.id ?? null,
      metrics,
    },
    persona,
    proposal,
    liveError,
    adapter: { id: adapter.id, label: adapter.label },
    adapters: [
      { id: "mock", label: "Mock adapter (simulated metrics)" },
      { id: "checklist", label: "Manual checklist export" },
      { id: "live", label: "Live Fanvue (OAuth API)" },
    ],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = String(body.action || "");
  const adapterId = String(body.adapter || "mock");
  const adapter = getAdapter(adapterId);

  if (action === "update_pricing_config") {
    const data = await updateStore((store) => {
      store.maintainer.pricing = {
        ...store.maintainer.pricing,
        ...body.pricing,
      };
      store.maintainer.actionLog.unshift({
        id: crypto.randomUUID(),
        kind: "note",
        summary: "Pricing config updated",
        detail: JSON.stringify(body.pricing),
        applied: true,
        createdAt: new Date().toISOString(),
      });
      store.maintainer.actionLog = store.maintainer.actionLog.slice(0, 100);
    });
    return NextResponse.json({ maintainer: data.maintainer });
  }

  if (action === "set_status") {
    const status = body.status as "draft" | "active" | "paused" | "review";
    const data = await updateStore((store) => {
      store.maintainer.status = status;
      store.maintainer.actionLog.unshift({
        id: crypto.randomUUID(),
        kind: "status",
        summary: `Status → ${status}`,
        applied: true,
        createdAt: new Date().toISOString(),
        newValue: status,
      });
    });
    return NextResponse.json({ maintainer: data.maintainer });
  }

  if (action === "refresh_metrics") {
    const data = await readStore();
    const personaId =
      body.personaId ||
      data.maintainer.personaId ||
      data.settings.activePersonaId ||
      data.personas[0]?.id;
    const persona = data.personas.find((p) => p.id === personaId);
    if (!persona) {
      return NextResponse.json({ error: "No persona" }, { status: 400 });
    }
    const metrics = await adapter.fetchMetrics(persona, data.maintainer.pricing);
    const updated = await updateStore((store) => {
      store.maintainer.metrics = metrics;
      store.maintainer.personaId = persona.id;
      store.maintainer.actionLog.unshift({
        id: crypto.randomUUID(),
        kind: "note",
        summary: `Metrics refreshed (${adapter.id})`,
        applied: true,
        createdAt: new Date().toISOString(),
      });
      store.maintainer.actionLog = store.maintainer.actionLog.slice(0, 100);
    });
    const proposal = await adapter.proposePricing(
      metrics,
      updated.maintainer.pricing,
      persona
    );
    return NextResponse.json({
      maintainer: updated.maintainer,
      proposal,
      persona,
    });
  }

  if (action === "apply_pricing") {
    const data = await readStore();
    const personaId =
      body.personaId ||
      data.maintainer.personaId ||
      data.settings.activePersonaId;
    const persona = data.personas.find((p) => p.id === personaId);
    if (!persona) {
      return NextResponse.json({ error: "No persona" }, { status: 400 });
    }
    const proposal =
      body.proposal ||
      (await adapter.proposePricing(
        data.maintainer.metrics,
        data.maintainer.pricing,
        persona
      ));

    const result = await adapter.applyPricing(proposal, persona);

    const updated = await updateStore((store) => {
      // Only mutate local prices when the adapter reports success
      if (result.ok) {
        store.maintainer.metrics = {
          ...store.maintainer.metrics,
          currentSubPrice: proposal.subPrice,
          suggestedTip: proposal.tipSuggest,
          suggestedPpv: proposal.ppvPrice,
          updatedAt: new Date().toISOString(),
        };
        // Sync persona base price when mock or successful live apply
        if (adapterId === "mock" || (adapterId === "live" && result.remote)) {
          const p = store.personas.find((x) => x.id === persona.id);
          if (p) {
            p.baseSubscriptionPrice = proposal.subPrice;
            p.updatedAt = new Date().toISOString();
          }
        }
      }
      store.maintainer.actionLog.unshift(result.log);
      if (result.ok) {
        store.maintainer.actionLog.unshift({
          id: crypto.randomUUID(),
          kind: "price_tip",
          summary: `Tip suggest → $${proposal.tipSuggest}`,
          applied: result.log.applied && !result.remote,
          createdAt: new Date().toISOString(),
          newValue: proposal.tipSuggest,
        });
        store.maintainer.actionLog.unshift({
          id: crypto.randomUUID(),
          kind: "price_ppv",
          summary: `PPV → $${proposal.ppvPrice}`,
          applied: result.log.applied && !result.remote,
          createdAt: new Date().toISOString(),
          newValue: proposal.ppvPrice,
        });
      }
      store.maintainer.actionLog = store.maintainer.actionLog.slice(0, 100);
    });

    return NextResponse.json({
      result,
      maintainer: updated.maintainer,
      proposal,
    });
  }

  if (action === "export_checklist") {
    const data = await readStore();
    const personaId =
      body.personaId ||
      data.maintainer.personaId ||
      data.settings.activePersonaId;
    const persona = data.personas.find((p) => p.id === personaId);
    if (!persona) {
      return NextResponse.json({ error: "No persona" }, { status: 400 });
    }
    const proposal =
      body.proposal ||
      (await adapter.proposePricing(
        data.maintainer.metrics,
        data.maintainer.pricing,
        persona
      ));
    const checklist = await adapter.exportChecklist(
      persona,
      data.maintainer.metrics,
      proposal
    );
    await updateStore((store) => {
      store.maintainer.actionLog.unshift({
        id: crypto.randomUUID(),
        kind: "checklist",
        summary: "Checklist exported",
        applied: false,
        createdAt: new Date().toISOString(),
      });
    });
    return NextResponse.json({ checklist, proposal });
  }

  if (action === "reset_defaults") {
    const data = await updateStore((store) => {
      store.maintainer.pricing = { ...DEFAULT_PRICING };
      store.maintainer.metrics = defaultMetrics(
        store.personas.find((p) => p.id === store.settings.activePersonaId)
          ?.baseSubscriptionPrice ?? 9.99
      );
      store.maintainer.status = "draft";
      store.maintainer.actionLog.unshift({
        id: crypto.randomUUID(),
        kind: "note",
        summary: "Maintainer reset to defaults",
        applied: true,
        createdAt: new Date().toISOString(),
      });
    });
    return NextResponse.json({ maintainer: data.maintainer });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
