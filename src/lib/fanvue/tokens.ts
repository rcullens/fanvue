/**
 * Server-side Fanvue token persistence.
 * Tokens encrypted at rest under data/fanvue-tokens.json (gitignored).
 * OAuth PKCE state uses short-lived httpOnly cookies.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getFanvueConfig } from "./config";

const DATA_DIR = path.join(process.cwd(), "data");
const TOKEN_PATH = path.join(DATA_DIR, "fanvue-tokens.json");

export type FanvueTokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope?: string;
  tokenType?: string;
  /** Cached profile snapshot (no secrets) */
  profile?: {
    uuid: string;
    handle: string;
    displayName: string;
    isCreator?: boolean;
    isAiCreator?: boolean;
  };
};

type EncryptedFile = {
  iv: string;
  tag: string;
  ciphertext: string;
};

function deriveKey(): Buffer {
  const { sessionSecret } = getFanvueConfig();
  return createHash("sha256").update(sessionSecret).digest();
}

function encrypt(plaintext: string): EncryptedFile {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: enc.toString("base64"),
  };
}

function decrypt(payload: EncryptedFile): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadTokens(): Promise<FanvueTokenBundle | null> {
  try {
    await ensureDir();
    const raw = await fs.readFile(TOKEN_PATH, "utf8");
    const parsed = JSON.parse(raw) as EncryptedFile;
    const json = decrypt(parsed);
    return JSON.parse(json) as FanvueTokenBundle;
  } catch {
    return null;
  }
}

export async function saveTokens(bundle: FanvueTokenBundle): Promise<void> {
  await ensureDir();
  const payload = encrypt(JSON.stringify(bundle));
  const tmp = TOKEN_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, TOKEN_PATH);
}

export async function clearTokens(): Promise<void> {
  try {
    await fs.unlink(TOKEN_PATH);
  } catch {
    /* missing is fine */
  }
}

export function isAccessTokenFresh(
  bundle: FanvueTokenBundle,
  bufferMs = 5 * 60 * 1000
): boolean {
  return Date.now() + bufferMs < bundle.expiresAt;
}
