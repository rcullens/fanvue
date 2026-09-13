import { NextResponse } from "next/server";
import { getFanvueConfig } from "@/lib/fanvue/config";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
} from "@/lib/fanvue/pkce";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getFanvueConfig();
  if (!cfg.configured) {
    return NextResponse.json(
      {
        error:
          "Fanvue OAuth not configured. Set FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET (or OAUTH_*) and FANVUE_REDIRECT_URI in .env.local.",
      },
      { status: 500 }
    );
  }

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateOAuthState();

  const authUrl = new URL(`${cfg.authBase}/oauth2/auth`);
  authUrl.searchParams.set("client_id", cfg.clientId);
  authUrl.searchParams.set("redirect_uri", cfg.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", cfg.scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(authUrl.toString());
  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  res.cookies.set("fv_oauth_state", state, cookieOpts);
  res.cookies.set("fv_code_verifier", verifier, cookieOpts);
  return res;
}
