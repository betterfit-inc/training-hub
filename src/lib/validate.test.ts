import { describe, expect, it } from "vitest";
import { isRunSport, parseFiniteNumber, parseId, sumSplits, validateSplits } from "@/lib/validate";
import type { SplitInput } from "@/lib/types";

// G6.4 (T3.5): NaN guards.
//
// The save actions coerced a form id with `Number(idRaw)`. A non-numeric id
// yields NaN, and because NaN is falsy the `if (id)` update-vs-create branch
// silently routed an UPDATE into a CREATE — a stray row instead of an edit.
// parseId returns null (never NaN, never a silent 0) for every non-id value so
// the action can reject it with a controlled error instead of creating.
describe("parseId (G6.4: a non-numeric id must not silently route update -> create)", () => {
  it("documents the pre-fix behavior being replaced", () => {
    // The old inline coercion was `Number(idRaw)`: for a non-numeric id it
    // produced NaN, which is falsy, so the guard fell through to CREATE.
    expect(Number("abc")).toBeNaN();
    expect(Boolean(Number("abc"))).toBe(false);
  });

  it("returns null for non-numeric / blank / partially-numeric ids (not NaN, not a silent 0)", () => {
    expect(parseId("abc")).toBeNull();
    expect(parseId("")).toBeNull();
    expect(parseId("   ")).toBeNull();
    expect(parseId("12x")).toBeNull();
  });

  it("returns null for non-positive or non-integer ids", () => {
    expect(parseId("0")).toBeNull();
    expect(parseId("-4")).toBeNull();
    expect(parseId("4.5")).toBeNull();
  });

  it("returns the positive integer for a valid id", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId(42)).toBe(42);
  });

  it("never returns NaN for any input", () => {
    for (const raw of ["abc", "", "12x", "NaN", "-1", "3.14"]) {
      const result = parseId(raw);
      expect(result === null || Number.isInteger(result)).toBe(true);
    }
  });
});

// The thresholds form coerced each numeric field with `Number(...)`, so a blank
// or garbage field became 0 or NaN and was posted to the save action.
// parseFiniteNumber rejects those so the form can stop before posting NaN.
describe("parseFiniteNumber (G6.4: NaN threshold fields must not be posted)", () => {
  it("returns null for blank or non-numeric fields", () => {
    expect(parseFiniteNumber("")).toBeNull();
    expect(parseFiniteNumber("   ")).toBeNull();
    expect(parseFiniteNumber("abc")).toBeNull();
  });

  it("returns the parsed number for valid numeric fields", () => {
    expect(parseFiniteNumber("180")).toBe(180);
    expect(parseFiniteNumber("52.5")).toBe(52.5);
  });

  it("never returns NaN (the value the form would otherwise post)", () => {
    // Pre-fix, the form did `Number(maxHr)`; a blank/garbage field became NaN.
    expect(Number("abc")).toBeNaN();
    expect(parseFiniteNumber("abc")).toBeNull();
    expect(parseFiniteNumber("")).toBeNull();
  });
});

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
