import { NextResponse } from "next/server";
import { clearTokens } from "@/lib/fanvue/tokens";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearTokens();
  return NextResponse.json({ ok: true, connected: false });
}
