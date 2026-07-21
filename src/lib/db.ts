import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InStatement } from "@libsql/client";
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

// Local development uses a plain SQLite file; production points
// TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) at a Turso database.
const LOCAL_URL = "file:data/app.db";

function makeClient(): Client {
  const url = process.env.TURSO_DATABASE_URL || LOCAL_URL;
  if (url.startsWith("file:")) fs.mkdirSync(DATA_DIR, { recursive: true });
  return createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    intMode: "number",
  });
}

declare global {
  var __trainingHubClient: Client | undefined;
}

export const client: Client = globalThis.__trainingHubClient ?? makeClient();
if (process.env.NODE_ENV !== "production") globalThis.__trainingHubClient = client;

// ---------------------------------------------------------------------------
// Migrations (idempotent, run lazily once per process before the first query)
// ---------------------------------------------------------------------------

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS shoes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    strava_gear_id TEXT UNIQUE,
    photo_path TEXT,
    initial_km REAL NOT NULL DEFAULT 0,
    retirement_km REAL DEFAULT 700,
    retired_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS activities (
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
  )`,
  `CREATE TABLE IF NOT EXISTS activity_splits (
    id INTEGER PRIMARY KEY,
    activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    shoe_id INTEGER REFERENCES shoes(id),
    km REAL NOT NULL,
    note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS strava_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_activities_started_at ON activities(started_at)",
  "CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status)",
  "CREATE INDEX IF NOT EXISTS idx_splits_activity_id ON activity_splits(activity_id)",
  "CREATE INDEX IF NOT EXISTS idx_splits_shoe_id ON activity_splits(shoe_id)",
];

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

async function migrate(): Promise<void> {
  // Migration 001: schema.
  await client.batch(SCHEMA, "write");

  // Migration 002: baseline shoes + baseline date, only on an empty database.
  // The write transaction serializes concurrent cold starts.
  const tx = await client.transaction("write");
  try {
    const shoes = await tx.execute("SELECT COUNT(*) AS c FROM shoes");
    if (Number(shoes.rows[0].c) === 0) {
      for (const shoe of BASELINE_SHOES) {
        await tx.execute({
          sql: "INSERT INTO shoes (name, role, initial_km) VALUES (?, ?, ?)",
          args: [shoe.name, shoe.role, shoe.initial_km],
        });
      }
    }
    const baseline = await tx.execute(
      "SELECT value FROM app_meta WHERE key = 'baseline_date'"
    );
    if (baseline.rows.length === 0) {
      await tx.execute({
        sql: "INSERT INTO app_meta (key, value) VALUES ('baseline_date', ?)",
        args: [new Date().toISOString()],
      });
    }
    await tx.commit();
  } finally {
    tx.close();
  }
}

let migrated: Promise<void> | null = null;
export function ensureMigrated(): Promise<void> {
  if (!migrated) migrated = migrate();
  return migrated;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

type Args = Array<string | number | null>;

async function exec(sql: string, args: Args = []) {
  await ensureMigrated();
  return client.execute({ sql, args });
}

async function many<T>(sql: string, args: Args = []): Promise<T[]> {
  return (await exec(sql, args)).rows as unknown as T[];
}

async function one<T>(sql: string, args: Args = []): Promise<T | null> {
  const result = await exec(sql, args);
  return result.rows.length > 0 ? (result.rows[0] as unknown as T) : null;
}

async function batchWrite(statements: InStatement[]) {
  await ensureMigrated();
  return client.batch(statements, "write");
}

// ---------------------------------------------------------------------------
// App meta
// ---------------------------------------------------------------------------

export async function getMeta(key: string): Promise<string | null> {
  const row = await one<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await exec(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

export async function deleteMeta(key: string): Promise<void> {
  await exec("DELETE FROM app_meta WHERE key = ?", [key]);
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

export async function listShoes(): Promise<ShoeWithMileage[]> {
  return many<ShoeWithMileage>(
    `${SHOE_SELECT} ORDER BY (s.retired_at IS NOT NULL), s.name COLLATE NOCASE`
  );
}

export async function getShoe(id: number): Promise<ShoeWithMileage | null> {
  return one<ShoeWithMileage>(`${SHOE_SELECT} WHERE s.id = ?`, [id]);
}

export interface ShoeFields {
  name: string;
  role: string | null;
  initial_km: number;
  retirement_km: number | null;
  strava_gear_id: string | null;
}

export async function createShoe(fields: ShoeFields, photoPath: string | null): Promise<number> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push({
      sql: "UPDATE shoes SET strava_gear_id = NULL WHERE strava_gear_id = ?",
      args: [fields.strava_gear_id],
    });
  }
  statements.push({
    sql: `INSERT INTO shoes (name, role, initial_km, retirement_km, strava_gear_id, photo_path)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      fields.name,
      fields.role,
      fields.initial_km,
      fields.retirement_km,
      fields.strava_gear_id,
      photoPath,
    ],
  });
  const results = await batchWrite(statements);
  return Number(results[results.length - 1].lastInsertRowid);
}

export async function updateShoe(
  id: number,
  fields: ShoeFields,
  photoPath: string | null
): Promise<void> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push({
      sql: "UPDATE shoes SET strava_gear_id = NULL WHERE strava_gear_id = ? AND id != ?",
      args: [fields.strava_gear_id, id],
    });
  }
  statements.push({
    sql: `UPDATE shoes SET name = ?, role = ?, initial_km = ?, retirement_km = ?,
          strava_gear_id = ?, photo_path = COALESCE(?, photo_path) WHERE id = ?`,
    args: [
      fields.name,
      fields.role,
      fields.initial_km,
      fields.retirement_km,
      fields.strava_gear_id,
      photoPath,
      id,
    ],
  });
  await batchWrite(statements);
}

export async function setShoeRetired(id: number, retired: boolean): Promise<void> {
  await exec("UPDATE shoes SET retired_at = ? WHERE id = ?", [
    retired ? new Date().toISOString() : null,
    id,
  ]);
}

export async function setShoeGear(id: number, gearId: string | null): Promise<void> {
  const statements: InStatement[] = [];
  if (gearId) {
    statements.push({
      sql: "UPDATE shoes SET strava_gear_id = NULL WHERE strava_gear_id = ? AND id != ?",
      args: [gearId, id],
    });
  }
  statements.push({
    sql: "UPDATE shoes SET strava_gear_id = ? WHERE id = ?",
    args: [gearId, id],
  });
  await batchWrite(statements);
}

export async function findShoeIdByGear(gearId: string): Promise<number | null> {
  const row = await one<{ id: number }>("SELECT id FROM shoes WHERE strava_gear_id = ?", [
    gearId,
  ]);
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

async function attachSplits(activities: Activity[]): Promise<ActivityWithSplits[]> {
  if (activities.length === 0) return [];
  const all = await many<SplitWithShoe>(
    `SELECT sp.id, sp.activity_id, sp.shoe_id, sp.km, sp.note,
            s.name AS shoe_name, s.role AS shoe_role
     FROM activity_splits sp
     LEFT JOIN shoes s ON s.id = sp.shoe_id
     ORDER BY sp.id`
  );
  const byActivity = new Map<number, SplitWithShoe[]>();
  for (const split of all) {
    const list = byActivity.get(split.activity_id);
    if (list) list.push(split);
    else byActivity.set(split.activity_id, [split]);
  }
  return activities.map((a) => ({ ...a, splits: byActivity.get(a.id) ?? [] }));
}

export async function listConfirmedActivities(): Promise<ActivityWithSplits[]> {
  const activities = await many<Activity>(
    "SELECT * FROM activities WHERE status = 'confirmed' ORDER BY started_at DESC, id DESC"
  );
  return attachSplits(activities);
}

export async function listPendingActivities(): Promise<ActivityWithSplits[]> {
  const activities = await many<Activity>(
    "SELECT * FROM activities WHERE status = 'pending_review' ORDER BY started_at ASC, id ASC"
  );
  return attachSplits(activities);
}

export async function countPending(): Promise<number> {
  const row = await one<{ c: number }>(
    "SELECT COUNT(*) AS c FROM activities WHERE status = 'pending_review'"
  );
  return Number(row?.c ?? 0);
}

export async function getActivity(id: number): Promise<ActivityWithSplits | null> {
  const activity = await one<Activity>("SELECT * FROM activities WHERE id = ?", [id]);
  if (!activity) return null;
  const [withSplits] = await attachSplits([activity]);
  return withSplits;
}

export async function activityExistsByStravaId(stravaId: number): Promise<boolean> {
  return (await one("SELECT 1 AS x FROM activities WHERE strava_id = ?", [stravaId])) !== null;
}

/** Epoch seconds of the most recent synced Strava activity, or null. */
export async function latestSyncedStartEpoch(): Promise<number | null> {
  const row = await one<{ m: string | null }>(
    "SELECT MAX(started_at) AS m FROM activities WHERE strava_id IS NOT NULL"
  );
  if (!row?.m) return null;
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

const INSERT_SPLIT_SQL =
  "INSERT INTO activity_splits (activity_id, shoe_id, km) VALUES (?, ?, ?)";

export async function insertSyncedActivity(
  input: SyncedActivityInput,
  splits: SplitInput[]
): Promise<void> {
  await ensureMigrated();
  const tx = await client.transaction("write");
  try {
    const result = await tx.execute({
      sql: `INSERT INTO activities
            (strava_id, name, sport_type, started_at, distance_km, moving_time_s,
             avg_pace_s_per_km, avg_hr, elevation_gain_m, status, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.strava_id,
        input.name,
        input.sport_type,
        input.started_at,
        input.distance_km,
        input.moving_time_s,
        input.avg_pace_s_per_km,
        input.avg_hr,
        input.elevation_gain_m,
        input.status,
        input.raw_json,
      ],
    });
    const activityId = Number(result.lastInsertRowid);
    for (const split of splits) {
      await tx.execute({ sql: INSERT_SPLIT_SQL, args: [activityId, split.shoe_id, split.km] });
    }
    await tx.commit();
  } finally {
    tx.close();
  }
}

export interface JournalFields {
  rpe: number | null;
  feeling: Feeling | null;
  workout_notes: string | null;
  health_notes: string | null;
}

export async function confirmActivity(
  id: number,
  journal: JournalFields,
  splits: SplitInput[]
): Promise<void> {
  await batchWrite([
    {
      sql: `UPDATE activities SET status = 'confirmed', rpe = ?, feeling = ?,
            workout_notes = ?, health_notes = ? WHERE id = ?`,
      args: [journal.rpe, journal.feeling, journal.workout_notes, journal.health_notes, id],
    },
    { sql: "DELETE FROM activity_splits WHERE activity_id = ?", args: [id] },
    ...splits.map((split) => ({
      sql: INSERT_SPLIT_SQL,
      args: [id, split.shoe_id, split.km],
    })),
  ]);
}

export async function updateActivityJournal(id: number, journal: JournalFields): Promise<void> {
  await exec(
    "UPDATE activities SET rpe = ?, feeling = ?, workout_notes = ?, health_notes = ? WHERE id = ?",
    [journal.rpe, journal.feeling, journal.workout_notes, journal.health_notes, id]
  );
}

export async function replaceActivitySplits(id: number, splits: SplitInput[]): Promise<void> {
  await batchWrite([
    { sql: "DELETE FROM activity_splits WHERE activity_id = ?", args: [id] },
    ...splits.map((split) => ({
      sql: INSERT_SPLIT_SQL,
      args: [id, split.shoe_id, split.km],
    })),
  ]);
}

export async function createManualActivity(input: {
  date: string;
  km: number;
  shoe_id: number;
  name?: string;
}): Promise<number> {
  await ensureMigrated();
  const tx = await client.transaction("write");
  try {
    const result = await tx.execute({
      sql: `INSERT INTO activities (name, sport_type, started_at, distance_km, status)
            VALUES (?, 'Manual', ?, ?, 'confirmed')`,
      args: [input.name ?? "Manual adjustment", `${input.date}T12:00:00Z`, input.km],
    });
    const activityId = Number(result.lastInsertRowid);
    await tx.execute({ sql: INSERT_SPLIT_SQL, args: [activityId, input.shoe_id, input.km] });
    await tx.commit();
    return activityId;
  } finally {
    tx.close();
  }
}

// ---------------------------------------------------------------------------
// Strava auth
// ---------------------------------------------------------------------------

export interface StravaAuthRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function getStravaAuth(): Promise<StravaAuthRow | null> {
  const row = await one<StravaAuthRow>(
    "SELECT access_token, refresh_token, expires_at FROM strava_auth WHERE id = 1"
  );
  if (!row || !row.access_token || !row.refresh_token) return null;
  return row;
}

export async function saveStravaAuth(auth: StravaAuthRow): Promise<void> {
  await exec(
    `INSERT INTO strava_auth (id, access_token, refresh_token, expires_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET access_token = excluded.access_token,
       refresh_token = excluded.refresh_token, expires_at = excluded.expires_at`,
    [auth.access_token, auth.refresh_token, auth.expires_at]
  );
}

export async function clearStravaAuth(): Promise<void> {
  await batchWrite([
    "DELETE FROM strava_auth WHERE id = 1",
    "DELETE FROM app_meta WHERE key = 'athlete_name'",
  ]);
}
