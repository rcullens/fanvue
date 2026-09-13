import { FanvueClient, PriceProposal } from "./fanvue-client";
import { ActionLogEntry, MetricsSnapshot, Persona, PricingConfig } from "../types";
import { computePriceProposal, driftMetrics } from "../pricing";

export class MockFanvueAdapter implements FanvueClient {
  readonly id = "mock";
  readonly label = "Mock adapter (simulated metrics)";

  private lastMetrics: MetricsSnapshot | null = null;

  async fetchMetrics(
    persona: Persona,
    pricing: PricingConfig
  ): Promise<MetricsSnapshot> {
    void pricing;
    const base = this.lastMetrics ?? {
      subscriberCount: 42 + Math.floor(Math.random() * 20),
      engagementRate: 0.35,
      messagesPerDay: 110,
      tipRevenue7d: 150,
      ppvConversionRate: 0.11,
      popularityScore: 52,
      currentSubPrice: persona.baseSubscriptionPrice,
      suggestedTip: 10,
      suggestedPpv: 12.99,
      updatedAt: new Date().toISOString(),
    };
    const next = driftMetrics(base, persona.baseSubscriptionPrice);
    this.lastMetrics = next;
    return next;
  }

  async proposePricing(
    metrics: MetricsSnapshot,
    pricing: PricingConfig,
    persona: Persona
  ): Promise<PriceProposal> {
    void persona;
    return computePriceProposal(metrics, pricing);
  }

  async applyPricing(
    proposal: PriceProposal,
    persona: Persona
  ): Promise<{ ok: boolean; remote: boolean; message: string; log: ActionLogEntry }> {
    if (this.lastMetrics) {
      this.lastMetrics = {
        ...this.lastMetrics,
        currentSubPrice: proposal.subPrice,
        suggestedTip: proposal.tipSuggest,
        suggestedPpv: proposal.ppvPrice,
        updatedAt: new Date().toISOString(),
      };
    }
    const log: ActionLogEntry = {
      id: crypto.randomUUID(),
      kind: "price_sub",
      summary: `Mock-applied prices for ${persona.name}`,
      detail: proposal.rationale,
      applied: true,
      createdAt: new Date().toISOString(),
      oldValue: persona.baseSubscriptionPrice,
      newValue: proposal.subPrice,
    };
    return {
      ok: true,
      remote: false,
      message:
        "Prices updated in local mock state only. No Fanvue API write was performed.",
      log,
    };
  }

  async exportChecklist(
    persona: Persona,
    metrics: MetricsSnapshot,
    proposal: PriceProposal
  ): Promise<string> {
    return [
      `# Fanvue manual checklist — ${persona.name}`,
      ``,
      `Generated: ${new Date().toISOString()}`,
      `Adapter: mock (export only — you apply these in Fanvue UI)`,
      ``,
      `## Current simulated metrics`,
      `- Subscribers: ${metrics.subscriberCount}`,
      `- Engagement: ${(metrics.engagementRate * 100).toFixed(1)}%`,
      `- Popularity: ${metrics.popularityScore}/100`,
      `- Messages/day: ${metrics.messagesPerDay}`,
      `- Tip revenue (7d): $${metrics.tipRevenue7d}`,
      ``,
      `## Proposed prices`,
      `- Subscription: $${proposal.subPrice} (was $${metrics.currentSubPrice})`,
      `- Tip suggestion: $${proposal.tipSuggest}`,
      `- PPV: $${proposal.ppvPrice}`,
      `- Rationale: ${proposal.rationale}`,
      ``,
      `## Steps in Fanvue`,
      `1. Open Fanvue creator dashboard → AI bots / profile settings.`,
      `2. Confirm persona "${persona.name}" is selected and age is ${persona.age}+ (21+ required).`,
      `3. Set subscription price to $${proposal.subPrice}.`,
      `4. Update tip menu / suggested tips to around $${proposal.tipSuggest}.`,
      `5. Set default PPV price to $${proposal.ppvPrice}.`,
      `6. Review bio/tags: ${(persona.tags || []).join(", ") || "(none)"}.`,
      `7. Save and spot-check a subscriber-facing preview.`,
      ``,
      `Note: This studio does not write to Fanvue remotely in v1.`,
    ].join("\n");
  }
}

export const mockAdapter = new MockFanvueAdapter();
