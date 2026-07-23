export type SportCategory = "run" | "bike" | "strength" | "walk" | "elliptical" | "swim" | "other";

/** Sport categories in display order. Display labels live in the i18n dict (`t.sports`). */
export const SPORT_CATEGORIES: readonly SportCategory[] = [
  "run",
  "bike",
  "strength",
  "walk",
  "elliptical",
  "swim",
  "other",
];

/** Buckets a Strava sport_type into a log filter category. */
export function sportCategory(sport: string | null | undefined): SportCategory {
  const s = (sport ?? "").toLowerCase();
  if (s.includes("run")) return "run";
  if (s.includes("ride") || s.includes("bike") || s.includes("cycl")) return "bike";
  if (
    s.includes("weight") ||
    s.includes("workout") ||
    s.includes("crossfit") ||
    s.includes("intensityinterval") ||
    s.includes("pilates") ||
    s.includes("yoga")
  ) {
    return "strength";
  }
  if (s.includes("walk") || s.includes("hike")) return "walk";
  if (s.includes("swim")) return "swim";
  if (s.includes("elliptical")) return "elliptical";
  return "other";
}
