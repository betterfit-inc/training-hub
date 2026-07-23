import type { Activity } from "./types";

export type RaceCategory =
  "marathon" | "half" | "30k" | "15k" | "12k" | "10k" | "5k" | "trail" | "other";

// Road-race distance bands in km. A race snaps to the nearest standard distance;
// gaps between bands (e.g. 17–19 km or 23–27 km) fall through to "other".
// Adjacent bands share a cut point, so some bounds double as a neighbour's edge.
const MARATHON_MIN_KM = 40; // also the 30k upper bound
const HALF_MIN_KM = 19;
const HALF_MAX_KM = 23;
const K30_MIN_KM = 27;
const K15_MIN_KM = 14; // also the 12k upper bound
const K15_MAX_KM = 17;
const K12_MIN_KM = 11; // also the 10k upper bound
const K10_MIN_KM = 8; // also the 5k upper bound

/**
 * Buckets a race by name and distance. Trail is detected by name (the distance
 * varies); road races snap to the nearest standard distance.
 */
export function raceCategory(
  activity: Pick<Activity, "name" | "sport_type" | "distance_km">
): RaceCategory {
  const name = (activity.name ?? "").toLowerCase();
  const sport = (activity.sport_type ?? "").toLowerCase();
  if (name.includes("trail") || sport.includes("trail")) return "trail";
  const km = activity.distance_km ?? 0;
  if (km >= MARATHON_MIN_KM) return "marathon";
  if (km >= HALF_MIN_KM && km <= HALF_MAX_KM) return "half";
  if (km >= K30_MIN_KM && km < MARATHON_MIN_KM) return "30k";
  if (km >= K15_MIN_KM && km < K15_MAX_KM) return "15k";
  if (km >= K12_MIN_KM && km < K15_MIN_KM) return "12k";
  if (km >= K10_MIN_KM && km < K12_MIN_KM) return "10k";
  if (km > 0 && km < K10_MIN_KM) return "5k";
  return "other";
}

/** Categories in display order (longest to shortest), trail and other last. */
export const RACE_CATEGORY_ORDER: RaceCategory[] = [
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
