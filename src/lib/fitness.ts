// Pure fitness engine: per-activity training load (TSS), the Performance
// Management Chart (CTL/ATL/TSB) and Friel training zones. No DB imports — the
// data layer feeds these functions and persists their output.
import { isRideSport, rideMetrics } from "./cycling";
import { isRunSport } from "./validate";

export interface AthleteThresholds {
  maxHr: number;
  restingHr: number;
  lthr: number;
  thresholdPaceSPerKm: number;
  ftpW: number;
  restingHrEstimated: boolean;
  ftpProvisional: boolean;
  updatedAt: string | null;
}

/** Which signal a TSS value was derived from, best (power) to weakest (rpe). */
export type LoadMethod = "power" | "pace" | "hr" | "rpe";

export interface ActivityLoad {
  tss: number;
  method: LoadMethod;
  intensityFactor: number | null;
}

/** The minimal activity shape the load engine reads. */
export interface LoadActivity {
  sport_type: string | null;
  moving_time_s: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  avg_pace_s_per_km: number | null;
  rpe: number | null;
  raw_json: string | null;
}

export interface LoadOptions {
  /** Skip the power method even for rides (e.g. flaky trainer wattage). */
  ignorePower?: boolean;
}

// Intensity-factor clamps per method: power can exceed threshold further than
// pace/HR before the quadratic TSS runs away.
const IF_CLAMP_POWER = 1.6;
const IF_CLAMP_PACE = 1.5;
const IF_CLAMP_HR = 1.5;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Quadratic TSS from an intensity factor over a duration in seconds. */
function tssFrom(movingS: number, intensity: number): number {
  return (movingS / 3600) * intensity * intensity * 100;
}

/**
 * Best-available training load for one activity. Picks the strongest signal
 * present in priority order (power → pace → HR → RPE) and returns null when
 * none apply. TSS is rounded to 1 decimal, intensity factor to 3.
 */
export function computeLoad(
  activity: LoadActivity,
  thresholds: AthleteThresholds,
  opts: LoadOptions = {}
): ActivityLoad | null {
  const time = activity.moving_time_s ?? 0;
  if (time <= 0) return null;

  // 1. Power (rides with a normalized/average wattage and an FTP).
  if (!opts.ignorePower && isRideSport(activity.sport_type) && thresholds.ftpW > 0) {
    const metrics = rideMetrics({ sport_type: activity.sport_type, raw_json: activity.raw_json });
    const power = metrics.normalizedPower ?? metrics.avgPower;
    if (power != null && power > 0) {
      const intensity = clamp(power / thresholds.ftpW, 0, IF_CLAMP_POWER);
      return {
        tss: round1(tssFrom(time, intensity)),
        method: "power",
        intensityFactor: round3(intensity),
      };
    }
  }

  // 2. Pace (rTSS for runs with an average pace and a threshold pace).
  const pace = activity.avg_pace_s_per_km ?? 0;
  if (isRunSport(activity.sport_type) && pace > 0 && thresholds.thresholdPaceSPerKm > 0) {
    const intensity = clamp(thresholds.thresholdPaceSPerKm / pace, 0, IF_CLAMP_PACE);
    return {
      tss: round1(tssFrom(time, intensity)),
      method: "pace",
      intensityFactor: round3(intensity),
    };
  }

  // 3. Heart rate (hrTSS, works for any sport with an average HR).
  const hr = activity.avg_hr ?? 0;
  if (hr > 0 && thresholds.lthr > thresholds.restingHr) {
    const intensity = clamp(
      (hr - thresholds.restingHr) / (thresholds.lthr - thresholds.restingHr),
      0,
      IF_CLAMP_HR
    );
    return {
      tss: round1(tssFrom(time, intensity)),
      method: "hr",
      intensityFactor: round3(intensity),
    };
  }

  // 4. RPE (subjective fallback; RPE 10 for 60 min ≈ 150 TSS).
  if (activity.rpe != null) {
    return { tss: round1(activity.rpe * (time / 60) * 0.25), method: "rpe", intensityFactor: null };
  }

  return null;
}

export interface PmcPoint {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
}

// Exponentially-weighted decay constants: fitness over ~42 days, fatigue ~7.
const CTL_ALPHA = 1 / 42;
const ATL_ALPHA = 1 / 7;

/**
 * Performance Management Chart from gap-filled daily loads (ascending, zero
 * days included by the caller). CTL and ATL are EWMAs seeded at 0; each day's
 * form (TSB) is the prior day's fitness minus fatigue, and 0 on the first day.
 */
export function computePmc(dailyLoads: { date: string; load: number }[]): PmcPoint[] {
  const out: PmcPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (let i = 0; i < dailyLoads.length; i++) {
    const { date, load } = dailyLoads[i];
    const prevCtl = ctl;
    const prevAtl = atl;
    ctl = prevCtl + CTL_ALPHA * (load - prevCtl);
    atl = prevAtl + ATL_ALPHA * (load - prevAtl);
    const tsb = i === 0 ? 0 : prevCtl - prevAtl;
    out.push({ date, load, ctl: round1(ctl), atl: round1(atl), tsb: round1(tsb) });
  }
  return out;
}

export type FormStateKey = "fresh" | "neutral" | "productive" | "fatigued";

/**
 * Buckets a TSB value into a form state. Above +5 is fresh (tapered), the
 * -10..+5 band is neutral, -30..-10 is the productive training zone, and
 * anything below -30 is deep fatigue.
 */
export function formState(tsb: number): { key: FormStateKey } {
  if (tsb > 5) return { key: "fresh" };
  if (tsb >= -10) return { key: "neutral" };
  if (tsb >= -30) return { key: "productive" };
  return { key: "fatigued" };
}

/**
 * A single training zone. Bounds are inclusive of `min`, exclusive of `max`;
 * a null bound is open-ended. For HR the units are bpm (min < max). For pace
 * the units are seconds per km, where a smaller number is faster, so `min` is
 * the fastest pace in the zone and `max` the slowest.
 */
export interface Zone {
  zone: 1 | 2 | 3 | 4 | 5;
  min: number | null;
  max: number | null;
}

// Friel five-zone cut points, as fractions of the threshold value.
const ZONE_FRACTIONS = [0.81, 0.9, 0.94, 1.0] as const;

/**
 * Friel heart-rate zones as a percentage of LTHR: Z1 <81%, Z2 81–89%,
 * Z3 90–93%, Z4 94–99%, Z5 ≥100%. Bounds are bpm.
 */
export function hrZones(thresholds: AthleteThresholds): Zone[] {
  const [b1, b2, b3, b4] = ZONE_FRACTIONS.map((f) => Math.round(f * thresholds.lthr));
  return [
    { zone: 1, min: null, max: b1 },
    { zone: 2, min: b1, max: b2 },
    { zone: 3, min: b2, max: b3 },
    { zone: 4, min: b3, max: b4 },
    { zone: 5, min: b4, max: null },
  ];
}

/**
 * Running pace zones as multiples of threshold-pace speed, mirroring the HR
 * fractions. A speed fraction f maps to a pace of thresholdPace / f, so the
 * faster (higher) zones carry the smaller pace numbers. Bounds are s/km.
 */
export function paceZones(thresholds: AthleteThresholds): Zone[] {
  const [p1, p2, p3, p4] = ZONE_FRACTIONS.map((f) =>
    Math.round(thresholds.thresholdPaceSPerKm / f)
  );
  return [
    { zone: 1, min: p1, max: null },
    { zone: 2, min: p2, max: p1 },
    { zone: 3, min: p3, max: p2 },
    { zone: 4, min: p4, max: p3 },
    { zone: 5, min: null, max: p4 },
  ];
}
