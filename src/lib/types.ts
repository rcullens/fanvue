/** Fanvue AI Profile Studio — shared types. Age floor is 21 everywhere. */

export const MIN_AGE = 21;

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
}

export type ActionKind =
  | "price_sub"
  | "price_tip"
  | "price_ppv"
  | "status"
  | "note"
  | "checklist";

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
}

export interface StoreData {
  personas: Persona[];
  chatSessions: Record<string, ChatSession>;
  maintainer: MaintainerState;
  settings: AppSettings;
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
    isActive: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}
