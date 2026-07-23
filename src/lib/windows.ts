// Time-window selector shared by the fitness and insights pages. Each page
// exposes its own ordered subset of window keys; the day count behind every key
// lives here once so the two pages can never drift.

/** Canonical day span for each named time window; "all" is unbounded. */
const WINDOW_DAYS = {
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "6m": 183,
  "1y": 365,
  all: Number.POSITIVE_INFINITY,
} as const;

export type WindowKey = keyof typeof WINDOW_DAYS;

/**
 * Build an ordered `{ key, days }` list from a subset of window keys, pulling
 * each day count from the canonical map. Keeps the literal key types so callers
 * can index their per-page label dictionaries.
 */
export function timeWindows<K extends WindowKey>(keys: readonly K[]): { key: K; days: number }[] {
  return keys.map((key) => ({ key, days: WINDOW_DAYS[key] }));
}
