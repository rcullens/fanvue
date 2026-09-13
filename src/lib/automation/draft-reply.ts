/**
 * Draft reply using local mock engine ($0 default) or optional OpenAI-compatible
 * free/cheap endpoints (Ollama, Groq, Gemini compat, OpenRouter free).
 * Output: { text, ppvItemId? } — never silently sends.
 */
import { ChatMessage, Persona, PpvCatalogItem } from "../types";
import { generateMockReply, generateReply, humanize } from "../chat-engine";
import { buildPersonaPack } from "./persona-pack";
import { PitchDecision } from "./sales-policy";

export type DraftResult = {
  text: string;
  ppvItemId?: string | null;
  source: "mock" | "openai";
  pitched: boolean;
};

function softPitchLine(item: PpvCatalogItem): string {
  const price = `$${(item.priceCents / 100).toFixed(2)}`;
  const hints = item.pitchHints?.trim();
  if (hints) return `${hints} (${item.title} · ${price})`;
  return `if you want something spicier I saved "${item.title}" for you · ${price} 💕`;
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
    text = generateMockReply(opts.persona, opts.inboundText);
    source = "mock";
  } else {
    // Reuse chat-engine OpenAI-compatible path (Groq/Ollama/etc via OPENAI_BASE_URL)
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

  if (opts.pitch.pitch) {
    pitched = true;
    ppvItemId = opts.pitch.item.id;
    // Append a soft natural pitch if the model didn't already mention it
    const lower = text.toLowerCase();
    if (
      !lower.includes(opts.pitch.item.title.toLowerCase()) &&
      !lower.includes("unlock") &&
      !lower.includes("ppv")
    ) {
      text = `${text.trim()} ${softPitchLine(opts.pitch.item)}`;
      text = humanize(text, opts.persona.mistakeRate * 0.4, opts.persona.contentTone);
    }
  }

  // Keep under Fanvue 5000 char limit
  if (text.length > 4800) text = text.slice(0, 4800);

  void pack;
  return { text, ppvItemId, source, pitched };
}
