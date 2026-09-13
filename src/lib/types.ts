/** Fanvue AI Profile Studio — shared types. Age floor is 21 everywhere. */

export const MIN_AGE = 21;
/** Fanvue chat PPV minimum (cents). */
export const MIN_PPV_CENTS = 300;

export interface PpvCatalogItem {
  id: string;
  title: string;
  description: string;
  /** Price in USD cents; Fanvue message PPV min 300 ($3.00) */
  priceCents: number;
  mediaUuids?: string[];
  /** Local studio video job that produced this clip */
  videoJobId?: string;
  pitchHints?: string;
}

export interface QuietHours {
  /** "HH:MM" 24h local-ish (studio clock) */
  start: string;
  end: string;
}

export interface SalesPolicy {
  maxPpvOffersPerDay: number;
  minMessagesBeforePitch: number;
  cooldownHoursAfterOfferOrPurchase: number;
  /** Default false — safer; queue for approval */
  allowAutoSend: boolean;
  quietHours?: QuietHours;
}

export const DEFAULT_SALES_POLICY: SalesPolicy = {
  maxPpvOffersPerDay: 3,
  minMessagesBeforePitch: 2,
  cooldownHoursAfterOfferOrPurchase: 12,
  allowAutoSend: false,
};

export interface Persona {
  id: string;
  name: string;
  age: number;
  raceEthnicity: string;
  location: string;
  education: string;
  occupation: string;
  bio: string;
  personalityTraits: string;
  hobbies: string;
  languages: string;
  appearanceNotes: string;
  voiceToneNotes: string;
  baseSubscriptionPrice: number;
  tags: string[];
  /** 0 = Friendly SFW, 100 = NSFW XXX */
  contentTone: number;
  /** 0–1 probability of typos/filler in mock replies */
  mistakeRate: number;
  /** PPV offers the automation worker can attach */
  ppvCatalog: PpvCatalogItem[];
  /** When/whether to pitch PPV + auto-send */
  salesPolicy: SalesPolicy;
  /** Relative path under data/media for talking-head portrait */
  portraitPath?: string;
  /** Preferred free TTS voice id (edge-tts) */
  voiceId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface ChatSession {
  personaId: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface PricingConfig {
  minSubPrice: number;
  maxSubPrice: number;
  minTipSuggest: number;
  maxTipSuggest: number;
  minPpv: number;
  maxPpv: number;
  aggressiveness: number; // 0–1
  autoAdjustEnabled: boolean;
}

export interface MetricsSnapshot {
  subscriberCount: number;
  engagementRate: number; // 0–1
  messagesPerDay: number;
  tipRevenue7d: number;
  ppvConversionRate: number; // 0–1
  popularityScore: number; // 0–100
  currentSubPrice: number;
  suggestedTip: number;
  suggestedPpv: number;
  updatedAt: string;
  dataSource?: "mock" | "live" | "live-partial";
  liveLabel?: string;
}

export type ActionKind =
  | "price_sub"
  | "price_tip"
  | "price_ppv"
  | "status"
  | "note"
  | "checklist"
  | "automation";

export interface ActionLogEntry {
  id: string;
  kind: ActionKind;
  summary: string;
  detail?: string;
  applied: boolean;
  createdAt: string;
  oldValue?: number | string;
  newValue?: number | string;
}

export interface MaintainerState {
  personaId: string | null;
  status: "draft" | "active" | "paused" | "review";
  pricing: PricingConfig;
  metrics: MetricsSnapshot;
  actionLog: ActionLogEntry[];
}

export interface AppSettings {
  activePersonaId: string | null;
  openaiConfigured: boolean;
  /** Prefer mock ($0) unless explicitly using a free/cheap OpenAI-compatible endpoint */
  replyEngine: "mock" | "openai-compatible";
}

export type AutomationQueueStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "sent"
  | "failed";

export interface AutomationQueueItem {
  id: string;
  personaId: string;
  fanUserUuid: string;
  fanHandle?: string;
  fanDisplayName?: string;
  inboundText: string;
  draftText: string;
  ppvItemId?: string | null;
  ppvPriceCents?: number | null;
  ppvMediaUuids?: string[];
  /** Why pitched / why not — from sales policy */
  policyReason?: string;
  /** tease | soft | direct when pitched */
  pitchStyle?: "tease" | "soft" | "direct";
  status: AutomationQueueStatus;
  mode: "mock" | "live";
  source: "webhook" | "manual" | "unread-pull" | "simulate";
  error?: string;
  remoteMessageUuid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLogEntry {
  id: string;
  kind: "draft" | "send" | "reject" | "policy_block" | "webhook" | "run" | "error";
  summary: string;
  detail?: string;
  queueId?: string;
  createdAt: string;
}

export interface FanSalesState {
  fanUserUuid: string;
  messageCount: number;
  offersToday: number;
  offersDayKey: string; // YYYY-MM-DD
  lastOfferAt?: string;
  lastPurchaseAt?: string;
}


export type VideoJobStatus = "pending" | "running" | "done" | "failed";

export type VideoProviderId = "local-ffmpeg" | "external-cli" | "replicate";

export interface VideoJob {
  id: string;
  personaId: string;
  script: string;
  status: VideoJobStatus;
  provider: VideoProviderId;
  providerLabel?: string;
  voiceId?: string;
  ttsEngine?: "edge-tts" | "espeak-ng" | "silence-placeholder";
  audioPath?: string;
  videoPath?: string;
  error?: string;
  fanvueMediaUuid?: string;
  fanvueMediaStatus?: string;
  ppvCatalogItemId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  personas: Persona[];
  chatSessions: Record<string, ChatSession>;
  maintainer: MaintainerState;
  settings: AppSettings;
  automationQueue: AutomationQueueItem[];
  automationLog: AutomationLogEntry[];
  /** Per-fan sales counters for policy */
  fanSales: Record<string, FanSalesState>;
  /** Lifelike video bot render jobs */
  videoJobs: VideoJob[];
}

export const DEFAULT_PRICING: PricingConfig = {
  minSubPrice: 4.99,
  maxSubPrice: 29.99,
  minTipSuggest: 5,
  maxTipSuggest: 100,
  minPpv: 3.99,
  maxPpv: 49.99,
  aggressiveness: 0.4,
  autoAdjustEnabled: true,
};

export function defaultMetrics(basePrice = 9.99): MetricsSnapshot {
  return {
    subscriberCount: 42,
    engagementRate: 0.38,
    messagesPerDay: 120,
    tipRevenue7d: 186.5,
    ppvConversionRate: 0.12,
    popularityScore: 55,
    currentSubPrice: basePrice,
    suggestedTip: 10,
    suggestedPpv: 12.99,
    updatedAt: new Date().toISOString(),
    dataSource: "mock",
  };
}

export function emptyPersona(partial?: Partial<Persona>): Persona {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    age: MIN_AGE,
    raceEthnicity: "",
    location: "",
    education: "",
    occupation: "",
    bio: "",
    personalityTraits: "warm, witty, curious",
    hobbies: "",
    languages: "English",
    appearanceNotes: "",
    voiceToneNotes: "casual, playful, conversational",
    baseSubscriptionPrice: 9.99,
    tags: [],
    contentTone: 25,
    mistakeRate: 0.18,
    ppvCatalog: [],
    salesPolicy: { ...DEFAULT_SALES_POLICY },
    isActive: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Migrate older store personas missing pack fields */
export function normalizePersona(p: Persona): Persona {
  return {
    ...emptyPersona(),
    ...p,
    ppvCatalog: Array.isArray(p.ppvCatalog) ? p.ppvCatalog : [],
    salesPolicy: {
      ...DEFAULT_SALES_POLICY,
      ...(p.salesPolicy || {}),
      allowAutoSend: p.salesPolicy?.allowAutoSend === true,
    },
  };
}
