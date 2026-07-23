import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// Isolated SQLite file for E2E: lives under data/ (gitignored) but is a distinct
// file from the dev database (data/app.db) and is never a Turso database. The app
// reads it via the DATABASE_URL override in src/lib/db.ts. The seed step and the
// dev server are given this exact same URL so they hit the same file.
const E2E_DATABASE_URL = `file:${path.join(process.cwd(), "data", "e2e.db")}`;

/**
 * E2E harness for Training Hub. The webServer command reseeds the isolated DB and
 * only then starts `next dev`, so the server always opens an already-seeded file
 * (no stale-inode race). Strava is deliberately kept out of the loop: STRAVA_CLIENT_ID
 * and STRAVA_CLIENT_SECRET are blank, so stravaConfigured() is false and no server-side
 * Strava request is ever made — the connect UI simply shows its disconnected state.
 *
 * Strava-sync E2E (which would need a mock HTTP server) is intentionally out of scope
 * here; the Strava client in src/lib/strava.ts is covered by mocked-fetch unit tests.
 * These specs cover seeded-data read flows only.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Reset + seed the isolated DB, then boot `next dev` (fast boot; a build+start
    // is unnecessary for these read flows). Seeding runs before the server opens
    // the file, so the server never sees an empty database.
    command: `npm run e2e:seed && npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Generous timeout for seeding plus the first on-demand route compile.
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      // No valid Strava app; blank Turso creds keep every DB access local.
      STRAVA_CLIENT_ID: "",
      STRAVA_CLIENT_SECRET: "",
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      // T1.6: configure the auth boundary so the login flow can be exercised.
      // Reads stay OPEN (only mutating actions are gated), so the existing
      // read-only specs need no login; auth.spec.ts covers login/logout.
      AUTH_PASSWORD: "e2e-owner-password",
      AUTH_SECRET: "e2e-signing-secret-please-do-not-reuse",
    },
  },
});
