import type { SplitError } from "./i18n";
import type { SplitInput } from "./types";

export function isRunSport(sport: string | null | undefined): boolean {
  return (sport ?? "").toLowerCase().includes("run");
}

export function sumSplits(splits: SplitInput[]): number {
  return splits.reduce((acc, s) => acc + (Number.isFinite(s.km) ? s.km : 0), 0);
}

/**
 * Shared split validation for the review queue and the activity detail editor.
 * Returns a language-neutral error code (render it with splitErrorText), or
 * null when the splits are valid.
 *
 * Rules:
 * - Every split needs a shoe and a distance greater than zero.
 * - Runs must be fully covered: split kms must add up to the activity distance.
 * - Non-run activities may have no splits at all; if they do have splits,
 *   the total cannot exceed the activity distance.
 */
export function validateSplits(
  activity: { distance_km: number | null; sport_type: string | null },
  splits: SplitInput[]
): SplitError | null {
  const run = isRunSport(activity.sport_type);
  const dist = activity.distance_km ?? 0;

  if (splits.length === 0) {
    if (run && dist > 0.05) return { code: "assignRun" };
    return null;
  }

  for (const s of splits) {
    if (s.shoe_id == null) return { code: "needShoe" };
    if (!Number.isFinite(s.km) || s.km <= 0) return { code: "positiveKm" };
  }

  if (dist > 0) {
    const total = sumSplits(splits);
    if (run && Math.abs(total - dist) > 0.05) {
      const remaining = Math.round((dist - total) * 100) / 100;
      return remaining > 0
        ? { code: "underBy", km: remaining.toFixed(2) }
        : { code: "overBy", km: Math.abs(remaining).toFixed(2) };
    }
    if (!run && total - dist > 0.05) return { code: "exceedDistance" };
  }

  return null;
}
