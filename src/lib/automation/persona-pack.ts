/**
 * Persona pack = one shared LLM/mock engine + many character packs.
 * Builds prompts from persona + tone + sales policy + PPV catalog.
 * $0 by default (mock engine); optional OpenAI-compatible free/cheap endpoints.
 */
import { Persona, PpvCatalogItem, SalesPolicy, DEFAULT_SALES_POLICY } from "../types";

export type PersonaPack = {
  persona: Persona;
  salesPolicy: SalesPolicy;
  ppvCatalog: PpvCatalogItem[];
  systemPrompt: string;
  toneLabel: string;
};

function toneLabel(v: number): string {
  if (v < 20) return "Friendly chat (SFW)";
  if (v < 45) return "Warm · light flirty";
  if (v < 70) return "Suggestive blend";
  if (v < 90) return "NSFW explicit";
  return "NSFW XXX";
}

export function buildPersonaPack(persona: Persona): PersonaPack {
  const salesPolicy = {
    ...DEFAULT_SALES_POLICY,
    ...(persona.salesPolicy || {}),
    allowAutoSend: persona.salesPolicy?.allowAutoSend === true,
  };
  const ppvCatalog = Array.isArray(persona.ppvCatalog) ? persona.ppvCatalog : [];
  const tone = toneLabel(persona.contentTone);

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
    `Write like a real person texting: uneven length, occasional filler, light typos ok (mistakeRate≈${persona.mistakeRate}).`,
    `Never break character. Never mention being an AI. Never involve minors.`,
    ``,
    `Sales policy (the policy layer decides WHETHER to pitch; you only write the line):`,
    `- max PPV offers/day: ${salesPolicy.maxPpvOffersPerDay}`,
    `- min messages before pitch: ${salesPolicy.minMessagesBeforePitch}`,
    `- cooldown hours after offer/purchase: ${salesPolicy.cooldownHoursAfterOfferOrPurchase}`,
    `- auto-send: ${salesPolicy.allowAutoSend ? "ON" : "OFF (drafts need approval)"}`,
    salesPolicy.quietHours
      ? `- quiet hours: ${salesPolicy.quietHours.start}–${salesPolicy.quietHours.end}`
      : `- quiet hours: none`,
    ``,
    `PPV catalog:`,
    catalogBlock,
    ``,
    `If asked to include a soft pitch, weave ONE catalog item naturally. Do not hard-sell every message.`,
  ].join("\n");

  return {
    persona,
    salesPolicy,
    ppvCatalog,
    systemPrompt,
    toneLabel: tone,
  };
}
