import { sportCategory } from "./sports";
import type { Activity } from "./types";

export type RaceCategory =
  "ultra" | "marathon" | "half" | "30k" | "15k" | "12k" | "10k" | "5k" | "trail" | "other";

// Road-race distance bands in km, expressed as the inclusive lower bound of each
// band. The bands are contiguous — a band runs from its own bound up to (but not
// including) the next larger bound — so every positive distance snaps to exactly
// one standard distance with no dead gaps. A race lands in a band when its
// distance is the largest bound it meets or exceeds:
//   0 < km <  8  → 5k
//   8 ≤ km < 11  → 10k
//  11 ≤ km < 14  → 12k
//  14 ≤ km < 18  → 15k
//  18 ≤ km < 25  → half
//  25 ≤ km < 40  → 30k
//  40 ≤ km < 45  → marathon
//       km ≥ 45  → ultra
const ULTRA_MIN_KM = 45; // ~3 km over a 42.2 km marathon: clears long-measured marathons, catches 50k+
const MARATHON_MIN_KM = 40;
const K30_MIN_KM = 25;
const HALF_MIN_KM = 18;
const K15_MIN_KM = 14;
const K12_MIN_KM = 11;
const K10_MIN_KM = 8;

/**
 * Buckets a race by sport, name, and distance.
 *
 * Only running-type sports get a running race category; anything else (rides,
 * swims, …) returns "other", the no-category sentinel — a 42 km bike ride is not
 * a marathon. Trail is detected by name/sport (its distance varies); every other
 * running race snaps to the nearest standard road distance, with a distinct ultra
 * bucket above the marathon band.
 *
 * The run guard reuses `sportCategory` (the canonical sport bucketer) rather than
 * `isRunSport` from validate.ts: importing validate here would form the import
 * cycle races → validate → i18n → races, which the `cycles` gate forbids.
 * `sportCategory(sport) === "run"` is equivalent to `isRunSport(sport)` and lives
 * in a dependency-free leaf module.
 */
export function raceCategory(
  activity: Pick<Activity, "name" | "sport_type" | "distance_km">
): RaceCategory {
  const sport = activity.sport_type ?? "";
  if (sportCategory(sport) !== "run") return "other";

  const name = (activity.name ?? "").toLowerCase();
  if (name.includes("trail") || sport.toLowerCase().includes("trail")) return "trail";

  const km = activity.distance_km ?? 0;
  if (km <= 0) return "other";
  if (km >= ULTRA_MIN_KM) return "ultra";
  if (km >= MARATHON_MIN_KM) return "marathon";
  if (km >= K30_MIN_KM) return "30k";
  if (km >= HALF_MIN_KM) return "half";
  if (km >= K15_MIN_KM) return "15k";
  if (km >= K12_MIN_KM) return "12k";
  if (km >= K10_MIN_KM) return "10k";
  return "5k";
}

/** Categories in display order (longest to shortest), trail and other last. */
export const RACE_CATEGORY_ORDER: RaceCategory[] = [
  "ultra",
  "marathon",
  "half",
  "30k",
  "15k",
  "12k",
  "10k",
  "5k",
  "trail",
  "other",
];
