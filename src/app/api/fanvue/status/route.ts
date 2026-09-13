import { NextResponse } from "next/server";
import { getFanvueConfig } from "@/lib/fanvue/config";
import { ensureValidTokens, fanvueFetch } from "@/lib/fanvue/api";
import { loadTokens } from "@/lib/fanvue/tokens";
import { centsToDollars } from "@/lib/fanvue/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getFanvueConfig();
  const tokens = await ensureValidTokens();

  if (!tokens) {
    return NextResponse.json({
      connected: false,
      oauthConfigured: cfg.configured,
      redirectUri: cfg.redirectUri,
      scopes: cfg.scopes,
    });
  }

  let account: {
    handle?: string;
    displayName?: string;
    uuid?: string;
    subscriptionPriceDollars?: number | null;
    subscribers?: number;
    status?: string;
  } = {
    handle: tokens.profile?.handle,
    displayName: tokens.profile?.displayName,
    uuid: tokens.profile?.uuid,
  };

  try {
    const live = await fanvueFetch<{
      uuid: string;
      handle: string;
      displayName: string;
      account?: {
        status?: string;
        subscriptionPrice?: number | null;
        fans?: { subscribers?: number };
      };
    }>("/users/account");
    account = {
      uuid: live.uuid,
      handle: live.handle,
      displayName: live.displayName,
      status: live.account?.status,
      subscriptionPriceDollars:
        live.account?.subscriptionPrice != null
          ? centsToDollars(live.account.subscriptionPrice)
          : null,
      subscribers: live.account?.fans?.subscribers,
    };
  } catch {
    /* return cached profile only */
  }

  const fresh = await loadTokens();

  return NextResponse.json({
    connected: true,
    oauthConfigured: cfg.configured,
    handle: account.handle,
    displayName: account.displayName,
    uuid: account.uuid,
    status: account.status,
    subscriptionPriceDollars: account.subscriptionPriceDollars ?? null,
    subscribers: account.subscribers ?? null,
    tokenExpiresAt: fresh?.expiresAt ?? tokens.expiresAt,
    scopes: fresh?.scope || cfg.scopes,
    // never return tokens
  });
}
