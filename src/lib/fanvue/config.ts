/** Fanvue OAuth + API configuration from env (no secrets logged). */

export const FANVUE_API_VERSION = "2025-06-26";

export function getFanvueConfig() {
  const clientId =
    process.env.FANVUE_CLIENT_ID || process.env.OAUTH_CLIENT_ID || "";
  const clientSecret =
    process.env.FANVUE_CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || "";
  const redirectUri =
    process.env.FANVUE_REDIRECT_URI ||
    "https://localhost:3000/api/fanvue/oauth/callback";
  const scopes =
    process.env.FANVUE_SCOPES ||
    "openid offline_access offline read:self read:creator write:creator read:insights read:chat write:chat read:fan write:media";
  const apiBase =
    process.env.FANVUE_API_BASE_URL || "https://api.fanvue.com";
  const authBase =
    process.env.FANVUE_AUTH_BASE_URL || "https://auth.fanvue.com";
  const sessionSecret =
    process.env.SESSION_SECRET || "dev-only-change-me-fanvue-studio";

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    apiBase: apiBase.replace(/\/$/, ""),
    authBase: authBase.replace(/\/$/, ""),
    sessionSecret,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/** Fanvue subscription price bounds in cents. */
export const SUB_PRICE_CENTS_MIN = 399;
export const SUB_PRICE_CENTS_MAX = 10000;
