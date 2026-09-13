import { MetricsSnapshot, PricingConfig } from "./types";
import type { PriceProposal } from "./adapters/fanvue-client";

export type { PriceProposal };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Heuristic dynamic pricing from popularity / engagement.
 * aggressiveness 0–1 controls how far we move toward computed targets.
 */
export function computePriceProposal(
  metrics: MetricsSnapshot,
  pricing: PricingConfig
): PriceProposal {
  const pop = metrics.popularityScore / 100;
  const eng = metrics.engagementRate;
  const conv = metrics.ppvConversionRate;
  const agg = clamp(pricing.aggressiveness, 0, 1);

  const subTarget =
    pricing.minSubPrice +
    (pricing.maxSubPrice - pricing.minSubPrice) * (0.25 + pop * 0.55 + eng * 0.2);

  const tipTarget =
    pricing.minTipSuggest +
    (pricing.maxTipSuggest - pricing.minTipSuggest) * (0.15 + pop * 0.5 + eng * 0.35);

  const ppvTarget =
    pricing.minPpv +
    (pricing.maxPpv - pricing.minPpv) * (0.2 + conv * 0.45 + pop * 0.35);

  const blend = (current: number, target: number) =>
    round2(current + (target - current) * (0.15 + agg * 0.7));

  const subPrice = clamp(
    blend(metrics.currentSubPrice, subTarget),
    pricing.minSubPrice,
    pricing.maxSubPrice
  );
  const tipSuggest = clamp(
    blend(metrics.suggestedTip, tipTarget),
    pricing.minTipSuggest,
    pricing.maxTipSuggest
  );
  const ppvPrice = clamp(
    blend(metrics.suggestedPpv, ppvTarget),
    pricing.minPpv,
    pricing.maxPpv
  );

  const rationale = [
    `Popularity ${metrics.popularityScore.toFixed(0)}/100, engagement ${(eng * 100).toFixed(0)}%, PPV conv ${(conv * 100).toFixed(0)}%.`,
    `Aggressiveness ${(agg * 100).toFixed(0)}% → sub $${subPrice}, tip $${tipSuggest}, PPV $${ppvPrice}.`,
  ].join(" ");

  return { subPrice, tipSuggest, ppvPrice, rationale };
}

/** Drift simulated metrics over time for the mock dashboard. */
export function driftMetrics(
  prev: MetricsSnapshot,
  baseSubPrice: number
): MetricsSnapshot {
  const jitter = (n: number, scale: number) => n + (Math.random() - 0.5) * scale;
  const subscriberCount = Math.max(
    0,
    Math.round(jitter(prev.subscriberCount, 6) + (Math.random() > 0.55 ? 1 : -1))
  );
  const engagementRate = clamp(jitter(prev.engagementRate, 0.04), 0.05, 0.95);
  const messagesPerDay = Math.max(10, Math.round(jitter(prev.messagesPerDay, 18)));
  const tipRevenue7d = round2(Math.max(0, jitter(prev.tipRevenue7d, 28)));
  const ppvConversionRate = clamp(jitter(prev.ppvConversionRate, 0.03), 0.02, 0.6);
  const popularityScore = clamp(
    jitter(
      0.35 * (subscriberCount / Math.max(1, subscriberCount + 40)) * 100 +
        engagementRate * 40 +
        ppvConversionRate * 30 +
        Math.min(30, tipRevenue7d / 20),
      4
    ),
    5,
    98
  );

  return {
    subscriberCount,
    engagementRate: round2(engagementRate),
    messagesPerDay,
    tipRevenue7d,
    ppvConversionRate: round2(ppvConversionRate),
    popularityScore: round2(popularityScore),
    currentSubPrice: prev.currentSubPrice || baseSubPrice,
    suggestedTip: prev.suggestedTip,
    suggestedPpv: prev.suggestedPpv,
    updatedAt: new Date().toISOString(),
  };
}
