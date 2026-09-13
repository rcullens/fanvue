/**
 * Pluggable FanvueClient interface.
 * Adapters: mock, checklist, live (OAuth). Live never fakes remote success.
 */
import {
  ActionLogEntry,
  MetricsSnapshot,
  PricingConfig,
  Persona,
} from "../types";

export interface PriceProposal {
  subPrice: number;
  tipSuggest: number;
  ppvPrice: number;
  rationale: string;
}

export interface FanvueClient {
  readonly id: string;
  readonly label: string;
  /** Fetch current metrics for a persona (mock or remote). */
  fetchMetrics(persona: Persona, pricing: PricingConfig): Promise<MetricsSnapshot>;
  /** Propose price changes — does NOT apply remotely in mock mode. */
  proposePricing(
    metrics: MetricsSnapshot,
    pricing: PricingConfig,
    persona: Persona
  ): Promise<PriceProposal>;
  /**
   * Apply pricing. Mock records locally; a real client would call Fanvue.
   * Must never fake successful remote writes.
   */
  applyPricing(
    proposal: PriceProposal,
    persona: Persona
  ): Promise<{ ok: boolean; remote: boolean; message: string; log: ActionLogEntry }>;
  /** Export human checklist steps for manual Fanvue ops. */
  exportChecklist(
    persona: Persona,
    metrics: MetricsSnapshot,
    proposal: PriceProposal
  ): Promise<string>;
}

export type AdapterId = "mock" | "checklist" | "live";
