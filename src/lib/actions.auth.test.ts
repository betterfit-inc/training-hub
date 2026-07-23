import { afterEach, describe, expect, it, vi } from "vitest";

// T1.6 — the auth boundary. Node-env unit tests. Two layers are proven here:
//
//  1. The auth primitives in ./auth (verifyPassword constant-time correctness;
//     the session sign/verify HMAC round-trip and its rejection of tampered or
//     foreign-signed tokens).
//  2. The gate itself: a MUTATING action (disconnectStravaAction stands in for
//     all 20) REJECTS an unauthenticated caller when auth is configured, and
//     ALLOWS it once a valid session cookie is present. It also proves the
//     graceful-degradation contract: with the secrets unset, auth is disabled
//     and the action runs exactly as before (this is what keeps dev/e2e green).
//
// Mirrors the actions.threshold.test.ts mocking pattern: next/* and ./db are
// stubbed; ./auth is the REAL module under test. The session cookie value is a
// mutable stub so each test controls what the request presents.

const mocks = vi.hoisted(() => ({
  session: { value: undefined as string | undefined },
  clearStravaAuth: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    // Only the session cookie is modelled; the lang cookie is absent, so dict()
    // resolves to English and the unauthorized message is the English string.
    get: (name: string) =>
      name === "th_session" && mocks.session.value !== undefined
        ? { value: mocks.session.value }
        : undefined,
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("./db", () => ({ clearStravaAuth: mocks.clearStravaAuth }));

import { disconnectStravaAction } from "./actions";
import { signSession, verifySessionToken, verifyPassword } from "./auth";
import { dictionaries } from "./i18n";

const UNAUTHORIZED = dictionaries.en.errors.unauthorized;

function configureAuth() {
  vi.stubEnv("AUTH_PASSWORD", "correct horse battery staple");
  vi.stubEnv("AUTH_SECRET", "test-signing-secret-0123456789");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.session.value = undefined;
});

describe("verifyPassword", () => {
  it("accepts the exact password and rejects a wrong one", () => {
    vi.stubEnv("AUTH_PASSWORD", "s3cret");
    expect(verifyPassword("s3cret")).toBe(true);
    expect(verifyPassword("s3cret ")).toBe(false);
    expect(verifyPassword("wrong")).toBe(false);
  });

  it("never authenticates against an unset/empty password", () => {
    vi.stubEnv("AUTH_PASSWORD", "");
    expect(verifyPassword("")).toBe(false);
    expect(verifyPassword("anything")).toBe(false);
  });
});

describe("session sign/verify round-trip", () => {
  it("verifies a token it just signed", () => {
    vi.stubEnv("AUTH_SECRET", "signing-secret");
    expect(verifySessionToken(signSession())).toBe(true);
  });

  it("rejects a tampered token, a foreign-signed token, and junk", () => {
    vi.stubEnv("AUTH_SECRET", "signing-secret");
    const token = signSession();

    // Flip the last signature character.
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifySessionToken(tampered)).toBe(false);

    // Same payload, a different secret must not verify.
    vi.stubEnv("AUTH_SECRET", "different-secret");
    expect(verifySessionToken(token)).toBe(false);

    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken("not-a-token")).toBe(false);
  });

  it("rejects any token when no secret is configured", () => {
    vi.stubEnv("AUTH_SECRET", "signing-secret");
    const token = signSession();
    vi.stubEnv("AUTH_SECRET", "");
    expect(verifySessionToken(token)).toBe(false);
  });
});

describe("mutating action gate (disconnectStravaAction)", () => {
  it("REJECTS an unauthenticated caller when auth is configured", async () => {
    configureAuth();
    mocks.session.value = undefined; // no session cookie

    const result = await disconnectStravaAction();

    expect(result).toEqual({ ok: false, error: UNAUTHORIZED });
    // The gate must short-circuit BEFORE any mutation runs.
    expect(mocks.clearStravaAuth).not.toHaveBeenCalled();
  });

  it("ALLOWS a caller presenting a valid session cookie", async () => {
    configureAuth();
    mocks.session.value = signSession(); // valid, freshly minted

    const result = await disconnectStravaAction();

    expect(result).toEqual({ ok: true });
    expect(mocks.clearStravaAuth).toHaveBeenCalledTimes(1);
  });

  it("ALLOWS everything when auth is unconfigured (graceful degradation)", async () => {
    vi.stubEnv("AUTH_PASSWORD", "");
    vi.stubEnv("AUTH_SECRET", "");
    mocks.session.value = undefined;

    const result = await disconnectStravaAction();

    expect(result).toEqual({ ok: true });
    expect(mocks.clearStravaAuth).toHaveBeenCalledTimes(1);
  });
});
