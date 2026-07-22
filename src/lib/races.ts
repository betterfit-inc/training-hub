import type { Activity } from "./types";

export type RaceCategory =
  "marathon" | "half" | "30k" | "15k" | "12k" | "10k" | "5k" | "trail" | "other";

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
  if (km >= 40) return "marathon";
  if (km >= 19 && km <= 23) return "half";
  if (km >= 27 && km < 40) return "30k";
  if (km >= 14 && km < 17) return "15k";
  if (km >= 11 && km < 14) return "12k";
  if (km >= 8 && km < 11) return "10k";
  if (km > 0 && km < 8) return "5k";
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
