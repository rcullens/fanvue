/**
 * Persona pack = one shared LLM/mock engine + many character packs.
 * Builds prompts from persona + tone + sales policy + PPV catalog.
 * $0 by default (mock engine); optional OpenAI-compatible free/cheap endpoints.
 */
import { Persona, PpvCatalogItem, SalesPolicy, DEFAULT_SALES_POLICY } from "../types";
import { pickPitchStyle } from "./sales-policy";

export type PersonaPack = {
  persona: Persona;
  salesPolicy: SalesPolicy;
  ppvCatalog: PpvCatalogItem[];
  systemPrompt: string;
  toneLabel: string;
  pitchStyleHint: string;
};

function toneLabel(v: number): string {
  if (v < 20) return "Friendly chat (SFW)";
  if (v < 45) return "Warm · light flirty";
  if (v < 70) return "Suggestive blend";
  if (v < 90) return "NSFW explicit";
  return "NSFW XXX";
}

function pitchStyleGuidance(tone: number): string {
  const style = pickPitchStyle(tone);
  if (style === "tease") {
    return `Pitch style: TEASE only — hint at something spicy without price-dumping. Soften heavily. Never hard-sell.`;
  }
  if (style === "soft") {
    return `Pitch style: SOFT OFFER — weave one catalog item naturally with title + light price mention. Conversational, not a menu.`;
  }
  return `Pitch style: DIRECT PPV — clear unlock ask with title + price, still human (not a bot catalog dump).`;
}

export function buildPersonaPack(persona: Persona): PersonaPack {
  const salesPolicy = {
    ...DEFAULT_SALES_POLICY,
    ...(persona.salesPolicy || {}),
    allowAutoSend: persona.salesPolicy?.allowAutoSend === true,
    minMessagesBeforePitch: Math.max(
      2,
      persona.salesPolicy?.minMessagesBeforePitch ??
        DEFAULT_SALES_POLICY.minMessagesBeforePitch
    ),
  };
  const ppvCatalog = Array.isArray(persona.ppvCatalog) ? persona.ppvCatalog : [];
  const tone = toneLabel(persona.contentTone);
  const pitchHint = pitchStyleGuidance(persona.contentTone);

  const catalogBlock =
    ppvCatalog.length === 0
      ? "No PPV catalog items. Do not invent paid media."
      : ppvCatalog
          .map(
            (i, idx) =>
              `${idx + 1}. [${i.id}] "${i.title}" — $${(i.priceCents / 100).toFixed(2)} — ${i.description}${
                i.pitchHints ? ` (hints: ${i.pitchHints})` : ""
              }`
          )
          .join("\n");

  const systemPrompt = [
    `You are roleplaying as ${persona.name}, a fictional adult creator (age ${persona.age}+, 21+ only).`,
    `Bio: ${persona.bio || "(none)"}`,
    `Personality: ${persona.personalityTraits}`,
    `Voice/tone notes: ${persona.voiceToneNotes}`,
    `Hobbies: ${persona.hobbies || "(none)"}`,
    `Content tone setting: ${persona.contentTone}/100 → ${tone}. Match that energy.`,
    `Write like a real person texting: uneven length, occasional filler (lol/hmm/wait), light typos ok (mistakeRate≈${persona.mistakeRate}), rare emoji, occasional *self-corrections.`,
    `Never break character. Never mention being an AI. Never involve minors.`,
    ``,
    `Sales policy (the policy layer decides WHETHER to pitch; you only write the line):`,
    `- max PPV offers/day: ${salesPolicy.maxPpvOffersPerDay}`,
    `- min messages before pitch: ${salesPolicy.minMessagesBeforePitch} (never first message)`,
    `- cooldown hours after offer/purchase: ${salesPolicy.cooldownHoursAfterOfferOrPurchase}`,
    `- auto-send: ${salesPolicy.allowAutoSend ? "ON" : "OFF (drafts need approval)"}`,
    salesPolicy.quietHours
      ? `- quiet hours: ${salesPolicy.quietHours.start}–${salesPolicy.quietHours.end}`
      : `- quiet hours: none`,
    pitchHint,
    ``,
    `PPV catalog:`,
    catalogBlock,
    ``,
    `If asked to include a pitch, fold ONE catalog item into natural language (title/price/hints). Do not list the catalog. Do not hard-sell every message.`,
  ].join("\n");

  return {
    persona,
    salesPolicy,
    ppvCatalog,
    systemPrompt,
    toneLabel: tone,
    pitchStyleHint: pitchHint,
  };
}
