import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// G3.6: SQLite has no boolean type, so `is_race` (and any other flag) is stored
// as 0/1. `sqliteBool` is the single decode used at the db.ts read seam so the
// domain type can carry a real `boolean`. This is a pure unit test in the default
// node environment.
//
// db.ts builds its client singleton from env at import time, so point it at an
// isolated temp file (never Turso, never the dev db) before importing. No query
// runs here — only the pure helper is exercised. TURSO_* is cleared first
// because makeClient() prefers TURSO_DATABASE_URL over DATABASE_URL.
let sqliteBool: (typeof import("./db"))["sqliteBool"];

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${path.join(os.tmpdir(), `training-hub-bool-${process.pid}.db`)}`;
  ({ sqliteBool } = await import("./db"));
});

describe("sqliteBool decodes SQLite integer booleans at the db seam", () => {
  it("maps 1 -> true", () => {
    expect(sqliteBool(1)).toBe(true);
  });
  it("maps 0 -> false", () => {
    expect(sqliteBool(0)).toBe(false);
  });
  it("maps null -> false", () => {
    expect(sqliteBool(null)).toBe(false);
  });
});
