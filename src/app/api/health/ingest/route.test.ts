import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

// Drives the REAL ingest route + db.ts client + migrations against an ISOLATED
// local sqlite file (never Turso), matching the db.*.test.ts harness: env is set
// BEFORE the dynamic import so the client singleton builds from it, and TURSO_*
// is cleared because makeClient() prefers it over DATABASE_URL.
const dbFile = path.join(os.tmpdir(), `training-hub-ingest-${process.pid}-${Date.now()}.db`);
const SECRET = "test-ingest-secret";

let route: typeof import("./route");
let db: typeof import("@/lib/db");

/** A minimal NextRequest: the handler only reads `.headers.get()` and `.json()`. */
function post(body: unknown, token?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  const request = new Request("http://localhost/api/health/ingest", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return request as unknown as NextRequest;
}

const SNAPSHOT = {
  date: "2026-07-20",
  source: "garmin",
  sleep: { totalMin: 452, deepMin: 78 },
  hrv: { overnightAvgMs: 61, status: "balanced" },
  restingHr: 47,
};

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  route = await import("./route");
  db = await import("@/lib/db");
});

beforeEach(() => {
  process.env.HEALTH_INGEST_SECRET = SECRET;
});

afterAll(() => {
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

describe("POST /api/health/ingest", () => {
  it("returns 503 when no ingest secret is configured", async () => {
    delete process.env.HEALTH_INGEST_SECRET;
    const res = await route.POST(post(SNAPSHOT, SECRET));
    expect(res.status).toBe(503);
  });

  it("returns 401 for a missing or wrong token", async () => {
    expect((await route.POST(post(SNAPSHOT))).status).toBe(401);
    expect((await route.POST(post(SNAPSHOT, "wrong"))).status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await route.POST(post("{not json", SECRET));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed date or unknown source", async () => {
    expect((await route.POST(post({ source: "garmin" }, SECRET))).status).toBe(400);
    expect((await route.POST(post({ date: "2026-07-20", source: "whoop" }, SECRET))).status).toBe(
      400
    );
  });

  it("accepts a valid snapshot and persists resolved rows", async () => {
    const res = await route.POST(post(SNAPSHOT, SECRET));
    expect(res.status).toBe(200);
    const rows = await db.getHealthMetricsForDate("2026-07-20");
    const byMetric = new Map(rows.map((r) => [r.metric, r]));
    expect(byMetric.get("resting_hr")?.value).toBe(47);
    expect(byMetric.get("resting_hr")?.source).toBe("garmin");
    expect(byMetric.get("hrv_status")?.value_text).toBe("BALANCED");
  });

  it("is idempotent: re-posting a day overwrites that day+source in place", async () => {
    await route.POST(post({ ...SNAPSHOT, restingHr: 47, steps: 9000 }, SECRET));
    const first = await db.getHealthMetricsForDate("2026-07-20");
    const firstGarmin = first.filter((r) => r.source === "garmin").length;

    // Re-post the same day with a changed value and one fewer metric.
    await route.POST(post({ date: "2026-07-20", source: "garmin", restingHr: 45 }, SECRET));
    const second = await db.getHealthMetricsForDate("2026-07-20");
    const secondGarmin = second.filter((r) => r.source === "garmin");
    expect(secondGarmin.find((r) => r.metric === "resting_hr")?.value).toBe(45);
    // steps dropped out of the second snapshot, so its stale row is gone too.
    expect(secondGarmin.find((r) => r.metric === "steps")).toBeUndefined();
    expect(secondGarmin.length).toBeLessThan(firstGarmin);
  });

  it("keeps a manual row when a device re-sync replaces only its own source", async () => {
    await db.upsertHealthMetrics([
      {
        date: "2026-07-20",
        metric: "resting_hr",
        value: 52,
        value_text: null,
        unit: "bpm",
        source: "manual",
        recorded_at: "2026-07-20T07:00:00.000Z",
      },
    ]);
    await route.POST(post({ date: "2026-07-20", source: "garmin", restingHr: 44 }, SECRET));
    const rows = await db.getHealthMetricsForDate("2026-07-20");
    const rhr = rows.filter((r) => r.metric === "resting_hr");
    expect(rhr.find((r) => r.source === "manual")?.value).toBe(52);
    expect(rhr.find((r) => r.source === "garmin")?.value).toBe(44);
  });
});
