import { describe, expect, it } from "vitest";
import { computeReadiness, mean, sampleStdDev, type ReadinessInputs } from "@/lib/readiness";

// A fully-present, neutral-to-good day used as the base for focused tweaks.
function baseInputs(over: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    hrv: { today: 4.1, baseline7: 4.1, mean60: 4.1, sd60: 0.2 }, // z = 0
    rhr: { today: 48, baseline: 48 }, // at baseline
    sleep: { durationMin: 480, needMin: 480, quality: 80 },
    energy: { bodyBattery: 70, stress: null },
    load: { tsb: 0, acwr: 1.0 },
    subjective: null,
    sickness: false,
    injury: false,
    hrvBaselineDays: 60,
    ...over,
  };
}

describe("computeReadiness", () => {
  it("scores a neutral full-data day and lands Ready (known value)", () => {
    // hrv 60, sleep 92, load 83.3, rhr 85, energy 70; core weights sum to 1.
    // 60*.30 + 92*.25 + 83.3*.20 + 85*.15 + 70*.10 = 77.41 -> 77.
    const r = computeReadiness(baseInputs());
    expect(r.score).toBe(77);
    expect(r.band).toBe("ready");
    expect(r.redFlag).toBeNull();
    expect(r.lowConfidence).toBe(false);
    expect(r.components.map((c) => c.key).sort()).toEqual(
      ["energy", "hrv", "load", "rhr", "sleep"].sort()
    );
    // weights renormalize to sum 1 over present components.
    expect(r.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 5);
  });

  it("drops a suppressed HRV day toward Caution/Rest", () => {
    const r = computeReadiness(
      baseInputs({ hrv: { today: 3.7, baseline7: 3.8, mean60: 4.1, sd60: 0.2 } }) // z = -1.5
    );
    // hrv z=-1.5 -> 60 + 20*-1.5 = 30.
    expect(r.components.find((c) => c.key === "hrv")?.sub).toBe(30);
    expect(r.score).toBeLessThan(77);
  });

  it("caps a parasympathetic-saturation HRV spike rather than rewarding it", () => {
    const r = computeReadiness(
      baseInputs({ hrv: { today: 4.7, baseline7: 4.7, mean60: 4.1, sd60: 0.2 } }) // z = +3
    );
    expect(r.components.find((c) => c.key === "hrv")?.sub).toBe(85);
  });

  it("penalizes an elevated resting HR", () => {
    const r = computeReadiness(baseInputs({ rhr: { today: 53, baseline: 48 } })); // +5 bpm
    // 85 - 6*5 = 55.
    expect(r.components.find((c) => c.key === "rhr")?.sub).toBe(55);
  });

  it("applies the ACWR spike guardrail to the load component", () => {
    const r = computeReadiness(baseInputs({ load: { tsb: 25, acwr: 1.5 } }));
    // tsb 25 -> 100; acwr 1.5 -> factor 0.7 -> 70.
    expect(r.components.find((c) => c.key === "load")?.sub).toBe(70);
  });

  it("forces the band down to Caution on a sickness flag even with a high score", () => {
    const r = computeReadiness(baseInputs({ sickness: true }));
    expect(r.score).toBeGreaterThanOrEqual(70); // the raw number is still Ready-level
    expect(r.band).toBe("caution"); // but capped
    expect(r.redFlag).toEqual({ reason: "sickness" });
  });

  it("fires the acute HRV+RHR crash override", () => {
    const r = computeReadiness(
      baseInputs({
        hrv: { today: 3.5, baseline7: 3.9, mean60: 4.1, sd60: 0.2 }, // today z = -3
        rhr: { today: 55, baseline: 48 }, // +7 bpm
      })
    );
    expect(r.redFlag).toEqual({ reason: "hrv_rhr_crash" });
    expect(r.band).not.toBe("ready");
  });

  it("degrades gracefully: fewer components still score, weights renormalize", () => {
    const r = computeReadiness({
      hrv: null,
      rhr: { today: 48, baseline: 48 },
      sleep: { durationMin: 480, needMin: 480, quality: 80 },
      energy: { bodyBattery: 70, stress: null },
      load: null,
      subjective: null,
      sickness: false,
      injury: false,
      hrvBaselineDays: 0,
    });
    expect(r.components.map((c) => c.key).sort()).toEqual(["energy", "rhr", "sleep"].sort());
    expect(r.components.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 5);
    expect(r.score).toBeGreaterThan(0);
  });

  it("marks low confidence with an immature HRV baseline or too few components", () => {
    expect(computeReadiness(baseInputs({ hrvBaselineDays: 5 })).lowConfidence).toBe(true);
    const twoComponents = computeReadiness({
      hrv: null,
      rhr: { today: 48, baseline: 48 },
      sleep: { durationMin: 480, needMin: 480, quality: null },
      energy: null,
      load: null,
      subjective: null,
      sickness: false,
      injury: false,
      hrvBaselineDays: 60,
    });
    expect(twoComponents.lowConfidence).toBe(true);
  });

  it("uses the subjective weight set and maps Hooper ratings", () => {
    const r = computeReadiness(
      baseInputs({
        subjective: { fatigue: 1, soreness: 5, stress: 3, mood: 5 },
      })
    );
    // fatigue 1 -> 100, soreness 5 -> 0, stress 3 -> 50, mood 5 -> 100; avg 62.5.
    expect(r.components.find((c) => c.key === "subjective")?.sub).toBe(62.5);
    // subjective weight is 0.15 before renormalization; present alongside 5 core.
    expect(r.components.find((c) => c.key === "subjective")).toBeDefined();
  });

  it("reports the top negative component for the coach", () => {
    const r = computeReadiness(
      baseInputs({ rhr: { today: 60, baseline: 48 } }) // rhr crushed to floor
    );
    expect(r.topNegative).toBe("rhr");
  });
});

describe("baseline stats", () => {
  it("mean and sample stddev", () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4, 6])).toBe(4);
    expect(sampleStdDev([5])).toBeNull(); // no spread from one point
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
});
