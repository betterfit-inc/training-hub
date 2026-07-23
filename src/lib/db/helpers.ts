import { client } from "./client";
import type { InStatement } from "./client";
import { ensureMigrated } from "./migrations";

/**
 * Clears a Strava gear_id off every OTHER row of `table` so the unique gear
 * mapping holds before it is (re)assigned. On create there is no owning row yet,
 * so `exceptId` is omitted and every current holder is cleared; on update the
 * owning row is spared via `AND id != ?`. Emit this immediately before the
 * assigning INSERT/UPDATE, exactly where each caller ran it inline before.
 */
export function clearGearFromOthers(
  table: "shoes" | "bikes",
  gearId: string,
  exceptId?: number
): InStatement {
  if (exceptId === undefined) {
    return {
      sql: `UPDATE ${table} SET strava_gear_id = NULL WHERE strava_gear_id = ?`,
      args: [gearId],
    };
  }
  return {
    sql: `UPDATE ${table} SET strava_gear_id = NULL WHERE strava_gear_id = ? AND id != ?`,
    args: [gearId, exceptId],
  };
}

type Args = Array<string | number | null>;

export async function exec(sql: string, args: Args = []) {
  await ensureMigrated();
  return client.execute({ sql, args });
}

export async function many<T>(sql: string, args: Args = []): Promise<T[]> {
  return (await exec(sql, args)).rows as unknown as T[];
}

export async function one<T>(sql: string, args: Args = []): Promise<T | null> {
  const result = await exec(sql, args);
  return result.rows.length > 0 ? (result.rows[0] as unknown as T) : null;
}

export async function batchWrite(statements: InStatement[]) {
  await ensureMigrated();
  return client.batch(statements, "write");
}

// Max statements per batched write, to keep a single transaction bounded.
export const WRITE_CHUNK = 200;

/**
 * Decode a SQLite integer boolean to a real `boolean` at the read seam. SQLite
 * has no boolean type, so flags are stored as 0/1 (and read back as numbers, or
 * null for an absent column). This is the single place that conversion happens,
 * so domain types can carry `boolean` instead of leaking 0/1 into the UI (G3.6).
 */
export function sqliteBool(value: number | null | undefined): boolean {
  return value != null && value !== 0;
}
