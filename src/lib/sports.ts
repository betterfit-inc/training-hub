export type SportCategory =
  | "run"
  | "bike"
  | "strength"
  | "walk"
  | "elliptical"
  | "swim"
  | "other";

export const SPORT_CATEGORIES: Array<{ key: SportCategory; label: string }> = [
  { key: "run", label: "Run" },
  { key: "bike", label: "Bike" },
  { key: "strength", label: "Strength" },
  { key: "walk", label: "Walk" },
  { key: "elliptical", label: "Elliptical" },
  { key: "swim", label: "Swim" },
  { key: "other", label: "Other" },
];

export function categoryLabel(key: SportCategory): string {
  return SPORT_CATEGORIES.find((c) => c.key === key)?.label ?? "Other";
}

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
