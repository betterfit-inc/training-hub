import { describe, expect, it } from "vitest";
import { computeRecovery, type RecoveryActivity, type RecoveryContext } from "@/lib/recovery";

const NOW = "2026-07-23T18:00:00.000Z";

// Neutral context: CTL 50 -> fitness mult 1, TSB 0 -> no amplification, no HRV.
const CTX: RecoveryContext = { ctl: 50, tsb: 0, hrvStatus: null, restingHr: null, lthr: null };

function act(over: Partial<RecoveryActivity>): RecoveryActivity {
  return {
    id: 1,
    name: "session",
    finishedAt: "2026-07-23T12:00:00.000Z",
    intensityFactor: 1.0,
    method: "pace",
    tss: null,
    avgHr: null,
    durationS: 3600,
    ...over,
  };
}

describe("computeRecovery", () => {
  it("is zero with no activities", () => {
    expect(computeRecovery([], CTX, NOW).remainingHours).toBe(0);
  });

  it("a single 1h threshold session costs ~24h then drains 1h/h (known value)", () => {
    const r = computeRecovery(
      [act({ intensityFactor: 1.0, finishedAt: "2026-07-23T12:00:00.000Z" })],
      CTX,
      NOW
    );
    // cost 24, drained 6h to now -> 18.
    expect(r.remainingHours).toBeCloseTo(18, 5);
    expect(r.drainRatePerHour).toBe(1);
  });

  it("compounds: a second hard session on residual debt costs MORE than the first", () => {
    const r = computeRecovery(
      [
        act({ id: 1, intensityFactor: 1.0, finishedAt: "2026-07-23T09:00:00.000Z" }),
        act({ id: 2, intensityFactor: 1.0, finishedAt: "2026-07-23T12:00:00.000Z" }),
      ],
      CTX,
      NOW
    );
    // contributions are most-recent-first: [B, A].
    const [second, first] = r.contributions;
    expect(first.addedHours).toBeCloseTo(24, 1);
    expect(second.addedHours).toBeGreaterThan(first.addedHours); // debt amplification
    expect(r.remainingHours).toBeCloseTo(49.5, 1);
  });

  it("stacking close together leaves more debt than the same two spaced far apart", () => {
    const close = computeRecovery(
      [
        act({ id: 1, finishedAt: "2026-07-23T09:00:00.000Z" }),
        act({ id: 2, finishedAt: "2026-07-23T12:00:00.000Z" }),
      ],
      CTX,
      NOW
    );
    const far = computeRecovery(
      [
        act({ id: 1, finishedAt: "2026-07-20T12:00:00.000Z" }), // 3 days earlier -> fully drained
        act({ id: 2, finishedAt: "2026-07-23T12:00:00.000Z" }),
      ],
      CTX,
      NOW
    );
    expect(close.remainingHours).toBeGreaterThan(far.remainingHours);
  });

  it("an easy/active-recovery session does NOT increase debt — it ticks it down", () => {
    const hardOnly = computeRecovery(
      [act({ id: 1, intensityFactor: 1.0, finishedAt: "2026-07-23T12:00:00.000Z" })],
      CTX,
      NOW
    );
    const hardThenEasy = computeRecovery(
      [
        act({ id: 1, intensityFactor: 1.0, finishedAt: "2026-07-23T12:00:00.000Z" }),
        act({ id: 2, intensityFactor: 0.6, finishedAt: "2026-07-23T15:00:00.000Z" }),
      ],
      CTX,
      NOW
    );
    // The easy session's own contribution is <= 0 (never a jump).
    const easy = hardThenEasy.contributions.find((c) => c.activityId === 2);
    expect(easy?.addedHours).toBeLessThanOrEqual(0);
    // And the resulting debt is no higher than the hard session alone.
    expect(hardThenEasy.remainingHours).toBeLessThanOrEqual(hardOnly.remainingHours);
  });

  it("intensity dominates volume: a long easy run costs less than a short hard one", () => {
    const longEasy = computeRecovery(
      [act({ intensityFactor: 0.65, durationS: 3 * 3600 })],
      CTX,
      NOW
    );
    const shortHard = computeRecovery(
      [act({ intensityFactor: 1.0, durationS: 0.5 * 3600 })],
      CTX,
      NOW
    );
    expect(longEasy.remainingHours).toBeLessThan(shortHard.remainingHours);
    expect(longEasy.remainingHours).toBeCloseTo(0, 5); // easy long ~ zero debt
  });

  it("decays to zero given enough rest", () => {
    const r = computeRecovery(
      [act({ intensityFactor: 1.0, finishedAt: "2026-07-23T12:00:00.000Z" })],
      CTX,
      "2026-07-30T00:00:00.000Z" // a week later
    );
    expect(r.remainingHours).toBe(0);
  });

  it("HRV modulation changes the drain rate (recovered faster, suppressed slower)", () => {
    const activities = [act({ intensityFactor: 1.0, finishedAt: "2026-07-23T12:00:00.000Z" })];
    const recovered = computeRecovery(activities, { ...CTX, hrvStatus: "recovered" }, NOW);
    const suppressed = computeRecovery(activities, { ...CTX, hrvStatus: "suppressed" }, NOW);
    expect(recovered.remainingHours).toBeLessThan(suppressed.remainingHours);
    expect(recovered.drainRatePerHour).toBeGreaterThan(suppressed.drainRatePerHour);
  });

  it("negative TSB and low fitness both make a hard session cost more", () => {
    const fresh = computeRecovery([act({})], { ...CTX, tsb: 0, ctl: 50 }, NOW);
    const fatigued = computeRecovery([act({})], { ...CTX, tsb: -30, ctl: 50 }, NOW);
    const unfit = computeRecovery([act({})], { ...CTX, ctl: 20 }, NOW);
    expect(fatigued.remainingHours).toBeGreaterThan(fresh.remainingHours);
    expect(unfit.remainingHours).toBeGreaterThan(fresh.remainingHours);
  });

  it("excludes future-dated activities (valid at the requested asOf)", () => {
    const future = computeRecovery(
      [act({ intensityFactor: 1.0, finishedAt: "2026-07-24T12:00:00.000Z" })], // after NOW
      CTX,
      NOW
    );
    expect(future.remainingHours).toBe(0);
    expect(future.contributions).toHaveLength(0);
  });

  it("still costs an RPE-only session by implying intensity from TSS + duration", () => {
    const r = computeRecovery(
      // No IF, no HR, no thresholds — but a real stored load over a known duration.
      [act({ intensityFactor: null, avgHr: null, tss: 120, durationS: 3600 })],
      CTX,
      NOW
    );
    expect(r.remainingHours).toBeGreaterThan(0);
  });

  it("derives intensity from HR when IF is absent", () => {
    const r = computeRecovery(
      [act({ intensityFactor: null, avgHr: 170 })],
      { ...CTX, restingHr: 48, lthr: 165 }, // (170-48)/(165-48) ~ 1.04 -> hard
      NOW
    );
    expect(r.remainingHours).toBeGreaterThan(0);
  });
});
