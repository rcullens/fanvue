/**
 * Policy layer: reply-only vs reply+PPV. Never pitch when blocked.
 * LLM writes the line; this module decides IF a pitch is allowed.
 */
import {
  FanSalesState,
  Persona,
  PpvCatalogItem,
  SalesPolicy,
  DEFAULT_SALES_POLICY,
} from "../types";

export type PitchDecision =
  | { pitch: false; reason: string }
  | { pitch: true; item: PpvCatalogItem; reason: string };

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function inQuietHours(policy: SalesPolicy, now = new Date()): boolean {
  const q = policy.quietHours;
  if (!q?.start || !q?.end) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = parseHm(q.start);
  const end = parseHm(q.end);
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  // wraps midnight
  return mins >= start || mins < end;
}

export function getSalesPolicy(persona: Persona): SalesPolicy {
  return {
    ...DEFAULT_SALES_POLICY,
    ...(persona.salesPolicy || {}),
    allowAutoSend: persona.salesPolicy?.allowAutoSend === true,
  };
}

export function decidePitch(opts: {
  persona: Persona;
  fanState: FanSalesState | undefined;
  catalog: PpvCatalogItem[];
  now?: Date;
}): PitchDecision {
  const policy = getSalesPolicy(opts.persona);
  const now = opts.now || new Date();
  const catalog = (opts.catalog || []).filter((i) => i.priceCents >= 300);

  if (!catalog.length) {
    return { pitch: false, reason: "Empty PPV catalog" };
  }
  if (inQuietHours(policy, now)) {
    return { pitch: false, reason: "Quiet hours — reply only" };
  }

  const day = todayKey(now);
  const state = opts.fanState;
  const messageCount = state?.messageCount ?? 0;
  const offersToday =
    state && state.offersDayKey === day ? state.offersToday : 0;

  if (messageCount < policy.minMessagesBeforePitch) {
    return {
      pitch: false,
      reason: `Need ${policy.minMessagesBeforePitch} messages before pitch (have ${messageCount})`,
    };
  }
  if (offersToday >= policy.maxPpvOffersPerDay) {
    return {
      pitch: false,
      reason: `Hit max PPV offers today (${policy.maxPpvOffersPerDay})`,
    };
  }

  const last =
    state?.lastOfferAt || state?.lastPurchaseAt
      ? new Date(
          Math.max(
            state.lastOfferAt ? Date.parse(state.lastOfferAt) : 0,
            state.lastPurchaseAt ? Date.parse(state.lastPurchaseAt) : 0
          )
        )
      : null;
  if (last) {
    const hours = (now.getTime() - last.getTime()) / 3600000;
    if (hours < policy.cooldownHoursAfterOfferOrPurchase) {
      return {
        pitch: false,
        reason: `Cooldown (${policy.cooldownHoursAfterOfferOrPurchase}h) still active`,
      };
    }
  }

  // Rotate through catalog by offer count
  const item = catalog[offersToday % catalog.length];
  return {
    pitch: true,
    item,
    reason: `Policy allows pitch → ${item.title}`,
  };
}

export function bumpFanMessage(
  prev: FanSalesState | undefined,
  fanUserUuid: string
): FanSalesState {
  return {
    fanUserUuid,
    messageCount: (prev?.messageCount ?? 0) + 1,
    offersToday: prev?.offersToday ?? 0,
    offersDayKey: prev?.offersDayKey || todayKey(),
    lastOfferAt: prev?.lastOfferAt,
    lastPurchaseAt: prev?.lastPurchaseAt,
  };
}

export function bumpFanOffer(
  prev: FanSalesState,
  at = new Date()
): FanSalesState {
  const day = todayKey(at);
  const offersToday = prev.offersDayKey === day ? prev.offersToday + 1 : 1;
  return {
    ...prev,
    offersToday,
    offersDayKey: day,
    lastOfferAt: at.toISOString(),
  };
}
