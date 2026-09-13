import { mockAdapter } from "./mock-adapter";
import { liveAdapter } from "./live-adapter";
import { FanvueClient } from "./fanvue-client";
import { MetricsSnapshot, Persona, PricingConfig } from "../types";
import { computePriceProposal } from "../pricing";

/**
 * Checklist-only adapter: always returns copyable manual steps.
 * Reuses mock metrics drift but never claims remote apply.
 */
export class ChecklistAdapter implements FanvueClient {
  readonly id = "checklist";
  readonly label = "Manual checklist export";

  async fetchMetrics(persona: Persona, pricing: PricingConfig) {
    return mockAdapter.fetchMetrics(persona, pricing);
  }

  async proposePricing(
    metrics: MetricsSnapshot,
    pricing: PricingConfig,
    persona: Persona
  ) {
    return mockAdapter.proposePricing(metrics, pricing, persona);
  }

  async applyPricing(proposal: ReturnType<typeof computePriceProposal>, persona: Persona) {
    const log = {
      id: crypto.randomUUID(),
      kind: "checklist" as const,
      summary: `Checklist generated for ${persona.name} (not auto-applied)`,
      detail: proposal.rationale,
      applied: false,
      createdAt: new Date().toISOString(),
      newValue: proposal.subPrice,
    };
    return {
      ok: true,
      remote: false,
      message:
        "Checklist ready to copy. Apply steps manually in Fanvue — nothing was written remotely.",
      log,
    };
  }

  async exportChecklist(
    persona: Persona,
    metrics: MetricsSnapshot,
    proposal: ReturnType<typeof computePriceProposal>
  ) {
    return mockAdapter.exportChecklist(persona, metrics, proposal);
  }
}

export const checklistAdapter = new ChecklistAdapter();

export function getAdapter(id: string): FanvueClient {
  if (id === "checklist") return checklistAdapter;
  if (id === "live") return liveAdapter;
  return mockAdapter;
}
