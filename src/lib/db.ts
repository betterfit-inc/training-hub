import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  Activity,
  ActivityWithSplits,
  Feeling,
  ShoeWithMileage,
  SplitInput,
  SplitWithShoe,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// ---------------------------------------------------------------------------
// Connection + migrations (idempotent, run on every startup)
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS shoes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  strava_gear_id TEXT UNIQUE,
  photo_path TEXT,
  initial_km REAL NOT NULL DEFAULT 0,
  retirement_km REAL DEFAULT 700,
  retired_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  strava_id INTEGER UNIQUE,
  name TEXT,
  sport_type TEXT,
  started_at TEXT,
  distance_km REAL,
  moving_time_s INTEGER,
  avg_pace_s_per_km REAL,
  avg_hr REAL,
  elevation_gain_m REAL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  rpe INTEGER,
  feeling TEXT,
  workout_notes TEXT,
  health_notes TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_splits (
  id INTEGER PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  shoe_id INTEGER REFERENCES shoes(id),
  km REAL NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS strava_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_started_at ON activities(started_at);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_splits_activity_id ON activity_splits(activity_id);
CREATE INDEX IF NOT EXISTS idx_splits_shoe_id ON activity_splits(shoe_id);
`;

// Real shoes with corrected current mileage (includes the 18 km moved from the
// Adios Pro 4 to the Superblast 3). Inserted only when the shoes table is empty.
const BASELINE_SHOES: Array<{ name: string; initial_km: number; role: string }> = [
  { name: "Adidas Adios Pro 4", initial_km: 196.1, role: "race day / race pace trainings" },
  { name: "Adidas Drive RC", initial_km: 474.1, role: "intervals" },
  { name: "Adidas Evo SL Preto e Branco", initial_km: 452.6, role: "everyday shoe" },
  { name: "Adidas Evo SL Preto e Cinza", initial_km: 236.2, role: "everyday shoe" },
  { name: "ASICS Superblast 3", initial_km: 291.9, role: "easy runs, long runs, injury recovery shoe" },
  { name: "Salomon S/Lab Ultra 3 V2", initial_km: 141.1, role: "trail shoe" },
];

function migrate(db: Database.Database) {
  // Migration 001: schema.
  db.exec(SCHEMA_SQL);

  // Migration 002: baseline shoes + baseline date, only on an empty database.
  // The baselines already account for all historical Strava mileage, so synced
  // activities that started before baseline_date must not add shoe kilometers.
  // .immediate() takes the write lock up front so concurrent processes (for
  // example Next.js build workers) serialize instead of hitting SQLITE_BUSY.
  const migration002 = db.transaction(() => {
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM shoes").get() as { c: number };
    if (c === 0) {
      const insert = db.prepare(
        "INSERT INTO shoes (name, role, initial_km) VALUES (@name, @role, @initial_km)"
      );
      for (const shoe of BASELINE_SHOES) insert.run(shoe);
    }
    const baseline = db
      .prepare("SELECT value FROM app_meta WHERE key = 'baseline_date'")
      .get() as { value: string } | undefined;
    if (!baseline) {
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('baseline_date', ?)").run(
        new Date().toISOString()
      );
    }
  });
  migration002.immediate();
}

function connect(): Database.Database {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "app.db"), { timeout: 10000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

declare global {
  var __trainingHubDb: Database.Database | undefined;
}

export const db: Database.Database = globalThis.__trainingHubDb ?? connect();
if (process.env.NODE_ENV !== "production") globalThis.__trainingHubDb = db;

const stmtCache = new Map<string, Database.Statement>();
function prep(sql: string): Database.Statement {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

// ---------------------------------------------------------------------------
// App meta
// ---------------------------------------------------------------------------

export function getMeta(key: string): string | null {
  const row = prep("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  prep(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function deleteMeta(key: string): void {
  prep("DELETE FROM app_meta WHERE key = ?").run(key);
}

// ---------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------

const SHOE_SELECT = `
SELECT s.*, s.initial_km + COALESCE((
  SELECT SUM(sp.km)
  FROM activity_splits sp
  JOIN activities a ON a.id = sp.activity_id
  WHERE sp.shoe_id = s.id AND a.status = 'confirmed'
), 0) AS current_km
FROM shoes s
`;

export function listShoes(): ShoeWithMileage[] {
  return prep(
    `${SHOE_SELECT} ORDER BY (s.retired_at IS NOT NULL), s.name COLLATE NOCASE`
  ).all() as ShoeWithMileage[];
}

export function getShoe(id: number): ShoeWithMileage | null {
  return (prep(`${SHOE_SELECT} WHERE s.id = ?`).get(id) as ShoeWithMileage | undefined) ?? null;
}

export interface ShoeFields {
  name: string;
  role: string | null;
  initial_km: number;
  retirement_km: number | null;
  strava_gear_id: string | null;
}

export function createShoe(fields: ShoeFields, photoPath: string | null): number {
  const claimGear = db.transaction(() => {
    if (fields.strava_gear_id) {
      prep("UPDATE shoes SET strava_gear_id = NULL WHERE strava_gear_id = ?").run(
        fields.strava_gear_id
      );
    }
    const info = prep(
      `INSERT INTO shoes (name, role, initial_km, retirement_km, strava_gear_id, photo_path)
       VALUES (@name, @role, @initial_km, @retirement_km, @strava_gear_id, @photo_path)`
    ).run({ ...fields, photo_path: photoPath });
    return Number(info.lastInsertRowid);
  });
  return claimGear();
}

export function updateShoe(id: number, fields: ShoeFields, photoPath: string | null): void {
  const tx = db.transaction(() => {
    if (fields.strava_gear_id) {
      prep("UPDATE shoes SET strava_gear_id = NULL WHERE strava_gear_id = ? AND id != ?").run(
        fields.strava_gear_id,
        id
      );
    }
    prep(
      `UPDATE shoes SET name = @name, role = @role, initial_km = @initial_km,
       retirement_km = @retirement_km, strava_gear_id = @strava_gear_id,
       photo_path = COALESCE(@photo_path, photo_path)
       WHERE id = @id`
    ).run({ ...fields, photo_path: photoPath, id });
  });
  tx();
}

export function setShoeRetired(id: number, retired: boolean): void {
  prep("UPDATE shoes SET retired_at = ? WHERE id = ?").run(
    retired ? new Date().toISOString() : null,
    id
  );
}

export function setShoeGear(id: number, gearId: string | null): void {
  const tx = db.transaction(() => {
    if (gearId) {
      prep("UPDATE shoes SET strava_gear_id = NULL WHERE strava_gear_id = ? AND id != ?").run(
        gearId,
        id
      );
    }
    prep("UPDATE shoes SET strava_gear_id = ? WHERE id = ?").run(gearId, id);
  });
  tx();
}

export function findShoeIdByGear(gearId: string): number | null {
  const row = prep("SELECT id FROM shoes WHERE strava_gear_id = ?").get(gearId) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

function attachSplits(activities: Activity[]): ActivityWithSplits[] {
  if (activities.length === 0) return [];
  const all = prep(
    `SELECT sp.id, sp.activity_id, sp.shoe_id, sp.km, sp.note,
            s.name AS shoe_name, s.role AS shoe_role
     FROM activity_splits sp
     LEFT JOIN shoes s ON s.id = sp.shoe_id
     ORDER BY sp.id`
  ).all() as SplitWithShoe[];
  const byActivity = new Map<number, SplitWithShoe[]>();
  for (const split of all) {
    const list = byActivity.get(split.activity_id);
    if (list) list.push(split);
    else byActivity.set(split.activity_id, [split]);
  }
  return activities.map((a) => ({ ...a, splits: byActivity.get(a.id) ?? [] }));
}

export function listConfirmedActivities(): ActivityWithSplits[] {
  const rows = prep(
    "SELECT * FROM activities WHERE status = 'confirmed' ORDER BY started_at DESC, id DESC"
  ).all() as Activity[];
  return attachSplits(rows);
}

export function listPendingActivities(): ActivityWithSplits[] {
  const rows = prep(
    "SELECT * FROM activities WHERE status = 'pending_review' ORDER BY started_at ASC, id ASC"
  ).all() as Activity[];
  return attachSplits(rows);
}

export function countPending(): number {
  const row = prep(
    "SELECT COUNT(*) AS c FROM activities WHERE status = 'pending_review'"
  ).get() as { c: number };
  return row.c;
}

export function getActivity(id: number): ActivityWithSplits | null {
  const row = prep("SELECT * FROM activities WHERE id = ?").get(id) as Activity | undefined;
  if (!row) return null;
  return attachSplits([row])[0];
}

export function activityExistsByStravaId(stravaId: number): boolean {
  return !!prep("SELECT 1 FROM activities WHERE strava_id = ?").get(stravaId);
}

/** Epoch seconds of the most recent synced Strava activity, or null. */
export function latestSyncedStartEpoch(): number | null {
  const row = prep(
    "SELECT MAX(started_at) AS m FROM activities WHERE strava_id IS NOT NULL"
  ).get() as { m: string | null };
  if (!row.m) return null;
  const ms = Date.parse(row.m);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export interface SyncedActivityInput {
  strava_id: number;
  name: string | null;
  sport_type: string | null;
  started_at: string;
  distance_km: number;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  status: "pending_review" | "confirmed";
  raw_json: string;
}

const insertSplitSql = "INSERT INTO activity_splits (activity_id, shoe_id, km) VALUES (?, ?, ?)";

export function insertSyncedActivity(input: SyncedActivityInput, splits: SplitInput[]): void {
  const tx = db.transaction(() => {
    const info = prep(
      `INSERT INTO activities
       (strava_id, name, sport_type, started_at, distance_km, moving_time_s,
        avg_pace_s_per_km, avg_hr, elevation_gain_m, status, raw_json)
       VALUES (@strava_id, @name, @sport_type, @started_at, @distance_km, @moving_time_s,
        @avg_pace_s_per_km, @avg_hr, @elevation_gain_m, @status, @raw_json)`
    ).run(input as unknown as Record<string, unknown>);
    const activityId = Number(info.lastInsertRowid);
    for (const s of splits) prep(insertSplitSql).run(activityId, s.shoe_id, s.km);
  });
  tx();
}

export interface JournalFields {
  rpe: number | null;
  feeling: Feeling | null;
  workout_notes: string | null;
  health_notes: string | null;
}

export function confirmActivity(id: number, journal: JournalFields, splits: SplitInput[]): void {
  const tx = db.transaction(() => {
    prep(
      `UPDATE activities SET status = 'confirmed', rpe = @rpe, feeling = @feeling,
       workout_notes = @workout_notes, health_notes = @health_notes WHERE id = @id`
    ).run({ ...journal, id });
    prep("DELETE FROM activity_splits WHERE activity_id = ?").run(id);
    for (const s of splits) prep(insertSplitSql).run(id, s.shoe_id, s.km);
  });
  tx();
}

export function updateActivityJournal(id: number, journal: JournalFields): void {
  prep(
    `UPDATE activities SET rpe = @rpe, feeling = @feeling,
     workout_notes = @workout_notes, health_notes = @health_notes WHERE id = @id`
  ).run({ ...journal, id });
}

export function replaceActivitySplits(id: number, splits: SplitInput[]): void {
  const tx = db.transaction(() => {
    prep("DELETE FROM activity_splits WHERE activity_id = ?").run(id);
    for (const s of splits) prep(insertSplitSql).run(id, s.shoe_id, s.km);
  });
  tx();
}

export function createManualActivity(input: {
  date: string;
  km: number;
  shoe_id: number;
  name?: string;
}): number {
  const tx = db.transaction(() => {
    const info = prep(
      `INSERT INTO activities (name, sport_type, started_at, distance_km, status)
       VALUES (@name, 'Manual', @started_at, @km, 'confirmed')`
    ).run({
      name: input.name ?? "Manual adjustment",
      started_at: `${input.date}T12:00:00Z`,
      km: input.km,
    });
    const activityId = Number(info.lastInsertRowid);
    prep(insertSplitSql).run(activityId, input.shoe_id, input.km);
    return activityId;
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Strava auth
// ---------------------------------------------------------------------------

export interface StravaAuthRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export function getStravaAuth(): StravaAuthRow | null {
  const row = prep(
    "SELECT access_token, refresh_token, expires_at FROM strava_auth WHERE id = 1"
  ).get() as StravaAuthRow | undefined;
  if (!row || !row.access_token || !row.refresh_token) return null;
  return row;
}

export function saveStravaAuth(auth: StravaAuthRow): void {
  prep(
    `INSERT INTO strava_auth (id, access_token, refresh_token, expires_at)
     VALUES (1, @access_token, @refresh_token, @expires_at)
     ON CONFLICT(id) DO UPDATE SET access_token = excluded.access_token,
       refresh_token = excluded.refresh_token, expires_at = excluded.expires_at`
  ).run(auth as unknown as Record<string, unknown>);
}

export function clearStravaAuth(): void {
  prep("DELETE FROM strava_auth WHERE id = 1").run();
  deleteMeta("athlete_name");
}
