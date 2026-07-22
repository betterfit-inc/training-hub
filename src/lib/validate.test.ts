import { describe, expect, it } from "vitest";
import { isRunSport, sumSplits, validateSplits } from "@/lib/validate";
import type { SplitInput } from "@/lib/types";

describe("isRunSport", () => {
  it("matches any sport containing run", () => {
    expect(isRunSport("Run")).toBe(true);
    expect(isRunSport("TrailRun")).toBe(true);
    expect(isRunSport("Ride")).toBe(false);
    expect(isRunSport(null)).toBe(false);
  });
});

describe("sumSplits", () => {
  it("sums finite kilometres and ignores non-finite ones", () => {
    const splits: SplitInput[] = [
      { shoe_id: 1, km: 5 },
      { shoe_id: 1, km: 3.5 },
    ];
    expect(sumSplits(splits)).toBe(8.5);
  });
});

describe("validateSplits", () => {
  const run = { distance_km: 10, sport_type: "Run" };

  it("accepts splits that fully cover the run distance", () => {
    const splits: SplitInput[] = [
      { shoe_id: 1, km: 5 },
      { shoe_id: 1, km: 5 },
    ];
    expect(validateSplits(run, splits)).toBeNull();
  });

  it("rejects a run with no splits", () => {
    expect(validateSplits(run, [])).toEqual({ code: "assignRun" });
  });

  it("rejects a split without a shoe", () => {
    expect(validateSplits(run, [{ shoe_id: null, km: 10 }])).toEqual({ code: "needShoe" });
  });

  it("rejects a non-positive split distance", () => {
    expect(validateSplits(run, [{ shoe_id: 1, km: -1 }])).toEqual({ code: "positiveKm" });
  });

  it("reports when splits fall short of the run distance", () => {
    const short = validateSplits(run, [
      { shoe_id: 1, km: 4 },
      { shoe_id: 1, km: 4 },
    ]);
    expect(short?.code).toBe("underBy");
  });

  it("reports when splits exceed the run distance", () => {
    const over = validateSplits(run, [
      { shoe_id: 1, km: 6 },
      { shoe_id: 1, km: 6 },
    ]);
    expect(over?.code).toBe("overBy");
  });

  it("rejects non-run splits that exceed the activity distance", () => {
    const ride = { distance_km: 10, sport_type: "Ride" };
    expect(validateSplits(ride, [{ shoe_id: 1, km: 12 }])).toEqual({ code: "exceedDistance" });
  });
});
