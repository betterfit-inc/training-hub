import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, stravaConfigured } from "@/lib/strava";

export async function GET(request: NextRequest) {
  if (!stravaConfigured()) {
    return NextResponse.redirect(new URL("/settings?error=missing_env", request.url));
  }
  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAuthorizeUrl(request.nextUrl.origin, state));
  response.cookies.set("strava_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
