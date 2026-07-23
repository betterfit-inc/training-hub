import { newRowKey, type SplitRow } from "@/components/splits-editor";
import { isRunSport } from "@/lib/validate";
import type { ActivityWithSplits, Feeling } from "@/lib/types";

export interface FormState {
  rows: SplitRow[];
  bikeId: number | null;
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}

export interface Summary {
  count: number;
  totalKm: number;
  perShoe: Record<string, number>;
}

export function initForm(activity: ActivityWithSplits): FormState {
  const rows: SplitRow[] = activity.splits.map((s) => ({
    key: newRowKey(),
    shoeId: s.shoe_id,
    km: s.km ? String(s.km) : "",
  }));
  if (rows.length === 0 && isRunSport(activity.sport_type) && (activity.distance_km ?? 0) > 0) {
    rows.push({ key: newRowKey(), shoeId: null, km: String(activity.distance_km) });
  }
  return {
    rows,
    bikeId: activity.bike_id,
    rpe: activity.rpe,
    feeling: activity.feeling,
    workoutNotes: activity.workout_notes ?? "",
    healthNotes: activity.health_notes ?? "",
  };
}
