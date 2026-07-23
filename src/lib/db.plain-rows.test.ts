import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Regression guard for the RSC seam: `many`/`one` must hand back GENUINE plain
// objects, not the array-like libSQL Row (numeric index keys + a non-plain
// prototype). Passing a raw Row to a "use client" component trips React's
// "Only plain objects can be passed to Client Components" warning.
//
// Like db.fk.test.ts, this drives the REAL client + helpers against an ISOLATED
// local sqlite file (never Turso). The client singleton is built from env at
// import time, so DATABASE_URL is set BEFORE the dynamic import below, and TURSO_*
// is cleared first because makeClient() prefers TURSO_DATABASE_URL.

const dbFile = path.join(os.tmpdir(), `training-hub-plain-${process.pid}-${Date.now()}.db`);

let helpers: typeof import("./db/helpers");
let client: typeof import("./db/client");

beforeAll(async () => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DATABASE_URL = `file:${dbFile}`;
  helpers = await import("./db/helpers");
  client = await import("./db/client");
  // A throwaway table with mixed column types so plainness is checked
  // independently of the app schema.
  await helpers.exec(
    "CREATE TABLE IF NOT EXISTS plain_probe (id INTEGER PRIMARY KEY, name TEXT, ratio REAL, note TEXT)"
  );
  await helpers.exec("INSERT INTO plain_probe (name, ratio, note) VALUES (?, ?, ?)", [
    "Shoe",
    1.5,
    null,
  ]);
});

afterAll(() => {
  client.client.close();
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }
});

const SELECT = "SELECT id, name, ratio, note FROM plain_probe";

describe("db read helpers return plain objects", () => {
  it("many() yields a genuine plain object with exactly the column keys", async () => {
    const [row] = await helpers.many<{
      id: number;
      name: string;
      ratio: number;
      note: string | null;
    }>(SELECT);

    // A real plain object, not the array-like libSQL Row prototype.
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    // Exactly the column names — no numeric index keys leaked from the Row.
    expect(Object.keys(row)).toEqual(["id", "name", "ratio", "note"]);
    // Values are identical to what SQLite stored.
    expect(row).toEqual({ id: 1, name: "Shoe", ratio: 1.5, note: null });
  });

  it("one() yields a genuine plain object with exactly the column keys", async () => {
    const row = await helpers.one<{
      id: number;
      name: string;
      ratio: number;
      note: string | null;
    }>(SELECT);

    expect(row).not.toBeNull();
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(Object.keys(row!)).toEqual(["id", "name", "ratio", "note"]);
    expect(row).toEqual({ id: 1, name: "Shoe", ratio: 1.5, note: null });
  });
});
