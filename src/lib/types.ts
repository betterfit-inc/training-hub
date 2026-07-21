export type Feeling = "great" | "good" | "ok" | "rough" | "terrible";

export type ActivityStatus = "pending_review" | "confirmed";

export type WearStatus = "fresh" | "worn" | "critical" | "retired";

export interface Shoe {
  id: number;
  name: string;
  role: string | null;
  strava_gear_id: string | null;
  photo_path: string | null;
  initial_km: number;
  retirement_km: number | null;
  retired_at: string | null;
  created_at: string;
}

export interface ShoeWithMileage extends Shoe {
  current_km: number;
}

export interface Activity {
  id: number;
  strava_id: number | null;
  name: string | null;
  sport_type: string | null;
  started_at: string | null;
  distance_km: number | null;
  moving_time_s: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
  status: ActivityStatus;
  rpe: number | null;
  feeling: Feeling | null;
  workout_notes: string | null;
  health_notes: string | null;
  raw_json: string | null;
  detail_json: string | null;
  detail_synced_at: string | null;
  created_at: string;
}

export interface SplitWithShoe {
  id: number;
  activity_id: number;
  shoe_id: number | null;
  km: number;
  note: string | null;
  shoe_name: string | null;
  shoe_role: string | null;
}

export interface ActivityWithSplits extends Activity {
  splits: SplitWithShoe[];
}

export interface SplitInput {
  shoe_id: number | null;
  km: number;
}

export interface StravaGear {
  id: string;
  name: string;
  distance?: number;
  retired?: boolean;
}

export interface ShoeOption {
  id: number;
  name: string;
  role: string | null;
  retired: boolean;
}
