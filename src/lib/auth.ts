// The auth boundary (T1.6) — single-owner, password login with a signed-cookie
// session. This is the chokepoint the identity seam (src/lib/identity.ts)
// anticipated: the mutating server actions call requireAuth() here to reject
// unauthenticated callers.
//
// SERVER-ONLY. It reads secrets from the environment and touches request cookies
// (node:crypto + next/headers make it unusable from a client bundle); it must
// never be imported into a "use client" module.
//
// GRACEFUL DEGRADATION — auth is DISABLED unless BOTH secrets are set. When
// AUTH_PASSWORD or AUTH_SECRET is unset/empty (local dev, the current e2e run),
// authConfigured() is false and isAuthenticated()/requireAuth() return true, so
// behaviour is exactly as it was before this boundary existed. PRODUCTION MUST
// set AUTH_PASSWORD and AUTH_SECRET (Vercel project env) to enforce the gate;
// with them unset the app is wide open by design, not by accident.
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { constantTimeEqual } from "./crypto";

/** Session cookie name. Also read by the action-level tests. */
export const SESSION_COOKIE = "th_session";

// 30 days. The cookie's own expiry is the session lifetime; a changed AUTH_SECRET
// invalidates every outstanding token immediately (the signature stops matching).
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

/**
 * Auth is enforced only when BOTH secrets are present. One-without-the-other is
 * treated as unconfigured (auth disabled) so a half-set environment never signs
 * a session against an empty secret. See the module header.
 */
export function authConfigured(): boolean {
  return Boolean(process.env.AUTH_PASSWORD) && Boolean(process.env.AUTH_SECRET);
}

/**
 * Owner-password check, constant-time (reuses the T3.9 timing-safe comparison).
 * Returns false when AUTH_PASSWORD is unset/empty — never authenticate against
 * an empty secret.
 */
export function verifyPassword(input: string): boolean {
  const password = process.env.AUTH_PASSWORD ?? "";
  if (!password) return false;
  return constantTimeEqual(input, password);
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Mint a session token: `owner.<issuedAtMs>.<hmac-sha256>` signed with
 * AUTH_SECRET. The issued-at makes each login's token distinct; the HMAC is what
 * proves authenticity. Exported for the sign/verify round-trip test.
 */
export function signSession(): string {
  const secret = process.env.AUTH_SECRET ?? "";
  const payload = `owner.${Date.now()}`;
  return `${payload}.${hmac(payload, secret)}`;
}

/**
 * Verify a session token against AUTH_SECRET. Returns false for a missing/empty
 * secret, a malformed token, a tampered/foreign-signed value, OR a token whose
 * issued-at is older than SESSION_MAX_AGE_S — the cookie's `maxAge` is only a
 * client hint, so expiry must be enforced server-side here (this is the single
 * chokepoint isAuthenticated/requireAuth and the proxy all go through).
 * Exported for the round-trip test.
 */
export function verifySessionToken(token: string | undefined): boolean {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret || !token) return false;
  // Structure: exactly `owner.<issuedAtMs>.<hmac>` — the hmac is hex and the
  // issued-at is a number, so neither introduces a dot. Anything else is bogus.
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [prefix, issuedAtRaw, signature] = parts;
  const payload = `${prefix}.${issuedAtRaw}`;
  if (!constantTimeEqual(signature, hmac(payload, secret))) return false;
  // Signature is authentic; now enforce expiry. issuedAt is in ms (Date.now),
  // SESSION_MAX_AGE_S is in seconds. Reject a non-numeric issued-at defensively.
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt <= SESSION_MAX_AGE_S * 1000;
}

/** Set the signed session cookie (login). httpOnly, lax, secure in production. */
export async function createSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(), {
    httpOnly: true,
    sameSite: "lax",
    // Mirror the T3.9 cookie hardening: secure on the prod https deployment,
    // non-secure on local http dev so the flow still works.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/** Clear the session cookie (logout). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Is the current caller an authenticated owner? When auth is unconfigured this
 * returns true (auth disabled — see the module header); otherwise it reads the
 * session cookie and verifies its signature.
 */
export async function isAuthenticated(): Promise<boolean> {
  if (!authConfigured()) return true;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/**
 * The authorization chokepoint the mutating server actions call. Today it simply
 * resolves to isAuthenticated(); page-level gating (middleware redirecting
 * unauthenticated reads to /login) would hook the same check. Named to mirror
 * identity.ts's requireAthlete(). Returns true when the caller may proceed.
 */
export async function requireAuth(): Promise<boolean> {
  return isAuthenticated();
}
