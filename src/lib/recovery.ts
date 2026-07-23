// Pure recovery engine (IO-free). ONE global, compounding, INTENSITY-driven
// recovery-debt in hours — the continuous-time analog of ATL (acute fatigue),
// NOT a per-activity timer. It is a deterministic fold over the recent activity
// sequence, recomputable at any instant, so the UI can show "recovery remaining"
// and decrement it live from `asOf`.
//
// THE CRITICAL PROPERTY: cost is intensity-driven, not volume-driven. Below a
// recovery-intensity floor (easy / active-recovery, low IF or Z1–low-Z2 HR) an
// activity adds ~0 and genuine active recovery can even DRAIN debt slightly — so
// "3h left to recover, did an easy jog -> stays flat or ticks down, never jumps".
// Above the floor, cost grows nonlinearly with intensity (intensity dominates,
// duration is a sublinear multiplier), and is amplified when the athlete is
// already deep in debt or carrying negative TSB (the "stupid second hard
// workout" compounding). Modulated cheaper by higher fitness (CTL).
//
// HONEST LIMITATION (surface this in the UI): a load/intensity model only
// APPROXIMATES Firstbeat's physiological Recovery Time. The intensity floor plus
// the optional HRV modulation below get most of the way; exact device parity is
// not the goal. The device's own recovery time is ingested and shown alongside.
//
// TWO TIERS: tier 1 (today) is the load/intensity fold. Tier 2 threads an
// optional HRV/readiness signal that modulates the DRAIN rate — recovered HRV
// drains debt faster, suppressed HRV holds it longer — without a rewrite.

import type { LoadMethod } from "./fitness";

/** Physiological drain modifier from an HRV/readiness signal (tier 2, optional). */
export type RecoveryHrvStatus = "suppressed" | "normal" | "recovered";

/** The minimal finished-activity shape the fold reads. */
export interface RecoveryActivity {
  id: number;
  name: string | null;
  /** ISO timestamp the activity FINISHED (start + moving time). */
  finishedAt: string;
  /** Intensity factor from activity_load, when known. */
  intensityFactor: number | null;
  method: LoadMethod | null;
  tss: number | null;
  avgHr: number | null;
  durationS: number | null;
}

export interface RecoveryContext {
  /** Chronic fitness (CTL): higher fitness recovers cheaper. */
  ctl: number;
  /** Current form (TSB): negative amplifies a hard session's cost. */
  tsb: number;
  /** Optional HRV/readiness drain modulation (tier 2). Null = neutral. */
  hrvStatus: RecoveryHrvStatus | null;
  /** Thresholds for the HR-based intensity fallback when IF is absent. */
  restingHr: number | null;
  lthr: number | null;
}

export interface RecoveryContribution {
  activityId: number;
  name: string | null;
  finishedAt: string;
  /** Hours this activity added to the debt (negative = active-recovery drain). */
  addedHours: number;
}

export interface RecoveryResult {
  /** Recovery debt in hours at `asOf` (0 = fully recovered). */
  remainingHours: number;
  /** The instant `remainingHours` is valid at (the `now` passed in). */
  asOf: string;
  /** Debt-hours drained per elapsed hour, so the client can decrement live. */
  drainRatePerHour: number;
  /** Per-activity breakdown for the info popup, most recent first. */
  contributions: RecoveryContribution[];
}

// --- Tunable constants (need real-data tuning; documented as such) -----------

// Recovery-intensity floor: at/under this IF an activity is easy/active-recovery
// and adds ~0 debt. Z1–low-Z2 territory.
const IF_FLOOR = 0.75;

// A 1-hour session at threshold (IF 1.0) with reference fitness costs this many
// hours of debt before state/fitness modulation.
const BASE_COST_HOURS = 24;

// Duration enters sublinearly so intensity dominates: cost ∝ hours^0.75.
const DURATION_EXP = 0.75;

// Fitness modulation: cost scales with CTL_REF / CTL, clamped. Fitter -> cheaper.
const CTL_REF = 50;
const CTL_MIN = 10;
const FITNESS_MULT_MIN = 0.5;
const FITNESS_MULT_MAX = 1.6;

// Negative-TSB amplification: at TSB = -TSB_REF the cost is multiplied by
// (1 + TSB_AMP). Positive/zero TSB does not amplify.
const TSB_REF = 30;
const TSB_AMP = 0.5;

// Debt amplification (compounding): stacking a hard session on top of existing
// debt costs more. At residual debt = DEBT_REF the multiplier is (1 + DEBT_AMP),
// capped by DEBT_MULT_MAX.
const DEBT_REF = 24;
const DEBT_AMP = 0.5;
const DEBT_MULT_MAX = 2;

// Active-recovery drain: a genuine easy session below the floor removes this many
// debt-hours per training hour, capped, so it can gently speed recovery.
const ACTIVE_RECOVERY_DRAIN_PER_HOUR = 0.5;
const ACTIVE_RECOVERY_MAX = 1.5;

// Base drain: 1 debt-hour clears per 1 elapsed hour of rest, so "remaining hours"
// reads literally as hours-to-full-recovery at rest.
const DRAIN_RATE_BASE = 1;

// Tier-2 HRV drain modifiers.
const HRV_DRAIN_MULT: Record<RecoveryHrvStatus, number> = {
  suppressed: 0.7,
  normal: 1,
  recovered: 1.3,
};

const MS_PER_HOUR = 3600_000;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Duration in hours, from moving time or (as a fallback) implied by TSS+IF. */
function durationHours(activity: RecoveryActivity, intensity: number | null): number {
  if (activity.durationS && activity.durationS > 0) return activity.durationS / 3600;
  if (activity.tss != null && intensity != null && intensity > 0) {
    // TSS = hours * IF^2 * 100  =>  hours = TSS / (IF^2 * 100)
    return activity.tss / (intensity * intensity * 100);
  }
  return 0;
}

/** Best-available intensity factor: stored IF, else implied by HR vs thresholds. */
function resolveIntensity(activity: RecoveryActivity, ctx: RecoveryContext): number | null {
  if (activity.intensityFactor != null) return activity.intensityFactor;
  if (
    activity.avgHr != null &&
    ctx.lthr != null &&
    ctx.restingHr != null &&
    ctx.lthr > ctx.restingHr
  ) {
    return (activity.avgHr - ctx.restingHr) / (ctx.lthr - ctx.restingHr);
  }
  return null;
}

function fitnessMult(ctl: number): number {
  return clamp(CTL_REF / Math.max(ctl, CTL_MIN), FITNESS_MULT_MIN, FITNESS_MULT_MAX);
}

function tsbMult(tsb: number): number {
  return 1 + (Math.max(0, -tsb) / TSB_REF) * TSB_AMP;
}

function debtMult(residualDebt: number): number {
  return Math.min(1 + (residualDebt / DEBT_REF) * DEBT_AMP, DEBT_MULT_MAX);
}

/**
 * Hours one activity adds to the debt, given the residual debt it lands on top of
 * (compounding). Returns ~0 or a small NEGATIVE for easy/active-recovery work at
 * or below the floor; a large positive for hard sessions, nonlinear in intensity.
 */
function recoveryCost(
  activity: RecoveryActivity,
  ctx: RecoveryContext,
  residualDebt: number
): number {
  const intensity = resolveIntensity(activity, ctx);
  const hours = durationHours(activity, intensity);
  if (intensity == null || hours <= 0) return 0;

  if (intensity <= IF_FLOOR) {
    // Active recovery: never adds debt; gently drains it in proportion to time.
    return -Math.min(ACTIVE_RECOVERY_DRAIN_PER_HOUR * hours, ACTIVE_RECOVERY_MAX);
  }

  // Above the floor. `gate` is 0 at the floor and 1 at threshold, so only the
  // supra-floor intensity contributes; IF^2 makes intensity dominate.
  const gate = (intensity - IF_FLOOR) / (1 - IF_FLOOR);
  const base = BASE_COST_HOURS * intensity * intensity * Math.pow(hours, DURATION_EXP) * gate;
  return base * fitnessMult(ctx.ctl) * tsbMult(ctx.tsb) * debtMult(residualDebt);
}

/**
 * Fold the recent activities into the current global recovery debt. Activities
 * are processed in finish-time order: debt drains continuously between events and
 * each session adds its (compounding) cost on top of the residual. After the last
 * event the debt drains to `now`.
 */
export function computeRecovery(
  activities: RecoveryActivity[],
  ctx: RecoveryContext,
  now: string
): RecoveryResult {
  const drainRate = DRAIN_RATE_BASE * HRV_DRAIN_MULT[ctx.hrvStatus ?? "normal"];
  const nowMs = new Date(now).getTime();

  const ordered = [...activities]
    .filter((a) => !Number.isNaN(new Date(a.finishedAt).getTime()))
    .sort((a, b) => new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime());

  let debt = 0;
  let prevMs: number | null = null;
  const contributions: RecoveryContribution[] = [];

  for (const activity of ordered) {
    const atMs = new Date(activity.finishedAt).getTime();
    if (prevMs !== null) {
      const elapsedHours = Math.max(0, (atMs - prevMs) / MS_PER_HOUR);
      debt = Math.max(0, debt - elapsedHours * drainRate);
    }
    const added = recoveryCost(activity, ctx, debt);
    debt = Math.max(0, debt + added);
    contributions.push({
      activityId: activity.id,
      name: activity.name,
      finishedAt: activity.finishedAt,
      addedHours: round1(added),
    });
    prevMs = atMs;
  }

  // Drain from the last event to now.
  if (prevMs !== null) {
    const elapsedHours = Math.max(0, (nowMs - prevMs) / MS_PER_HOUR);
    debt = Math.max(0, debt - elapsedHours * drainRate);
  }

  return {
    remainingHours: round1(debt),
    asOf: now,
    drainRatePerHour: drainRate,
    contributions: contributions.reverse(),
  };
}
