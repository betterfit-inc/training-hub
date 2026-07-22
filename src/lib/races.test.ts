import { describe, expect, it } from "vitest";
import { raceCategory } from "@/lib/races";

function race(distanceKm: number, name = "", sportType = "Run") {
  return { name, sport_type: sportType, distance_km: distanceKm };
}

describe("raceCategory", () => {
  it("buckets standard road distances", () => {
    expect(raceCategory(race(5))).toBe("5k");
    expect(raceCategory(race(10))).toBe("10k");
    expect(raceCategory(race(12))).toBe("12k");
    expect(raceCategory(race(15))).toBe("15k");
    expect(raceCategory(race(21.1))).toBe("half");
    expect(raceCategory(race(30))).toBe("30k");
    expect(raceCategory(race(42.2))).toBe("marathon");
  });

  it("detects trail races by name regardless of distance", () => {
    expect(raceCategory(race(21.1, "Serra do Mar Trail"))).toBe("trail");
  });

  it("returns other for a zero distance", () => {
    expect(raceCategory(race(0))).toBe("other");
  });
});
