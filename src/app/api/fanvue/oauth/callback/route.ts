import { NextRequest, NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  fetchAndCacheProfile,
} from "@/lib/fanvue/api";
import { getFanvueConfig } from "@/lib/fanvue/config";

export const dynamic = "force-dynamic";

function appOrigin(req: NextRequest): string {
  const cfg = getFanvueConfig();
  try {
    return new URL(cfg.redirectUri).origin;
  } catch {
    return req.nextUrl.origin;
  }
}

export async function GET(req: NextRequest) {
  const origin = appOrigin(req);
  const url = req.nextUrl;
  const err = url.searchParams.get("error");
  if (err) {
    const desc = url.searchParams.get("error_description") || err;
    return NextResponse.redirect(
      `${origin}/maintainer?oauth=error&msg=${encodeURIComponent(desc)}`
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = req.cookies.get("fv_oauth_state")?.value;
  const verifier = req.cookies.get("fv_code_verifier")?.value;

  if (!code || !state || !storedState || state !== storedState || !verifier) {
    return NextResponse.redirect(
      `${origin}/maintainer?oauth=error&msg=${encodeURIComponent(
        "Invalid OAuth state — try Connect again"
      )}`
    );
  }

  try {
    await exchangeAuthorizationCode({ code, codeVerifier: verifier });
    try {
      await fetchAndCacheProfile();
    } catch {
      /* profile cache is best-effort */
    }
    const res = NextResponse.redirect(
      `${origin}/maintainer?oauth=connected`
    );
    res.cookies.set("fv_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("fv_code_verifier", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth token exchange failed";
    const res = NextResponse.redirect(
      `${origin}/maintainer?oauth=error&msg=${encodeURIComponent(msg)}`
    );
    res.cookies.set("fv_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("fv_code_verifier", "", { path: "/", maxAge: 0 });
    return res;
  }
}
