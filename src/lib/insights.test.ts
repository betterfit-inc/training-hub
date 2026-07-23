import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInsights } from "@/lib/insights";
import type { Activity } from "@/lib/types";

function activity(overrides: Partial<Activity>): Activity {
  return {
    id: 1,
    strava_id: null,
    name: null,
    sport_type: "Run",
    started_at: null,
    distance_km: 5,
    moving_time_s: 1500,
    avg_pace_s_per_km: null,
    avg_hr: null,
    elevation_gain_m: null,
    status: "confirmed",
    rpe: null,
    feeling: null,
    workout_notes: null,
    health_notes: null,
    raw_json: null,
    detail_json: null,
    detail_synced_at: null,
    bike_id: null,
    bike_name: null,
    is_race: 0,
    goal_pace_s_per_km: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// An enormous window so the recency filter never excludes the fixed timestamps;
// this isolates the day-bucketing logic under test.
const ALL_DAYS = 1_000_000;

// T3.4 regression: day bucketing keys off the stored UTC instant, so two
// activities on the same UTC day count as one active day in any timezone. We
// force Asia/Tokyo (UTC+9) so the buggy local-getter dayKey pushes the 23:30Z
// activity to the next local day and wrongly reports two active days.
describe("insights day bucketing is timezone-independent (T3.4)", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Asia/Tokyo";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("counts two activities on the same UTC day as one active day", () => {
    const insights = computeInsights(
      [
        activity({ id: 1, started_at: "2026-03-15T00:30:00Z" }),
        activity({ id: 2, started_at: "2026-03-15T23:30:00Z" }),
      ],
      ALL_DAYS
    );
    expect(insights.sessions).toBe(2);
    expect(insights.activeDays).toBe(1);
    expect(insights.categories[0]?.activeDays).toBe(1);
  });
});
