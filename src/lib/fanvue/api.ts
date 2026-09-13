/**
 * Authenticated Fanvue API client with proactive refresh + single 401 retry.
 * Uses client_secret_basic on the token endpoint (required by Fanvue).
 */
import {
  FANVUE_API_VERSION,
  getFanvueConfig,
} from "./config";
import {
  FanvueTokenBundle,
  clearTokens,
  isAccessTokenFresh,
  loadTokens,
  saveTokens,
} from "./tokens";

let refreshLock: Promise<FanvueTokenBundle | null> | null = null;

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function exchangeAuthorizationCode(opts: {
  code: string;
  codeVerifier: string;
}): Promise<FanvueTokenBundle> {
  const cfg = getFanvueConfig();
  if (!cfg.configured) {
    throw new Error("Fanvue OAuth is not configured (missing client id/secret)");
  }

  const res = await fetch(`${cfg.authBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: cfg.redirectUri,
      code_verifier: opts.codeVerifier,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Token exchange failed (${res.status})`
    );
  }

  const bundle: FanvueTokenBundle = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
    scope: json.scope,
    tokenType: json.token_type,
  };
  await saveTokens(bundle);
  return bundle;
}

async function refreshAccessToken(
  current: FanvueTokenBundle
): Promise<FanvueTokenBundle> {
  const cfg = getFanvueConfig();
  if (!cfg.configured) {
    throw new Error("Fanvue OAuth is not configured");
  }

  const res = await fetch(`${cfg.authBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    await clearTokens();
    throw new Error(
      json.error_description ||
        json.error ||
        `Token refresh failed (${res.status}) — reconnect Fanvue`
    );
  }

  const bundle: FanvueTokenBundle = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || current.refreshToken,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
    scope: json.scope || current.scope,
    tokenType: json.token_type || current.tokenType,
    profile: current.profile,
  };
  await saveTokens(bundle);
  return bundle;
}

export async function ensureValidTokens(): Promise<FanvueTokenBundle | null> {
  const current = await loadTokens();
  if (!current) return null;
  if (isAccessTokenFresh(current)) return current;

  if (!refreshLock) {
    refreshLock = refreshAccessToken(current)
      .catch(() => null)
      .finally(() => {
        refreshLock = null;
      });
  }
  return refreshLock;
}

export class FanvueApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function fanvueFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  retried = false
): Promise<T> {
  const cfg = getFanvueConfig();
  let tokens = await ensureValidTokens();
  if (!tokens) {
    throw new FanvueApiError("Not connected to Fanvue", 401, null);
  }

  const url = path.startsWith("http") ? path : `${cfg.apiBase}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${tokens.accessToken}`,
    "X-Fanvue-API-Version": FANVUE_API_VERSION,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && !retried) {
    const fresh = await loadTokens();
    if (fresh) {
      try {
        tokens = await refreshAccessToken(fresh);
      } catch {
        throw new FanvueApiError("Fanvue session expired", 401, null);
      }
      return fanvueFetch<T>(path, init, true);
    }
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      (body as { message?: string; error?: string })?.message ||
      (body as { error?: string })?.error ||
      `Fanvue API ${res.status} on ${path}`;
    throw new FanvueApiError(msg, res.status, body);
  }

  return body as T;
}

export async function fetchAndCacheProfile(): Promise<FanvueTokenBundle["profile"]> {
  const me = await fanvueFetch<{
    uuid: string;
    handle: string;
    displayName: string;
    isCreator?: boolean;
    isAiCreator?: boolean;
  }>("/users/me");

  const tokens = await loadTokens();
  if (tokens) {
    tokens.profile = {
      uuid: me.uuid,
      handle: me.handle,
      displayName: me.displayName,
      isCreator: me.isCreator,
      isAiCreator: me.isAiCreator,
    };
    await saveTokens(tokens);
  }
  return tokens?.profile ?? {
    uuid: me.uuid,
    handle: me.handle,
    displayName: me.displayName,
    isCreator: me.isCreator,
    isAiCreator: me.isAiCreator,
  };
}
