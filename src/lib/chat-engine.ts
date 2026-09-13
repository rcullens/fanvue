/**
 * Local/mock reply engine (works without API key) + optional OpenAI-compatible API.
 * Produces human-like messages: typos, filler, emoji, uneven length.
 * Content tone 0–100 blends SFW friendly ↔ NSFW XXX (21+ fictional only).
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
];

const EMOJIS_SOFT = ["😊", "☺️", "💕", "✨", "🥺", "😌", "🥰", "💋", "🔥", "😏"];
const EMOJIS_HOT = ["🔥", "😈", "🥵", "💦", "😏", "🖤", "💋", "😌"];

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
};

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
      // random adjacent swap
      if (token.length > 3 && chance(0.35)) {
        const i = 1 + Math.floor(Math.random() * (token.length - 2));
        const chars = token.split("");
        [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
        return chars.join("");
      }
      // drop a letter
      if (token.length > 4 && chance(0.25)) {
        const i = 1 + Math.floor(Math.random() * (token.length - 2));
        return token.slice(0, i) + token.slice(i + 1);
      }
      return token;
    })
    .join("");
}

function injectFiller(text: string, rate: number): string {
  if (rate <= 0 || !chance(rate * 0.7)) return text;
  const filler = rand(FILLERS);
  if (chance(0.5)) return `${filler}... ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  const parts = text.split(" ");
  if (parts.length < 3) return `${text} ${filler}`;
  const idx = 1 + Math.floor(Math.random() * (parts.length - 1));
  parts.splice(idx, 0, filler + ",");
  return parts.join(" ");
}

function maybeEmoji(text: string, tone: number, rate: number): string {
  if (!chance(0.25 + rate * 0.2 + tone / 400)) return text;
  const pool = tone >= 55 ? EMOJIS_HOT : EMOJIS_SOFT;
  if (chance(0.6)) return `${text} ${rand(pool)}`;
  return `${rand(pool)} ${text}`;
}

function unevenLength(sentences: string[], tone: number): string {
  // Prefer short bursts sometimes
  if (chance(0.35)) {
    return rand(sentences);
  }
  if (chance(0.25) && sentences.length > 1) {
    return sentences.slice(0, 1 + Math.floor(Math.random() * Math.min(2, sentences.length))).join(" ");
  }
  // Longer when more intimate / engaging
  if (tone > 40 && chance(0.4)) return sentences.join(" ");
  return sentences.slice(0, Math.min(sentences.length, 2)).join(" ");
}

function toneLabel(tone: number): string {
  if (tone < 20) return "friendly_sfw";
  if (tone < 45) return "light_flirty";
  if (tone < 70) return "suggestive";
  if (tone < 90) return "explicit";
  return "xxx";
}

function buildMockBeats(persona: Persona, userText: string): string[] {
  const tone = persona.contentTone;
  const band = toneLabel(tone);
  const nameBit = persona.name ? persona.name.split(" ")[0] : "me";
  const trait = (persona.personalityTraits || "warm").split(",")[0].trim();
  const hobby = (persona.hobbies || "chatting").split(",")[0].trim();
  const lower = userText.toLowerCase();

  const greetings = [
    `hey hey`,
    `heyyy`,
    `oh hey`,
    `hi cutie`,
    `well hello`,
  ];

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

  const beats: string[] = [];

  if (/^(hi|hey|hello|yo)\b/.test(lower) || lower.length < 8) {
    beats.push(rand(greetings));
  }

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

  beats.push(rand(pool));

  if (chance(0.4)) {
    beats.push(
      rand([
        `what about you?`,
        `your turn`,
        `don't leave me hanging`,
        `say more`,
        `...yeah?`,
      ])
    );
  }

  // Soft refusal / redirect if somehow age-related (defense in depth)
  if (/\b(teen|underage|minor|child|kid|schoolgirl|jailbait)\b/i.test(userText)) {
    return [
      "hey — i only do adult (21+) conversations. let's keep this between consenting adults, okay?",
    ];
  }

  return beats;
}

export function humanize(text: string, mistakeRate: number, tone: number): string {
  let out = text;
  out = injectFiller(out, mistakeRate);
  out = applyTypos(out, mistakeRate);
  // casual punctuation: sometimes drop caps / periods
  if (chance(mistakeRate * 0.6)) {
    out = out.charAt(0).toLowerCase() + out.slice(1);
  }
  if (chance(0.45)) {
    out = out.replace(/\.$/, "");
  }
  if (chance(0.2)) {
    out = out.replace(/!/g, "!!");
  }
  out = maybeEmoji(out, tone, mistakeRate);
  return out.trim();
}

export function generateMockReply(persona: Persona, userText: string): string {
  assertAdultPersona(persona);
  const beats = buildMockBeats(persona, userText);
  const combined = unevenLength(beats, persona.contentTone);
  return humanize(combined, persona.mistakeRate, persona.contentTone);
}

function systemPrompt(persona: Persona): string {
  const band = toneLabel(persona.contentTone);
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
    `Stay in character. Sound human: occasional typos, casual grammar, filler words, short uneven messages, rare emoji.`,
    `NEVER portray anyone under 21. Refuse any underage or CSAM content immediately.`,
    `This is fictional adult entertainment between consenting adults.`,
  ].join("\n");
}

export async function generateReply(
  persona: Persona,
  history: ChatMessage[],
  userText: string
): Promise<{ content: string; source: "mock" | "openai" }> {
  assertAdultPersona(persona);

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return { content: generateMockReply(persona, userText), source: "mock" };
  }

  try {
    const messages = [
      { role: "system", content: systemPrompt(persona) },
      ...history.slice(-16).map((m) => ({
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
      return { content: generateMockReply(persona, userText), source: "mock" };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    let content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { content: generateMockReply(persona, userText), source: "mock" };
    }
    // Light humanize pass even on API output
    content = humanize(content, persona.mistakeRate * 0.5, persona.contentTone);
    return { content, source: "openai" };
  } catch (err) {
    console.warn("OpenAI call failed, falling back to mock", err);
    return { content: generateMockReply(persona, userText), source: "mock" };
  }
}
