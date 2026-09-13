/**
 * JSON file persistence under data/store.json.
 * Simple, reliable, no DB server required for v1.
 */
import { promises as fs } from "fs";
import path from "path";
import {
  DEFAULT_PRICING,
  Persona,
  StoreData,
  AppSettings,
  MaintainerState,
  defaultMetrics,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function defaultStore(): StoreData {
  return {
    personas: [],
    chatSessions: {},
    maintainer: {
      personaId: null,
      status: "draft",
      pricing: { ...DEFAULT_PRICING },
      metrics: defaultMetrics(),
      actionLog: [],
    },
    settings: {
      activePersonaId: null,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
  };
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readStore(): Promise<StoreData> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    parsed.settings = {
      ...parsed.settings,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    };
    return parsed;
  } catch {
    const fresh = defaultStore();
    await writeStore(fresh);
    return fresh;
  }
}

export async function writeStore(data: StoreData): Promise<void> {
  await ensureDir();
  const tmp = STORE_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, STORE_PATH);
}

export async function updateStore(
  mutator: (data: StoreData) => void | Promise<void>
): Promise<StoreData> {
  const data = await readStore();
  await mutator(data);
  await writeStore(data);
  return data;
}

export async function getPersonas(): Promise<Persona[]> {
  const data = await readStore();
  return data.personas;
}

export async function getPersona(id: string): Promise<Persona | undefined> {
  const data = await readStore();
  return data.personas.find((p) => p.id === id);
}

export async function getActivePersona(): Promise<Persona | null> {
  const data = await readStore();
  if (!data.settings.activePersonaId) return null;
  return data.personas.find((p) => p.id === data.settings.activePersonaId) ?? null;
}

export async function getSettings(): Promise<AppSettings> {
  const data = await readStore();
  return data.settings;
}

export async function getMaintainer(): Promise<MaintainerState> {
  const data = await readStore();
  return data.maintainer;
}

export { STORE_PATH, DATA_DIR };
