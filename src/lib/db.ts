import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InStatement } from "@libsql/client";
import type { BlockActivity } from "./blocks";
import { computeLoad, type AthleteThresholds, type LoadMethod } from "./fitness";
import type {
  Activity,
  ActivityWithSplits,
  BikeWithMileage,
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
  `CREATE TABLE IF NOT EXISTS activity_streams (
    activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
    json TEXT NOT NULL,
    synced_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS bikes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT,
    strava_gear_id TEXT UNIQUE,
    photo_path TEXT,
    initial_km REAL NOT NULL DEFAULT 0,
    retired_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
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
  `CREATE TABLE IF NOT EXISTS athlete_thresholds (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    max_hr INTEGER,
    resting_hr INTEGER,
    lthr INTEGER,
    threshold_pace_s_per_km REAL,
    ftp_w INTEGER,
    resting_hr_estimated INTEGER NOT NULL DEFAULT 1,
    ftp_provisional INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS activity_load (
    activity_id INTEGER PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
    tss REAL,
    method TEXT,
    intensity_factor REAL,
    source TEXT NOT NULL DEFAULT 'auto',
    computed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS activity_chat (
    id INTEGER PRIMARY KEY,
    activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS idx_activities_started_at ON activities(started_at)",
  "CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status)",
  "CREATE INDEX IF NOT EXISTS idx_splits_activity_id ON activity_splits(activity_id)",
  "CREATE INDEX IF NOT EXISTS idx_splits_shoe_id ON activity_splits(shoe_id)",
  "CREATE INDEX IF NOT EXISTS idx_activity_chat_activity_id ON activity_chat(activity_id)",
];

// Real bikes with their current Strava odometers as baseline. The TR10 is the
// trainer bike: its 33.4 km are the virtual rides already in the hub, so its
// baseline is 0 and those confirmed rides supply the distance. The Stamina's
// 467 km is outdoor history that lives in the log as pre-baseline (uncounted),
// so its baseline carries that total.
const BASELINE_BIKES: Array<{
  name: string;
  role: string;
  photo: string;
  initial_km: number;
}> = [
  { name: "TSW TR10 Speed Bike", role: "road", photo: "bike-tsw-tr10-one.png", initial_km: 0 },
  { name: "TSW Stamina 2025", role: "mountain bike", photo: "bike-tsw-stamina.png", initial_km: 467 },
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

  // Migration 003: per-activity detail cache (laps, km splits) from Strava.
  const columns = await client.execute("SELECT name FROM pragma_table_info('activities')");
  const names = new Set(columns.rows.map((row) => String(row.name)));
  if (!names.has("detail_json")) {
    await client.execute("ALTER TABLE activities ADD COLUMN detail_json TEXT");
  }
  if (!names.has("detail_synced_at")) {
    await client.execute("ALTER TABLE activities ADD COLUMN detail_synced_at TEXT");
  }
  // Migration 004: bikes as gear, one bike per activity (no splits). The index
  // is created after the column exists (the activities table predates it).
  if (!names.has("bike_id")) {
    await client.execute("ALTER TABLE activities ADD COLUMN bike_id INTEGER REFERENCES bikes(id)");
  }
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_activities_bike_id ON activities(bike_id)"
  );
  // Migration 005: race marking for block comparison.
  if (!names.has("is_race")) {
    await client.execute("ALTER TABLE activities ADD COLUMN is_race INTEGER NOT NULL DEFAULT 0");
  }
  if (!names.has("goal_pace_s_per_km")) {
    await client.execute("ALTER TABLE activities ADD COLUMN goal_pace_s_per_km REAL");
  }

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
    const bikes = await tx.execute("SELECT COUNT(*) AS c FROM bikes");
    if (Number(bikes.rows[0].c) === 0) {
      for (const bike of BASELINE_BIKES) {
        await tx.execute({
          sql: "INSERT INTO bikes (name, role, photo_path, initial_km) VALUES (?, ?, ?, ?)",
          args: [bike.name, bike.role, bike.photo, bike.initial_km],
        });
      }
    }
    const thresholds = await tx.execute("SELECT COUNT(*) AS c FROM athlete_thresholds");
    if (Number(thresholds.rows[0].c) === 0) {
      await tx.execute({
        sql: `INSERT INTO athlete_thresholds
              (id, max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w,
               resting_hr_estimated, ftp_provisional, updated_at)
              VALUES (1, ?, ?, ?, ?, ?, 1, 1, ?)`,
        args: [199, 50, 176, 269, 150, new Date().toISOString()],
      });
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
// Bikes (one whole activity per bike, no splits; indoor = VirtualRide)
// ---------------------------------------------------------------------------

const BIKE_MILEAGE = `
  SELECT COALESCE(SUM(a.distance_km), 0) AS total,
    COALESCE(SUM(CASE WHEN a.sport_type = 'VirtualRide' THEN a.distance_km ELSE 0 END), 0) AS indoor,
    COALESCE(SUM(CASE WHEN a.sport_type != 'VirtualRide' THEN a.distance_km ELSE 0 END), 0) AS outdoor,
    COUNT(*) AS rides
  FROM activities a
  WHERE a.bike_id = b.id AND a.status = 'confirmed'
`;

const BIKE_SELECT = `
SELECT b.*,
  b.initial_km + (SELECT total FROM (${BIKE_MILEAGE})) AS current_km,
  (SELECT indoor FROM (${BIKE_MILEAGE})) AS indoor_km,
  (SELECT outdoor FROM (${BIKE_MILEAGE})) AS outdoor_km,
  (SELECT rides FROM (${BIKE_MILEAGE})) AS ride_count
FROM bikes b
`;

export async function listBikes(): Promise<BikeWithMileage[]> {
  return many<BikeWithMileage>(
    `${BIKE_SELECT} ORDER BY (b.retired_at IS NOT NULL), b.name COLLATE NOCASE`
  );
}

export async function getBike(id: number): Promise<BikeWithMileage | null> {
  return one<BikeWithMileage>(`${BIKE_SELECT} WHERE b.id = ?`, [id]);
}

export interface BikeFields {
  name: string;
  role: string | null;
  initial_km: number;
  strava_gear_id: string | null;
}

export async function createBike(fields: BikeFields, photoPath: string | null): Promise<number> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push({
      sql: "UPDATE bikes SET strava_gear_id = NULL WHERE strava_gear_id = ?",
      args: [fields.strava_gear_id],
    });
  }
  statements.push({
    sql: `INSERT INTO bikes (name, role, initial_km, strava_gear_id, photo_path)
          VALUES (?, ?, ?, ?, ?)`,
    args: [fields.name, fields.role, fields.initial_km, fields.strava_gear_id, photoPath],
  });
  const results = await batchWrite(statements);
  return Number(results[results.length - 1].lastInsertRowid);
}

export async function updateBike(
  id: number,
  fields: BikeFields,
  photoPath: string | null
): Promise<void> {
  const statements: InStatement[] = [];
  if (fields.strava_gear_id) {
    statements.push({
      sql: "UPDATE bikes SET strava_gear_id = NULL WHERE strava_gear_id = ? AND id != ?",
      args: [fields.strava_gear_id, id],
    });
  }
  statements.push({
    sql: `UPDATE bikes SET name = ?, role = ?, initial_km = ?, strava_gear_id = ?,
          photo_path = COALESCE(?, photo_path) WHERE id = ?`,
    args: [fields.name, fields.role, fields.initial_km, fields.strava_gear_id, photoPath, id],
  });
  await batchWrite(statements);
}

export async function setBikeRetired(id: number, retired: boolean): Promise<void> {
  await exec("UPDATE bikes SET retired_at = ? WHERE id = ?", [
    retired ? new Date().toISOString() : null,
    id,
  ]);
}

export async function setBikeGear(id: number, gearId: string | null): Promise<void> {
  const statements: InStatement[] = [];
  if (gearId) {
    statements.push({
      sql: "UPDATE bikes SET strava_gear_id = NULL WHERE strava_gear_id = ? AND id != ?",
      args: [gearId, id],
    });
  }
  statements.push({
    sql: "UPDATE bikes SET strava_gear_id = ? WHERE id = ?",
    args: [gearId, id],
  });
  await batchWrite(statements);
}

export async function findBikeIdByGear(gearId: string): Promise<number | null> {
  const row = await one<{ id: number }>("SELECT id FROM bikes WHERE strava_gear_id = ?", [gearId]);
  return row?.id ?? null;
}

export async function setActivityBike(activityId: number, bikeId: number | null): Promise<void> {
  await exec("UPDATE activities SET bike_id = ? WHERE id = ?", [bikeId, activityId]);
}

export async function setActivityRace(
  activityId: number,
  isRace: boolean,
  goalPace: number | null
): Promise<void> {
  await exec("UPDATE activities SET is_race = ?, goal_pace_s_per_km = ? WHERE id = ?", [
    isRace ? 1 : 0,
    isRace ? goalPace : null,
    activityId,
  ]);
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

const ACTIVITY_SELECT =
  "SELECT a.*, b.name AS bike_name FROM activities a LEFT JOIN bikes b ON b.id = a.bike_id";

export async function listConfirmedActivities(): Promise<ActivityWithSplits[]> {
  const activities = await many<Activity>(
    `${ACTIVITY_SELECT} WHERE a.status = 'confirmed' ORDER BY a.started_at DESC, a.id DESC`
  );
  return attachSplits(activities);
}

export async function listPendingActivities(): Promise<ActivityWithSplits[]> {
  const activities = await many<Activity>(
    `${ACTIVITY_SELECT} WHERE a.status = 'pending_review' ORDER BY a.started_at ASC, a.id ASC`
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
  const activity = await one<Activity>(`${ACTIVITY_SELECT} WHERE a.id = ?`, [id]);
  if (!activity) return null;
  const [withSplits] = await attachSplits([activity]);
  return withSplits;
}

export async function listRaces(): Promise<ActivityWithSplits[]> {
  const activities = await many<Activity>(
    `${ACTIVITY_SELECT} WHERE a.is_race = 1 ORDER BY a.started_at DESC, a.id DESC`
  );
  return attachSplits(activities);
}

/** Confirmed activities in [fromIso, toIso), oldest first, for block analysis. */
export async function listBlockActivities(
  fromIso: string,
  toIso: string
): Promise<BlockActivity[]> {
  return many<BlockActivity>(
    `SELECT started_at, sport_type, distance_km, moving_time_s, avg_hr, avg_pace_s_per_km
     FROM activities
     WHERE status = 'confirmed' AND started_at >= ? AND started_at < ?
     ORDER BY started_at ASC`,
    [fromIso, toIso]
  );
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
  bike_id: number | null;
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
             avg_pace_s_per_km, avg_hr, elevation_gain_m, status, raw_json, bike_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.bike_id,
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
  splits: SplitInput[],
  bikeId: number | null
): Promise<void> {
  await batchWrite([
    {
      sql: `UPDATE activities SET status = 'confirmed', rpe = ?, feeling = ?,
            workout_notes = ?, health_notes = ?, bike_id = ? WHERE id = ?`,
      args: [
        journal.rpe,
        journal.feeling,
        journal.workout_notes,
        journal.health_notes,
        bikeId,
        id,
      ],
    },
    { sql: "DELETE FROM activity_splits WHERE activity_id = ?", args: [id] },
    ...splits.map((split) => ({
      sql: INSERT_SPLIT_SQL,
      args: [id, split.shoe_id, split.km],
    })),
  ]);
}

export async function getActivityStreamsJson(activityId: number): Promise<string | null> {
  const row = await one<{ json: string }>(
    "SELECT json FROM activity_streams WHERE activity_id = ?",
    [activityId]
  );
  return row?.json ?? null;
}

export async function saveActivityStreams(activityId: number, json: string): Promise<void> {
  await exec(
    `INSERT INTO activity_streams (activity_id, json, synced_at) VALUES (?, ?, ?)
     ON CONFLICT(activity_id) DO UPDATE SET json = excluded.json, synced_at = excluded.synced_at`,
    [activityId, json, new Date().toISOString()]
  );
}

export async function saveActivityDetail(id: number, detailJson: string): Promise<void> {
  await exec("UPDATE activities SET detail_json = ?, detail_synced_at = ? WHERE id = ?", [
    detailJson,
    new Date().toISOString(),
    id,
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

// ---------------------------------------------------------------------------
// Athlete thresholds + training load (fitness engine)
// ---------------------------------------------------------------------------

// Matches the migration seed; used only if the row is somehow missing.
const THRESHOLD_DEFAULTS: AthleteThresholds = {
  maxHr: 199,
  restingHr: 50,
  lthr: 176,
  thresholdPaceSPerKm: 269,
  ftpW: 150,
  restingHrEstimated: true,
  ftpProvisional: true,
  updatedAt: null,
};

interface AthleteThresholdsRow {
  max_hr: number | null;
  resting_hr: number | null;
  lthr: number | null;
  threshold_pace_s_per_km: number | null;
  ftp_w: number | null;
  resting_hr_estimated: number;
  ftp_provisional: number;
  updated_at: string | null;
}

export async function getAthleteThresholds(): Promise<AthleteThresholds> {
  const row = await one<AthleteThresholdsRow>(
    `SELECT max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w,
            resting_hr_estimated, ftp_provisional, updated_at
     FROM athlete_thresholds WHERE id = 1`
  );
  if (!row) return { ...THRESHOLD_DEFAULTS };
  return {
    maxHr: row.max_hr ?? THRESHOLD_DEFAULTS.maxHr,
    restingHr: row.resting_hr ?? THRESHOLD_DEFAULTS.restingHr,
    lthr: row.lthr ?? THRESHOLD_DEFAULTS.lthr,
    thresholdPaceSPerKm: row.threshold_pace_s_per_km ?? THRESHOLD_DEFAULTS.thresholdPaceSPerKm,
    ftpW: row.ftp_w ?? THRESHOLD_DEFAULTS.ftpW,
    restingHrEstimated: row.resting_hr_estimated !== 0,
    ftpProvisional: row.ftp_provisional !== 0,
    updatedAt: row.updated_at ?? null,
  };
}

export interface AthleteThresholdFields {
  maxHr: number;
  restingHr: number;
  lthr: number;
  thresholdPaceSPerKm: number;
  ftpW: number;
  restingHrEstimated: boolean;
  ftpProvisional: boolean;
}

export async function saveAthleteThresholds(fields: AthleteThresholdFields): Promise<void> {
  await exec(
    `INSERT INTO athlete_thresholds
       (id, max_hr, resting_hr, lthr, threshold_pace_s_per_km, ftp_w,
        resting_hr_estimated, ftp_provisional, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       max_hr = excluded.max_hr,
       resting_hr = excluded.resting_hr,
       lthr = excluded.lthr,
       threshold_pace_s_per_km = excluded.threshold_pace_s_per_km,
       ftp_w = excluded.ftp_w,
       resting_hr_estimated = excluded.resting_hr_estimated,
       ftp_provisional = excluded.ftp_provisional,
       updated_at = excluded.updated_at`,
    [
      fields.maxHr,
      fields.restingHr,
      fields.lthr,
      fields.thresholdPaceSPerKm,
      fields.ftpW,
      fields.restingHrEstimated ? 1 : 0,
      fields.ftpProvisional ? 1 : 0,
      new Date().toISOString(),
    ]
  );
}

export interface ActivityLoadRow {
  tss: number;
  method: string | null;
  intensity_factor: number | null;
  source: string;
}

export async function getActivityLoad(activityId: number): Promise<ActivityLoadRow | null> {
  return one<ActivityLoadRow>(
    "SELECT tss, method, intensity_factor, source FROM activity_load WHERE activity_id = ? AND tss IS NOT NULL",
    [activityId]
  );
}

/** Manual override: keeps any existing method, clears the intensity factor. */
export async function setActivityLoadManual(activityId: number, tss: number): Promise<void> {
  await exec(
    `INSERT INTO activity_load (activity_id, tss, method, intensity_factor, source, computed_at)
     VALUES (?, ?, NULL, NULL, 'manual', ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       tss = excluded.tss,
       source = 'manual',
       intensity_factor = NULL,
       computed_at = excluded.computed_at`,
    [activityId, tss, new Date().toISOString()]
  );
}

const ACTIVITY_LOAD_FIELDS =
  "id, sport_type, moving_time_s, distance_km, avg_hr, avg_pace_s_per_km, rpe, raw_json";

interface ActivityLoadInput {
  id: number;
  sport_type: string | null;
  moving_time_s: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
  rpe: number | null;
  raw_json: string | null;
}

const UPSERT_AUTO_LOAD_SQL = `INSERT INTO activity_load
    (activity_id, tss, method, intensity_factor, source, computed_at)
  VALUES (?, ?, ?, ?, 'auto', ?)
  ON CONFLICT(activity_id) DO UPDATE SET
    tss = excluded.tss,
    method = excluded.method,
    intensity_factor = excluded.intensity_factor,
    computed_at = excluded.computed_at
  WHERE activity_load.source != 'manual'`;

/** Bulk auto upsert; never clobbers rows the athlete edited by hand. */
export async function upsertActivityLoads(
  rows: { activityId: number; tss: number; method: LoadMethod; intensityFactor: number | null }[]
): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await batchWrite(
      rows.slice(i, i + CHUNK).map((r) => ({
        sql: UPSERT_AUTO_LOAD_SQL,
        args: [r.activityId, r.tss, r.method, r.intensityFactor, now],
      }))
    );
  }
}

export async function listActivityLoadsForPmc(): Promise<{ started_at: string; tss: number }[]> {
  return many<{ started_at: string; tss: number }>(
    `SELECT a.started_at AS started_at, l.tss AS tss
     FROM activities a
     JOIN activity_load l ON l.activity_id = a.id
     WHERE a.status = 'confirmed' AND l.tss IS NOT NULL AND a.started_at IS NOT NULL
     ORDER BY a.started_at ASC`
  );
}

/** Recomputes every confirmed activity's load; returns the auto rows written. */
export async function recomputeAllLoads(): Promise<{ count: number }> {
  const thresholds = await getAthleteThresholds();
  const activities = await many<ActivityLoadInput>(
    `SELECT ${ACTIVITY_LOAD_FIELDS} FROM activities WHERE status = 'confirmed'`
  );
  const rows: { activityId: number; tss: number; method: LoadMethod; intensityFactor: number | null }[] =
    [];
  for (const activity of activities) {
    const load = computeLoad(activity, thresholds);
    if (load) {
      rows.push({
        activityId: activity.id,
        tss: load.tss,
        method: load.method,
        intensityFactor: load.intensityFactor,
      });
    }
  }
  await upsertActivityLoads(rows);
  return { count: rows.length };
}

/** Recompute a single activity as an auto row, overriding any manual value. */
export async function recomputeActivityLoad(activityId: number): Promise<void> {
  const thresholds = await getAthleteThresholds();
  const activity = await one<ActivityLoadInput>(
    `SELECT ${ACTIVITY_LOAD_FIELDS} FROM activities WHERE id = ?`,
    [activityId]
  );
  if (!activity) return;
  const load = computeLoad(activity, thresholds);
  if (!load) {
    await exec("DELETE FROM activity_load WHERE activity_id = ?", [activityId]);
    return;
  }
  await exec(
    `INSERT INTO activity_load (activity_id, tss, method, intensity_factor, source, computed_at)
     VALUES (?, ?, ?, ?, 'auto', ?)
     ON CONFLICT(activity_id) DO UPDATE SET
       tss = excluded.tss,
       method = excluded.method,
       intensity_factor = excluded.intensity_factor,
       source = 'auto',
       computed_at = excluded.computed_at`,
    [activityId, load.tss, load.method, load.intensityFactor, new Date().toISOString()]
  );
}

// ---------------------------------------------------------------------------
// AI coach: per-activity chat history + weekly digest cache
// ---------------------------------------------------------------------------

export interface ActivityChatRow {
  id: number;
  activity_id: number;
  role: string;
  content: string;
  created_at: string;
}

export async function listActivityChat(activityId: number): Promise<ActivityChatRow[]> {
  return many<ActivityChatRow>(
    `SELECT id, activity_id, role, content, created_at
     FROM activity_chat WHERE activity_id = ? ORDER BY id ASC`,
    [activityId]
  );
}

export async function addActivityChatMessage(
  activityId: number,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await exec("INSERT INTO activity_chat (activity_id, role, content) VALUES (?, ?, ?)", [
    activityId,
    role,
    content,
  ]);
}

export async function clearActivityChat(activityId: number): Promise<void> {
  await exec("DELETE FROM activity_chat WHERE activity_id = ?", [activityId]);
}

export interface WeeklyDigest {
  generatedAt: string;
  text: string;
}

const WEEKLY_DIGEST_KEY = "weekly_digest";

export async function getWeeklyDigest(): Promise<WeeklyDigest | null> {
  const raw = await getMeta(WEEKLY_DIGEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WeeklyDigest>;
    if (typeof parsed.text === "string" && typeof parsed.generatedAt === "string") {
      return { generatedAt: parsed.generatedAt, text: parsed.text };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setWeeklyDigest(text: string): Promise<WeeklyDigest> {
  const value: WeeklyDigest = { generatedAt: new Date().toISOString(), text };
  await setMeta(WEEKLY_DIGEST_KEY, JSON.stringify(value));
  return value;
}

/** Minimal fields for the weekly digest context, confirmed activities only. */
export interface DigestActivity {
  name: string | null;
  sport_type: string | null;
  started_at: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
}

export async function listActivitiesSince(iso: string): Promise<DigestActivity[]> {
  return many<DigestActivity>(
    `SELECT name, sport_type, started_at, distance_km, moving_time_s, avg_hr, avg_pace_s_per_km
     FROM activities
     WHERE status = 'confirmed' AND started_at IS NOT NULL AND started_at >= ?
     ORDER BY started_at ASC`,
    [iso]
  );
}
