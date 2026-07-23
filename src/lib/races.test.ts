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

  // T3.11 — the bands must be contiguous: every distance between the smallest
  // band and ultra resolves to a real category, with no dead gaps.
  it("fills the old 15k/half gap (17–18 km)", () => {
    expect(raceCategory(race(17))).toBe("15k"); // was "other"
    expect(raceCategory(race(17.9))).toBe("15k"); // was "other"
    expect(raceCategory(race(18))).toBe("half"); // was "other"
  });

  it("fills the old half/30k gap (23–26 km)", () => {
    expect(raceCategory(race(24))).toBe("half"); // was "other"
    expect(raceCategory(race(25))).toBe("30k"); // was "other"
    expect(raceCategory(race(26))).toBe("30k"); // was "other"
  });

  it("has contiguous band edges with no gaps", () => {
    expect(raceCategory(race(7.9))).toBe("5k");
    expect(raceCategory(race(8))).toBe("10k");
    expect(raceCategory(race(11))).toBe("12k");
    expect(raceCategory(race(14))).toBe("15k");
    expect(raceCategory(race(40))).toBe("marathon");
    expect(raceCategory(race(44.9))).toBe("marathon");
  });

  // T3.11 — ultra bucket: clearly-ultra distances are no longer lumped as marathon.
  it("buckets clearly-ultra distances as ultra, not marathon", () => {
    expect(raceCategory(race(45))).toBe("ultra"); // was "marathon"
    expect(raceCategory(race(50))).toBe("ultra"); // was "marathon"
    expect(raceCategory(race(100))).toBe("ultra"); // was "marathon"
  });

  // T3.11 — sport guard: only running-type sports get a running race category.
  it("does not give non-running sports a running race category", () => {
    expect(raceCategory(race(42.2, "City Marathon", "Ride"))).toBe("other"); // was "marathon"
    expect(raceCategory(race(21.1, "Gran Fondo", "Ride"))).toBe("other"); // was "half"
    expect(raceCategory(race(10, "Open Water", "Swim"))).toBe("other"); // was "10k"
  });

  it("still buckets running variants (VirtualRun, TrailRun) as runs", () => {
    expect(raceCategory(race(10, "", "VirtualRun"))).toBe("10k");
    expect(raceCategory(race(30, "Mountain Trail", "TrailRun"))).toBe("trail");
  });
});
