/**
 * Live Fanvue OAuth adapter — real reads + real subscription-price writes.
 * Never claims remote success unless the API responds ok.
 */
import { FanvueClient, PriceProposal } from "./fanvue-client";
import { ActionLogEntry, MetricsSnapshot, Persona, PricingConfig } from "../types";
import { computePriceProposal } from "../pricing";
import {
  SUB_PRICE_CENTS_MAX,
  SUB_PRICE_CENTS_MIN,
  centsToDollars,
  dollarsToCents,
} from "../fanvue/config";
import { FanvueApiError, fanvueFetch } from "../fanvue/api";
import { loadTokens } from "../fanvue/tokens";

type AccountResponse = {
  uuid: string;
  handle: string;
  displayName: string;
  account?: {
    status?: string;
    subscriptionPrice?: number | null;
    earnings?: { total?: number; availableBalance?: number };
    fans?: { followers?: number; subscribers?: number };
  };
  fanCounts?: { followersCount?: number; subscribersCount?: number };
  likesCount?: number;
};

type EarningsSummary = {
  totals?: {
    period?: {
      gross?: number;
      net?: number;
      bySource?: Record<string, { gross?: number; net?: number }>;
    };
    allTime?: { gross?: number; net?: number };
  };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class LiveFanvueAdapter implements FanvueClient {
  readonly id = "live";
  readonly label = "Live Fanvue (OAuth API)";

  async fetchMetrics(
    persona: Persona,
    pricing: PricingConfig
  ): Promise<MetricsSnapshot> {
    void pricing;
    const tokens = await loadTokens();
    if (!tokens) {
      throw new Error("Connect Fanvue OAuth before using the Live adapter");
    }

    const account = await fanvueFetch<AccountResponse>("/users/account");
    const subCents = account.account?.subscriptionPrice ?? null;
    const currentSubPrice =
      subCents != null
        ? centsToDollars(subCents)
        : persona.baseSubscriptionPrice;

    const subscriberCount =
      account.account?.fans?.subscribers ??
      account.fanCounts?.subscribersCount ??
      0;

    const followers =
      account.account?.fans?.followers ??
      account.fanCounts?.followersCount ??
      0;

    let tipRevenue7d = 0;
    const partialNotes: string[] = [];
    let dataSource: MetricsSnapshot["dataSource"] = "live";

    try {
      const end = new Date();
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const summary = await fanvueFetch<EarningsSummary>(
        `/insights/earnings/summary?startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`
      );
      const bySource = summary.totals?.period?.bySource || {};
      const tip =
        bySource.tip?.gross ??
        bySource.tips?.gross ??
        bySource.TIP?.gross ??
        0;
      // Earnings are in cents
      tipRevenue7d = centsToDollars(Number(tip) || 0);
      if (!tip) {
        // Fall back to period gross fraction as soft signal
        const periodGross = summary.totals?.period?.gross;
        if (periodGross != null) {
          tipRevenue7d = centsToDollars(Number(periodGross) * 0.15);
          partialNotes.push("tip revenue estimated from period earnings");
          dataSource = "live-partial";
        }
      }
    } catch {
      partialNotes.push("insights unavailable — using profile + account only");
      dataSource = "live-partial";
    }

    // Soft engagement / popularity proxies from live counts (not Fanvue official scores)
    const engagementRate = round2(
      Math.min(0.9, 0.12 + Math.log10(Math.max(1, subscriberCount) + 1) * 0.12)
    );
    const popularityScore = round2(
      Math.min(
        95,
        20 +
          Math.min(40, subscriberCount / 5) +
          Math.min(20, followers / 20) +
          engagementRate * 25
      )
    );

    const messagesPerDay = Math.max(
      5,
      Math.round(subscriberCount * 0.8 + followers * 0.05)
    );

    return {
      subscriberCount,
      engagementRate,
      messagesPerDay,
      tipRevenue7d: round2(tipRevenue7d),
      ppvConversionRate: 0.1,
      popularityScore,
      currentSubPrice,
      suggestedTip: persona.baseSubscriptionPrice > 15 ? 15 : 10,
      suggestedPpv: round2(Math.max(4.99, currentSubPrice * 1.2)),
      updatedAt: new Date().toISOString(),
      dataSource,
      liveLabel:
        partialNotes.length > 0
          ? `Live (@${account.handle}) · ${partialNotes.join("; ")}`
          : `Live Fanvue · @${account.handle}`,
    };
  }

  async proposePricing(
    metrics: MetricsSnapshot,
    pricing: PricingConfig,
    persona: Persona
  ): Promise<PriceProposal> {
    void persona;
    const proposal = computePriceProposal(metrics, pricing);
    // Keep within Fanvue hard bounds ($3.99–$100.00)
    const minBound = Math.max(pricing.minSubPrice, centsToDollars(SUB_PRICE_CENTS_MIN));
    const maxBound = Math.min(pricing.maxSubPrice, centsToDollars(SUB_PRICE_CENTS_MAX));
    const subPrice = Math.min(maxBound, Math.max(minBound, proposal.subPrice));
    return {
      ...proposal,
      subPrice: round2(subPrice),
      rationale: `${proposal.rationale} Seeded from live sub $${metrics.currentSubPrice.toFixed(2)}.${
        metrics.liveLabel ? ` (${metrics.liveLabel})` : ""
      }`,
    };
  }

  async applyPricing(
    proposal: PriceProposal,
    persona: Persona
  ): Promise<{ ok: boolean; remote: boolean; message: string; log: ActionLogEntry }> {
    const tokens = await loadTokens();
    if (!tokens) {
      const log: ActionLogEntry = {
        id: crypto.randomUUID(),
        kind: "price_sub",
        summary: `Live apply blocked — not connected`,
        applied: false,
        createdAt: new Date().toISOString(),
        newValue: proposal.subPrice,
      };
      return {
        ok: false,
        remote: false,
        message: "Connect Fanvue before applying live pricing.",
        log,
      };
    }

    let cents = dollarsToCents(proposal.subPrice);
    cents = Math.min(SUB_PRICE_CENTS_MAX, Math.max(SUB_PRICE_CENTS_MIN, cents));

    try {
      const result = await fanvueFetch<{
        subscriptionPrice: number;
        subscribersMovedToReOptIn: boolean;
      }>("/users/me/subscription-price", {
        method: "PATCH",
        body: JSON.stringify({
          subscriptionPrice: cents,
          forceOptIn: false,
        }),
      });

      const appliedDollars = centsToDollars(result.subscriptionPrice);
      const reOpt = result.subscribersMovedToReOptIn;
      const log: ActionLogEntry = {
        id: crypto.randomUUID(),
        kind: "price_sub",
        summary: `Live Fanvue sub → $${appliedDollars.toFixed(2)}${
          reOpt ? " (subscribers moved to re-opt-in)" : ""
        }`,
        detail: JSON.stringify(result),
        applied: true,
        createdAt: new Date().toISOString(),
        oldValue: persona.baseSubscriptionPrice,
        newValue: appliedDollars,
      };
      return {
        ok: true,
        remote: true,
        message: reOpt
          ? `Live price updated to $${appliedDollars.toFixed(2)}. Existing subscribers were moved to re-opt-in (price increase).`
          : `Live price updated to $${appliedDollars.toFixed(2)} on Fanvue.`,
        log,
      };
    } catch (err) {
      const msg =
        err instanceof FanvueApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Live price update failed";
      const log: ActionLogEntry = {
        id: crypto.randomUUID(),
        kind: "price_sub",
        summary: `Live apply FAILED for ${persona.name}`,
        detail: msg,
        applied: false,
        createdAt: new Date().toISOString(),
        newValue: proposal.subPrice,
      };
      return {
        ok: false,
        remote: false,
        message: `Fanvue rejected the price change: ${msg}`,
        log,
      };
    }
  }

  async exportChecklist(
    persona: Persona,
    metrics: MetricsSnapshot,
    proposal: PriceProposal
  ): Promise<string> {
    return [
      `# Fanvue live checklist — ${persona.name}`,
      ``,
      `Generated: ${new Date().toISOString()}`,
      `Adapter: live (OAuth)`,
      `Source: ${metrics.liveLabel || metrics.dataSource || "live"}`,
      ``,
      `## Live metrics snapshot`,
      `- Subscribers: ${metrics.subscriberCount}`,
      `- Current sub: $${metrics.currentSubPrice}`,
      `- Tips (7d proxy): $${metrics.tipRevenue7d}`,
      ``,
      `## Proposed`,
      `- Subscription: $${proposal.subPrice}`,
      `- Tip suggest: $${proposal.tipSuggest}`,
      `- PPV: $${proposal.ppvPrice}`,
      `- ${proposal.rationale}`,
      ``,
      `## Notes`,
      `- Subscription price can be applied via PATCH /users/me/subscription-price when connected.`,
      `- Price INCREASES move existing subscribers to re-opt-in (forceOptIn=false default).`,
      `- Tip/PPV menus may still need manual Fanvue UI updates.`,
    ].join("\n");
  }
}

export const liveAdapter = new LiveFanvueAdapter();
