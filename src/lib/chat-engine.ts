/**
 * Local/mock reply engine (works without API key) + optional OpenAI-compatible API.
 * Produces human-like messages: typos, filler, emoji, uneven length, multi-bubble,
 * self-corrections, incomplete thoughts. Content tone 0–100 = SFW ↔ XXX (21+ only).
 */
import { ChatMessage, Persona } from "./types";
import { assertAdultPersona } from "./validation";

const FILLERS = [
  "um",
  "uh",
  "like",
  "you know",
  "tbh",
  "ngl",
  "lol",
  "haha",
  "hmm",
  "idk",
  "kinda",
  "sorta",
  "lowkey",
  "honestly",
  "wait",
  "omg",
  "lmao",
  "ok wait",
  "sooo",
];

const EMOJIS_SOFT = ["😊", "☺️", "💕", "✨", "🥺", "😌", "🥰", "💋", "🔥", "😏"];
const EMOJIS_HOT = ["🔥", "😈", "🥵", "💦", "😏", "🖤", "💋", "😌"];

const OPENERS = [
  "hey hey",
  "heyyy",
  "oh hey",
  "hi cutie",
  "well hello",
  "hey you",
  "hiii",
  "yo",
];

const TYPO_MAP: Record<string, string[]> = {
  the: ["teh", "th"],
  you: ["u", "ya", "yuo"],
  your: ["ur", "yor"],
  "you're": ["ur", "youre"],
  to: ["too", "ot"],
  too: ["to"],
  really: ["rly", "realy"],
  because: ["cuz", "bc", "becuz"],
  something: ["smth", "somthing"],
  with: ["w/", "wit"],
  about: ["abt", "abotu"],
  please: ["pls", "plz"],
  though: ["tho", "thogh"],
  tonight: ["2nite", "tonite"],
  okay: ["ok", "k", "okie"],
  going: ["goin", "gonna"],
  want: ["wanna", "wnat"],
  what: ["wat", "wut"],
  people: ["ppl"],
  message: ["msg"],
  somehow: ["somehow"],
  thinking: ["thinkin", "thiking"],
  right: ["rite", "righ"],
};

const MEMORY_WINDOW = 12;

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chance(p: number): boolean {
  return Math.random() < p;
}

function applyTypos(text: string, rate: number): string {
  if (rate <= 0) return text;
  return text
    .split(/(\s+)/)
    .map((token) => {
      const lower = token.toLowerCase().replace(/[^a-z']/g, "");
      if (!lower || !chance(rate * 0.55)) return token;
      const alts = TYPO_MAP[lower];
      if (alts) {
        const replacement = rand(alts);
        if (token[0] === token[0]?.toUpperCase() && /[A-Z]/.test(token[0])) {
          return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return token.replace(new RegExp(lower, "i"), replacement);
      }
      if (token.length > 3 && chance(0.35)) {
        const i = 1 + Math.floor(Math.random() * (token.length - 2));
        const chars = token.split("");
        [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
        return chars.join("");
      }
      if (token.length > 4 && chance(0.25)) {
        const i = 1 + Math.floor(Math.random() * (token.length - 2));
        return token.slice(0, i) + token.slice(i + 1);
      }
      return token;
    })
    .join("");
}

function injectFiller(text: string, rate: number): string {
  if (rate <= 0 || !chance(rate * 0.85)) return text;
  const filler = rand(FILLERS);
  if (chance(0.45)) return `${filler}... ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  if (chance(0.25)) return `${text} ${filler}`;
  const parts = text.split(" ");
  if (parts.length < 3) return `${text} ${filler}`;
  const idx = 1 + Math.floor(Math.random() * (parts.length - 1));
  parts.splice(idx, 0, filler + ",");
  return parts.join(" ");
}

function maybeEmoji(text: string, tone: number, rate: number): string {
  // Sparingly — max ~1 in 3–4 messages even at high tone
  if (!chance(0.18 + rate * 0.12 + tone / 500)) return text;
  const pool = tone >= 55 ? EMOJIS_HOT : EMOJIS_SOFT;
  if (chance(0.65)) return `${text} ${rand(pool)}`;
  return `${rand(pool)} ${text}`;
}

function maybeSelfCorrection(text: string, rate: number): string {
  if (rate < 0.08 || !chance(rate * 0.35)) return text;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) return text;
  const i = 1 + Math.floor(Math.random() * Math.min(words.length - 1, 5));
  const wrong = words[i];
  if (wrong.length < 3) return text;
  // Insert a wrong-ish word then *correction
  const garbled =
    wrong.length > 4
      ? wrong.slice(0, -1) + (wrong[wrong.length - 1] === "e" ? "a" : "e")
      : wrong + "s";
  const before = words.slice(0, i).join(" ");
  const after = words.slice(i + 1).join(" ");
  return `${before} ${garbled} *${wrong}${after ? " " + after : ""}`.trim();
}

function maybeIncompleteThought(text: string, tone: number, rate: number): string {
  // High NSFW / casual → sometimes trail off
  if (tone < 55 && rate < 0.2) return text;
  if (!chance(0.12 + (tone / 100) * 0.18 + rate * 0.15)) return text;
  const trimmed = text.replace(/[.!?]+$/, "");
  return rand([
    `${trimmed}...`,
    `${trimmed}—`,
    `${trimmed} wait`,
    `${trimmed} and like`,
    `${trimmed} nvm`,
  ]);
}

function unevenLength(sentences: string[], tone: number): string {
  if (!sentences.length) return "";
  if (chance(0.4)) return rand(sentences);
  if (chance(0.28) && sentences.length > 1) {
    return sentences
      .slice(0, 1 + Math.floor(Math.random() * Math.min(2, sentences.length)))
      .join(" ");
  }
  if (tone > 40 && chance(0.35)) return sentences.join(" ");
  return sentences.slice(0, Math.min(sentences.length, 2)).join(" ");
}

function toneLabel(tone: number): string {
  if (tone < 20) return "friendly_sfw";
  if (tone < 45) return "light_flirty";
  if (tone < 70) return "suggestive";
  if (tone < 90) return "explicit";
  return "xxx";
}

/** Recent assistant openers — avoid repeating the same greeting vibe */
function recentAssistantSnippets(history: ChatMessage[], n = MEMORY_WINDOW): string[] {
  return history
    .filter((m) => m.role === "assistant")
    .slice(-n)
    .map((m) => m.content.toLowerCase().slice(0, 48));
}

function pickOpener(history: ChatMessage[]): string {
  const recent = recentAssistantSnippets(history);
  const unused = OPENERS.filter(
    (o) => !recent.some((r) => r.startsWith(o) || r.includes(o))
  );
  return rand(unused.length ? unused : OPENERS);
}

function memoryHook(history: ChatMessage[], userText: string): string | null {
  const recentUser = history
    .filter((m) => m.role === "user")
    .slice(-MEMORY_WINDOW);
  if (recentUser.length < 2) return null;
  const prev = recentUser[recentUser.length - 2]?.content || "";
  if (prev.length < 6 || prev.length > 80) return null;
  if (!chance(0.28)) return null;
  const snippet = prev.slice(0, 42).replace(/\s+\S*$/, "");
  if (/^(hi|hey|hello|yo)\b/i.test(prev)) return null;
  // Don't echo the current message
  if (userText.toLowerCase().includes(snippet.toLowerCase().slice(0, 12))) return null;
  return rand([
    `wait you said "${snippet}..." earlier — still thinking about that`,
    `ok circling back tho — that thing about "${snippet}"`,
    `lol remembering when you said "${snippet}"`,
  ]);
}

function buildMockBeats(
  persona: Persona,
  userText: string,
  history: ChatMessage[] = []
): string[] {
  const tone = persona.contentTone;
  const band = toneLabel(tone);
  const nameBit = persona.name ? persona.name.split(" ")[0] : "me";
  const trait = (persona.personalityTraits || "warm").split(",")[0].trim();
  const hobby = (persona.hobbies || "chatting").split(",")[0].trim();
  const lower = userText.toLowerCase();

  const sfw = [
    `that's actually really sweet`,
    `tell me more, i'm listening`,
    `haha okay wait that's funny`,
    `i've been into ${hobby} lately so that tracks`,
    `you always know how to make me smile`,
    `mm i like talking to you`,
    `what else is on your mind today`,
  ];

  const flirty = [
    `you're being dangerous rn and i kind of love it`,
    `keep talking like that and i might get distracted`,
    `ok that made me bite my lip a little`,
    `flirting with me today huh... noted`,
    `i like when you say things like that`,
  ];

  const suggestive = [
    `mmm you're getting me a little worked up`,
    `if we were alone i'd be closer already`,
    `that mental image is... not helping me stay focused`,
    `you're teasing me on purpose aren't you`,
    `careful... i get playful when you talk like that`,
  ];

  const explicit = [
    `fuck that's hot... tell me exactly what you'd do`,
    `i'm already thinking about your hands on me`,
    `god yes, don't stop... i want every detail`,
    `i'd let you take your time with me tonight`,
    `mmm i'd be so wet just hearing you say that`,
  ];

  const xxx = [
    `shit yes... i want you deep and slow until i can't think`,
    `i'd drop to my knees for you without hesitating`,
    `spread me open and make me beg, i mean it`,
    `i want your cock so bad it hurts... say it again`,
    `use me however you want, i'm yours right now`,
  ];

  const pool =
    band === "friendly_sfw"
      ? sfw
      : band === "light_flirty"
        ? [...sfw, ...flirty]
        : band === "suggestive"
          ? [...flirty, ...suggestive]
          : band === "explicit"
            ? [...suggestive, ...explicit]
            : [...explicit, ...xxx];

  // Soft refusal / redirect if somehow age-related (defense in depth)
  if (/\b(teen|underage|minor|child|kid|schoolgirl|jailbait)\b/i.test(userText)) {
    return [
      "hey — i only do adult (21+) conversations. let's keep this between consenting adults, okay?",
    ];
  }

  const beats: string[] = [];
  const isGreeting = /^(hi|hey|hello|yo)\b/.test(lower) || lower.length < 8;
  const assistantCount = history.filter((m) => m.role === "assistant").length;

  if (isGreeting && assistantCount === 0) {
    beats.push(pickOpener(history));
  } else if (isGreeting && chance(0.35)) {
    // Don't always reopen with hey hey after conversation started
    beats.push(
      rand([
        `hey again`,
        `miss me already?`,
        `back already huh`,
        `mmm hi`,
      ])
    );
  }

  const hook = memoryHook(history, userText);
  if (hook) beats.push(hook);

  if (/how are you|how's it going|wyd|what are you doing/.test(lower)) {
    beats.push(
      rand([
        `pretty good actually, just vibing`,
        `better now that you're here`,
        `was thinking about ${hobby}, ngl`,
        `a little bored until you showed up`,
      ])
    );
  }

  if (/name|who are you|about you|your bio/.test(lower)) {
    beats.push(
      `i'm ${nameBit}... ${persona.bio?.slice(0, 120) || `just a ${trait} soul who likes good conversation`}`
    );
  }

  // Prefer pool lines that aren't near-duplicates of recent assistant replies
  const recent = recentAssistantSnippets(history);
  const freshPool = pool.filter(
    (line) => !recent.some((r) => r.includes(line.slice(0, 18).toLowerCase()))
  );
  beats.push(rand(freshPool.length ? freshPool : pool));

  if (chance(0.38)) {
    beats.push(
      rand([
        `what about you?`,
        `your turn`,
        `don't leave me hanging`,
        `say more`,
        `...yeah?`,
        `and then?`,
      ])
    );
  }

  return beats;
}

export function humanize(text: string, mistakeRate: number, tone: number): string {
  let out = text;
  out = injectFiller(out, mistakeRate);
  out = applyTypos(out, mistakeRate);
  out = maybeSelfCorrection(out, mistakeRate);
  if (chance(mistakeRate * 0.6)) {
    out = out.charAt(0).toLowerCase() + out.slice(1);
  }
  if (chance(0.45)) {
    out = out.replace(/\.$/, "");
  }
  if (chance(0.2)) {
    out = out.replace(/!/g, "!!");
  }
  out = maybeIncompleteThought(out, tone, mistakeRate);
  out = maybeEmoji(out, tone, mistakeRate);
  return out.trim();
}

/**
 * Split a long mock reply into 1–3 short bubbles for a multi-message feel.
 */
export function splitIntoBubbles(
  text: string,
  tone: number,
  mistakeRate: number
): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [cleaned];

  // Short replies stay single
  if (cleaned.length < 70 || !chance(0.55 + tone / 400)) {
    return [cleaned];
  }

  // Split on sentence-ish boundaries or ellipsis
  const parts = cleaned
    .split(/(?<=[.!?…])\s+|(?<=\.\.\.)\s+|(?<=—)\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    // Force a soft split mid-message for long single clauses
    if (cleaned.length > 110 && chance(0.5)) {
      const words = cleaned.split(/\s+/);
      const mid = Math.ceil(words.length / 2);
      return [
        humanize(words.slice(0, mid).join(" "), mistakeRate * 0.3, tone),
        humanize(words.slice(mid).join(" "), mistakeRate * 0.3, tone),
      ].filter(Boolean);
    }
    return [cleaned];
  }

  const maxBubbles = chance(0.25) ? 3 : 2;
  const bubbles: string[] = [];
  let buf = "";
  for (const part of parts) {
    if (!buf) {
      buf = part;
      continue;
    }
    if (bubbles.length >= maxBubbles - 1) {
      buf = `${buf} ${part}`;
      continue;
    }
    if (buf.length + part.length < 48 && chance(0.4)) {
      buf = `${buf} ${part}`;
    } else {
      bubbles.push(buf);
      buf = part;
    }
  }
  if (buf) bubbles.push(buf);

  return bubbles.slice(0, 3).map((b) => b.trim()).filter(Boolean);
}

export function estimateTypingDelayMs(text: string, bubbleCount = 1): number {
  // ~35–55ms per char, clamped; multi-bubble adds a bit between
  const base = 400 + Math.min(text.length, 220) * (35 + Math.random() * 20);
  const extra = Math.max(0, bubbleCount - 1) * (350 + Math.random() * 400);
  return Math.round(Math.min(4500, Math.max(600, base + extra)));
}

export type MockReplyResult = {
  content: string;
  bubbles: string[];
  typingMs: number;
};

export function generateMockReplyDetailed(
  persona: Persona,
  userText: string,
  history: ChatMessage[] = []
): MockReplyResult {
  assertAdultPersona(persona);
  const recent = history.slice(-MEMORY_WINDOW);
  const beats = buildMockBeats(persona, userText, recent);
  const combined = unevenLength(beats, persona.contentTone);
  const humanized = humanize(combined, persona.mistakeRate, persona.contentTone);
  const bubbles = splitIntoBubbles(
    humanized,
    persona.contentTone,
    persona.mistakeRate
  ).map((b) =>
    // Light pass per bubble so multi-bubble doesn't look copy-pasted
    chance(0.3) ? humanize(b, persona.mistakeRate * 0.25, persona.contentTone) : b
  );
  const content = bubbles.join("\n\n");
  return {
    content,
    bubbles,
    typingMs: estimateTypingDelayMs(content, bubbles.length),
  };
}

export function generateMockReply(
  persona: Persona,
  userText: string,
  history: ChatMessage[] = []
): string {
  return generateMockReplyDetailed(persona, userText, history).content;
}

function systemPrompt(persona: Persona, history: ChatMessage[]): string {
  const band = toneLabel(persona.contentTone);
  const recentAsst = history
    .filter((m) => m.role === "assistant")
    .slice(-4)
    .map((m) => m.content.slice(0, 60));
  const avoidBlock =
    recentAsst.length > 0
      ? `Avoid repeating these recent openers/phrases: ${JSON.stringify(recentAsst)}.`
      : `Vary openings — do not always start with "hey" or "hi".`;

  return [
    `You are roleplaying as ${persona.name}, age ${persona.age} (MUST remain 21+ adult).`,
    `Location: ${persona.location || "unspecified"}. Occupation: ${persona.occupation || "creator"}.`,
    `Ethnicity/background notes: ${persona.raceEthnicity || "unspecified"}.`,
    `Education: ${persona.education || "n/a"}.`,
    `Bio: ${persona.bio || "n/a"}.`,
    `Personality: ${persona.personalityTraits}.`,
    `Hobbies: ${persona.hobbies || "n/a"}. Languages: ${persona.languages || "English"}.`,
    `Appearance notes: ${persona.appearanceNotes || "n/a"}.`,
    `Voice/tone: ${persona.voiceToneNotes || "casual"}.`,
    `Content tone band: ${band} (slider ${persona.contentTone}/100).`,
    `0–20 = warm friendly SFW; 20–45 light flirty; 45–70 suggestive; 70–90 explicit adult; 90–100 very explicit XXX.`,
    `Stay in character. Sound human: occasional typos, casual grammar, filler ("lol","hmm","wait"), short uneven messages, rare emoji.`,
    `Use the last ${MEMORY_WINDOW} messages for continuity — reference prior beats lightly; never dump a catalog.`,
    avoidBlock,
    `Sometimes self-correct with *word. At high NSFW/casual, occasional incomplete thoughts ("...") are ok.`,
    `NEVER portray anyone under 21. Refuse any underage or CSAM content immediately.`,
    `This is fictional adult entertainment between consenting adults.`,
  ].join("\n");
}

export type GenerateReplyResult = {
  content: string;
  bubbles: string[];
  source: "mock" | "openai";
  typingMs: number;
};

export async function generateReply(
  persona: Persona,
  history: ChatMessage[],
  userText: string
): Promise<GenerateReplyResult> {
  assertAdultPersona(persona);

  const recent = history.slice(-MEMORY_WINDOW);
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const forceMock =
    process.env.FORCE_MOCK_ENGINE === "1" ||
    process.env.FORCE_MOCK_ENGINE === "true";

  if (!apiKey || forceMock) {
    const mock = generateMockReplyDetailed(persona, userText, recent);
    return { ...mock, source: "mock" };
  }

  try {
    const messages = [
      { role: "system", content: systemPrompt(persona, recent) },
      ...recent.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: userText },
    ];

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.95,
        max_tokens: 280,
      }),
    });

    if (!res.ok) {
      console.warn("OpenAI-compatible API error", res.status, await res.text());
      const mock = generateMockReplyDetailed(persona, userText, recent);
      return { ...mock, source: "mock" };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    let content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      const mock = generateMockReplyDetailed(persona, userText, recent);
      return { ...mock, source: "mock" };
    }
    content = humanize(content, persona.mistakeRate * 0.5, persona.contentTone);
    const bubbles = splitIntoBubbles(
      content,
      persona.contentTone,
      persona.mistakeRate * 0.5
    );
    const joined = bubbles.join("\n\n");
    return {
      content: joined,
      bubbles,
      source: "openai",
      typingMs: estimateTypingDelayMs(joined, bubbles.length),
    };
  } catch (err) {
    console.warn("OpenAI call failed, falling back to mock", err);
    const mock = generateMockReplyDetailed(persona, userText, recent);
    return { ...mock, source: "mock" };
  }
}
