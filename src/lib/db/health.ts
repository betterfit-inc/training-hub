import { batchWrite, many, one } from "./helpers";
import type { InStatement } from "./client";
import { resolveBySource, resolveMetrics } from "../health";
import type { HealthMetric, HealthMetricInput, HealthMetricRow } from "../types";

// Data layer for the source-agnostic health metrics. Reads go through the plain
// -object many/one seam; writes are atomic batches. The source resolver lives in
// the pure src/lib/health.ts module — this file only fetches rows and hands them
// to it, so precedence logic is never duplicated here.

const HEALTH_COLUMNS = "id, date, metric, value, value_text, unit, source, recorded_at";

const UPSERT_SQL = `INSERT INTO health_metrics (date, metric, value, value_text, unit, source, recorded_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(date, metric, source) DO UPDATE SET
     value = excluded.value,
     value_text = excluded.value_text,
     unit = excluded.unit,
     recorded_at = excluded.recorded_at`;

function upsertStatement(row: HealthMetricInput): InStatement {
  return {
    sql: UPSERT_SQL,
    args: [row.date, row.metric, row.value, row.value_text, row.unit, row.source, row.recorded_at],
  };
}

/** Idempotent upsert of health rows keyed by (date, metric, source). */
export async function upsertHealthMetrics(rows: HealthMetricInput[]): Promise<void> {
  if (rows.length === 0) return;
  await batchWrite(rows.map(upsertStatement));
}

/**
 * Idempotently replace one (date, source)'s rows: delete that day+source, then
 * insert the fresh set, atomically in one write batch. This is what makes
 * re-running a day's device sync overwrite in place — a metric that disappears
 * from a later sync does not leave a stale row behind. A no-op for an empty set,
 * so a partial/failed fetch never wipes a good prior day.
 */
export async function replaceHealthMetricsForDaySource(
  date: string,
  source: string,
  rows: HealthMetricInput[]
): Promise<void> {
  if (rows.length === 0) return;
  const statements: InStatement[] = [
    { sql: "DELETE FROM health_metrics WHERE date = ? AND source = ?", args: [date, source] },
    ...rows.map(upsertStatement),
  ];
  await batchWrite(statements);
}

/** All rows (every source) for one day, for the panel's per-source display. */
export async function getHealthMetricsForDate(date: string): Promise<HealthMetricRow[]> {
  return many<HealthMetricRow>(
    `SELECT ${HEALTH_COLUMNS} FROM health_metrics WHERE date = ? ORDER BY metric, source`,
    [date]
  );
}

/** One resolved row per metric for a day (device > manual), display order. */
export async function getResolvedMetricsForDate(date: string): Promise<HealthMetricRow[]> {
  return resolveMetrics(await getHealthMetricsForDate(date));
}

/** The most recent day that has any health data, or null when the table is empty. */
export async function getLatestHealthDate(): Promise<string | null> {
  const row = await one<{ date: string }>("SELECT MAX(date) AS date FROM health_metrics");
  return row?.date ?? null;
}

/** Distinct days with data, most recent first, capped at `limit`. */
export async function listHealthDates(limit: number): Promise<string[]> {
  const rows = await many<{ date: string }>(
    "SELECT DISTINCT date FROM health_metrics ORDER BY date DESC LIMIT ?",
    [limit]
  );
  return rows.map((r) => r.date);
}

export interface HealthSeriesPoint {
  date: string;
  value: number;
}

/**
 * A resolved numeric series for one metric over an inclusive date range,
 * ascending. Rows are resolved per day (device > manual) before being reduced to
 * a value, and text-only rows are skipped. Feeds the trend charts and the
 * readiness/recovery baselines.
 */
export async function getResolvedNumericSeries(
  metric: HealthMetric,
  fromDate: string,
  toDate: string
): Promise<HealthSeriesPoint[]> {
  const rows = await many<HealthMetricRow>(
    `SELECT ${HEALTH_COLUMNS} FROM health_metrics
     WHERE metric = ? AND date >= ? AND date <= ?
     ORDER BY date ASC`,
    [metric, fromDate, toDate]
  );
  const byDate = new Map<string, HealthMetricRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.date);
    if (list) list.push(row);
    else byDate.set(row.date, [row]);
  }
  const out: HealthSeriesPoint[] = [];
  for (const [date, dayRows] of byDate) {
    const resolved = resolveBySource(dayRows);
    if (resolved && resolved.value !== null) out.push({ date, value: resolved.value });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
