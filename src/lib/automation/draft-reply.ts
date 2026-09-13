/**
 * Draft reply using local mock engine ($0 default) or optional OpenAI-compatible
 * free/cheap endpoints (Ollama, Groq, Gemini compat, OpenRouter free).
 * Pitch copy: tease → soft offer → direct PPV, folded around catalog item.
 * Output: { text, ppvItemId? } — never silently sends.
 */
import { ChatMessage, Persona, PpvCatalogItem } from "../types";
import {
  generateMockReplyDetailed,
  generateReply,
  humanize,
} from "../chat-engine";
import { buildPersonaPack } from "./persona-pack";
import { PitchDecision, PitchStyle } from "./sales-policy";

export type DraftResult = {
  text: string;
  ppvItemId?: string | null;
  source: "mock" | "openai";
  pitched: boolean;
  pitchStyle?: PitchStyle;
  policyReason: string;
};

function priceLabel(item: PpvCatalogItem): string {
  return `$${(item.priceCents / 100).toFixed(2)}`;
}

function teaseLine(item: PpvCatalogItem): string {
  const hints = item.pitchHints?.trim();
  if (hints) {
    return `mm i might share something later… ${hints}`;
  }
  return rand([
    `i've got something spicy saved but i'm still deciding if you're ready`,
    `there's a little surprise in my vault… maybe later if you're good`,
    `not dumping a menu on you — just saying "${item.title}" exists 👀`,
  ]);
}

function softOfferLine(item: PpvCatalogItem): string {
  const price = priceLabel(item);
  const hints = item.pitchHints?.trim();
  if (hints) {
    return `${hints} — "${item.title}" if you want it · ${price}`;
  }
  return rand([
    `if you're curious i kept "${item.title}" just for moments like this · ${price}`,
    `wanna unlock "${item.title}"? soft drop · ${price}`,
    `i saved "${item.title}" for you… ${price} if you want a peek`,
  ]);
}

function directPpvLine(item: PpvCatalogItem): string {
  const price = priceLabel(item);
  const hints = item.pitchHints?.trim();
  if (hints) {
    return `${hints} Unlock "${item.title}" now · ${price}`;
  }
  return rand([
    `unlock "${item.title}" right now · ${price} — you won't regret it`,
    `PPV ready: "${item.title}" · ${price}. tap it`,
    `i want you to see "${item.title}" — ${price} and it's yours`,
  ]);
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function buildPitchLine(
  item: PpvCatalogItem,
  style: PitchStyle
): string {
  if (style === "tease") return teaseLine(item);
  if (style === "direct") return directPpvLine(item);
  return softOfferLine(item);
}

/**
 * Prefer mock unless OPENAI_API_KEY is set (works with any OpenAI-compatible base URL).
 * FORCE_MOCK_ENGINE=1 always stays $0.
 */
export async function draftAutomationReply(opts: {
  persona: Persona;
  history: ChatMessage[];
  inboundText: string;
  pitch: PitchDecision;
}): Promise<DraftResult> {
  const pack = buildPersonaPack(opts.persona);
  const forceMock =
    process.env.FORCE_MOCK_ENGINE === "1" ||
    process.env.FORCE_MOCK_ENGINE === "true";
  const hasKey = Boolean(process.env.OPENAI_API_KEY) && !forceMock;

  let text: string;
  let source: "mock" | "openai" = "mock";

  if (!hasKey) {
    const mock = generateMockReplyDetailed(
      opts.persona,
      opts.inboundText,
      opts.history
    );
    text = mock.content;
    source = "mock";
  } else {
    const result = await generateReply(
      opts.persona,
      opts.history,
      opts.inboundText
    );
    text = result.content;
    source = result.source;
  }

  let ppvItemId: string | null = null;
  let pitched = false;
  let pitchStyle: PitchStyle | undefined;

  if (opts.pitch.pitch) {
    pitched = true;
    ppvItemId = opts.pitch.item.id;
    pitchStyle = opts.pitch.style;
    const lower = text.toLowerCase();
    const titleLower = opts.pitch.item.title.toLowerCase();
    // Fold natural pitch if model didn't already mention the item / unlock
    if (
      !lower.includes(titleLower) &&
      !lower.includes("unlock") &&
      !/\bppv\b/.test(lower)
    ) {
      const line = buildPitchLine(opts.pitch.item, opts.pitch.style);
      // Weave — short reply + pitch as second beat (multi-bubble feel)
      text = `${text.trim()}\n\n${line}`;
      text = humanize(
        text,
        opts.persona.mistakeRate * 0.35,
        opts.persona.contentTone
      );
    }
  }

  if (text.length > 4800) text = text.slice(0, 4800);

  void pack;
  return {
    text,
    ppvItemId,
    source,
    pitched,
    pitchStyle,
    policyReason: opts.pitch.reason,
  };
}
