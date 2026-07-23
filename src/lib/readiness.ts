// Pure readiness engine (IO-free). Computes the APP-OWNED daily readiness score
// so the number means the same thing across a Garmin -> Coros switch, instead of
// trusting either device's proprietary score. The model, weights, bands and
// red-flag rule are taken from docs/health-readiness/RESEARCH_COROS_AND_READINESS.md
// §4.2 (built from the open HRV-guided-training literature, NOT a vendor clone).
//
// HONEST LIMITATION: the default weights are a defensible starting point, not
// tuned to this athlete's own outcomes. Vendor weights are proprietary; expect to
// tune these against real data. Every constant below is named for that reason.
//
// Baselines are personal and rolling. Components with no data drop out and their
// weight is redistributed (graceful degradation), so a partial day still scores.

/** A readiness sub-component. Each contributes a [0,100] sub-score + a weight. */
export type ReadinessComponentKey = "hrv" | "sleep" | "load" | "rhr" | "energy" | "subjective";

export type ReadinessBand = "ready" | "caution" | "rest";

/**
 * HRV context in natural-log rMSSD space (raw rMSSD is right-skewed, so the
 * literature works in ln). `today` is last night's ln rMSSD; `baseline7` the
 * 7-day rolling mean; `mean60`/`sd60` the longer-term mean and between-day SD the
 * z-scores are measured against.
 */
export interface HrvContext {
  today: number;
  baseline7: number;
  mean60: number;
  sd60: number;
}

export interface RhrContext {
  today: number;
  baseline: number;
}

export interface SleepContext {
  durationMin: number;
  needMin: number;
  /** A 0-100 quality score (device sleep score or a derived stages score), or null. */
  quality: number | null;
}

export interface EnergyContext {
  /** Morning Body Battery 0-100 (Garmin), or null. */
  bodyBattery: number | null;
  /** Overnight average stress 0-100 (higher = worse), or null. */
  stress: number | null;
}

export interface LoadContext {
  tsb: number;
  /** Acute:chronic workload ratio, or null when not yet computable. */
  acwr: number | null;
}

export interface SubjectiveContext {
  /** Hooper-style 1-5 ratings. fatigue/soreness/stress: 1 best, 5 worst. mood: 1 worst, 5 best. */
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  mood: number | null;
}

export interface ReadinessInputs {
  hrv: HrvContext | null;
  rhr: RhrContext | null;
  sleep: SleepContext | null;
  energy: EnergyContext | null;
  load: LoadContext | null;
  subjective: SubjectiveContext | null;
  /** Acute illness / injury self-flags: force the label down to Caution. */
  sickness: boolean;
  injury: boolean;
  /** Days of HRV history behind the baseline, for the confidence flag. */
  hrvBaselineDays: number;
}

export interface ReadinessComponent {
  key: ReadinessComponentKey;
  /** Sub-score in [0,100]. */
  sub: number;
  /** Renormalized weight actually applied (sums to 1 across present components). */
  weight: number;
}

export interface Readiness {
  score: number;
  band: ReadinessBand;
  components: ReadinessComponent[];
  /** True when too little data to fully trust the score (immature/few components). */
  lowConfidence: boolean;
  /** The acute-crash override that capped the band, or null. */
  redFlag: { reason: "hrv_rhr_crash" | "sickness" | "injury" } | null;
  /** The present component dragging the score down most, for the coach narrative. */
  topNegative: ReadinessComponentKey | null;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- Component sub-scores (each returns [0,100] or null when absent) ----------

// HRV: z of the 7-day baseline vs the 60-day distribution. Center 60, ±20 per SD.
// A parasympathetic-saturation spike (z > +2) is capped rather than rewarded.
const HRV_CENTER = 60;
const HRV_PER_SD = 20;
const HRV_SPIKE_Z = 2;
const HRV_SPIKE_CAP = 85;

function hrvSub(hrv: HrvContext): number {
  if (hrv.sd60 <= 0) return HRV_CENTER; // no spread yet -> neutral, can't judge deviation
  const z = (hrv.baseline7 - hrv.mean60) / hrv.sd60;
  const raw = clamp(HRV_CENTER + HRV_PER_SD * z, 0, 100);
  return z > HRV_SPIKE_Z ? Math.min(raw, HRV_SPIKE_CAP) : raw;
}

/** Single-day HRV z (not the 7-day mean) for the acute red-flag check. */
function hrvTodayZ(hrv: HrvContext): number {
  if (hrv.sd60 <= 0) return 0;
  return (hrv.today - hrv.mean60) / hrv.sd60;
}

// RHR: at baseline ~85; each bpm above baseline costs 6, each bpm below adds 3.
const RHR_BASE = 85;
const RHR_PENALTY_PER_BPM = 6;
const RHR_BONUS_PER_BPM = 3;
const RHR_RED_FLAG_BPM = 5;

function rhrSub(rhr: RhrContext): number {
  const d = rhr.today - rhr.baseline;
  return clamp(
    RHR_BASE - RHR_PENALTY_PER_BPM * Math.max(d, 0) + RHR_BONUS_PER_BPM * Math.max(-d, 0),
    0,
    100
  );
}

// Sleep: duration vs need, blended with a quality score when present.
const SLEEP_DUR_WEIGHT = 0.6;
const SLEEP_QUALITY_WEIGHT = 0.4;

function sleepSub(sleep: SleepContext): number {
  const dur = sleep.needMin > 0 ? clamp((100 * sleep.durationMin) / sleep.needMin, 0, 100) : 0;
  if (sleep.quality === null) return round1(dur);
  const quality = clamp(sleep.quality, 0, 100);
  return round1(SLEEP_DUR_WEIGHT * dur + SLEEP_QUALITY_WEIGHT * quality);
}

function energySub(energy: EnergyContext): number | null {
  if (energy.bodyBattery !== null) return clamp(energy.bodyBattery, 0, 100);
  if (energy.stress !== null) return clamp(100 - energy.stress, 0, 100);
  return null;
}

// Training-load freshness from TSB, with an ACWR guardrail. The TSB->score curve
// is monotonic and plateaus high (per the TrainingPeaks form zones); ACWR only
// pulls the score DOWN in the spike zone (a fresh, low-ACWR day is not penalized).
const TSB_BREAKPOINTS: { tsb: number; score: number }[] = [
  { tsb: -30, score: 20 },
  { tsb: -10, score: 70 },
  { tsb: 5, score: 90 },
  { tsb: 25, score: 100 },
];
const ACWR_SPIKE_LOW = 1.3;
const ACWR_SPIKE_HIGH = 1.5;
const ACWR_SPIKE_FACTOR = 0.7;

function tsbScore(tsb: number): number {
  const first = TSB_BREAKPOINTS[0];
  const last = TSB_BREAKPOINTS[TSB_BREAKPOINTS.length - 1];
  if (tsb <= first.tsb) return first.score;
  if (tsb >= last.tsb) return last.score;
  for (let i = 1; i < TSB_BREAKPOINTS.length; i++) {
    const a = TSB_BREAKPOINTS[i - 1];
    const b = TSB_BREAKPOINTS[i];
    if (tsb <= b.tsb) {
      const t = (tsb - a.tsb) / (b.tsb - a.tsb);
      return a.score + t * (b.score - a.score);
    }
  }
  return last.score;
}

function acwrFactor(acwr: number | null): number {
  if (acwr === null || acwr <= ACWR_SPIKE_LOW) return 1;
  if (acwr >= ACWR_SPIKE_HIGH) return ACWR_SPIKE_FACTOR;
  const t = (acwr - ACWR_SPIKE_LOW) / (ACWR_SPIKE_HIGH - ACWR_SPIKE_LOW);
  return 1 - t * (1 - ACWR_SPIKE_FACTOR);
}

function loadSub(load: LoadContext): number {
  return round1(clamp(tsbScore(load.tsb) * acwrFactor(load.acwr), 0, 100));
}

// Subjective: each 1-5 rating mapped to [0,100]. fatigue/soreness/stress are
// "lower is better", mood is "higher is better". Averaged over present ratings.
const SUBJ_STEP = 25; // (5 - 1) ratings span 100 points -> 25 per step

function subjectiveSub(subj: SubjectiveContext): number | null {
  const parts: number[] = [];
  const lowerBetter = (r: number | null) => {
    if (r !== null) parts.push(clamp((5 - r) * SUBJ_STEP, 0, 100));
  };
  const higherBetter = (r: number | null) => {
    if (r !== null) parts.push(clamp((r - 1) * SUBJ_STEP, 0, 100));
  };
  lowerBetter(subj.fatigue);
  lowerBetter(subj.soreness);
  lowerBetter(subj.stress);
  higherBetter(subj.mood);
  if (parts.length === 0) return null;
  return round1(parts.reduce((a, b) => a + b, 0) / parts.length);
}

// --- Weights ------------------------------------------------------------------

// Two default weight sets: 5-core, and the redistributed set once subjective
// wellness is present. Renormalized over whatever components exist on the day.
const WEIGHTS_CORE: Record<ReadinessComponentKey, number> = {
  hrv: 0.3,
  sleep: 0.25,
  load: 0.2,
  rhr: 0.15,
  energy: 0.1,
  subjective: 0,
};
const WEIGHTS_WITH_SUBJECTIVE: Record<ReadinessComponentKey, number> = {
  hrv: 0.25,
  sleep: 0.22,
  load: 0.18,
  rhr: 0.12,
  energy: 0.08,
  subjective: 0.15,
};

// Bands.
const BAND_READY = 70;
const BAND_CAUTION = 45;

// Confidence.
const MIN_BASELINE_DAYS = 14;
const MIN_COMPONENTS = 3;

function bandFor(score: number): ReadinessBand {
  if (score >= BAND_READY) return "ready";
  if (score >= BAND_CAUTION) return "caution";
  return "rest";
}

/**
 * The daily readiness score: a weighted average of present component sub-scores,
 * with weights renormalized over what is available. Returns the score, band,
 * per-component breakdown, a confidence flag, any acute red-flag override, and
 * the component dragging the score down most (for the coach).
 *
 * Red-flag override (independent of the average, so one acute crash is not
 * averaged away): same-day HRV z < -2 AND RHR > 5 bpm over baseline, or a
 * sickness/injury flag, caps the label at Caution regardless of the number.
 */
export function computeReadiness(inputs: ReadinessInputs): Readiness {
  const subs: Partial<Record<ReadinessComponentKey, number>> = {};
  if (inputs.hrv) subs.hrv = round1(hrvSub(inputs.hrv));
  if (inputs.rhr) subs.rhr = round1(rhrSub(inputs.rhr));
  if (inputs.sleep) subs.sleep = sleepSub(inputs.sleep);
  if (inputs.load) subs.load = loadSub(inputs.load);
  if (inputs.energy) {
    const e = energySub(inputs.energy);
    if (e !== null) subs.energy = round1(e);
  }
  if (inputs.subjective) {
    const s = subjectiveSub(inputs.subjective);
    if (s !== null) subs.subjective = s;
  }

  const present = Object.keys(subs) as ReadinessComponentKey[];
  const base = subs.subjective !== undefined ? WEIGHTS_WITH_SUBJECTIVE : WEIGHTS_CORE;
  const totalWeight = present.reduce((sum, key) => sum + base[key], 0);

  const components: ReadinessComponent[] = present.map((key) => ({
    key,
    sub: subs[key] as number,
    weight: totalWeight > 0 ? base[key] / totalWeight : 0,
  }));

  const score =
    totalWeight > 0 ? Math.round(components.reduce((sum, c) => sum + c.sub * c.weight, 0)) : 0;

  // Red-flag override.
  let redFlag: Readiness["redFlag"] = null;
  if (inputs.sickness) redFlag = { reason: "sickness" };
  else if (inputs.injury) redFlag = { reason: "injury" };
  else if (
    inputs.hrv &&
    inputs.rhr &&
    hrvTodayZ(inputs.hrv) < -HRV_SPIKE_Z &&
    inputs.rhr.today - inputs.rhr.baseline > RHR_RED_FLAG_BPM
  ) {
    redFlag = { reason: "hrv_rhr_crash" };
  }

  let band = bandFor(score);
  if (redFlag && band === "ready") band = "caution";

  const topNegative =
    components.length > 0 ? components.reduce((min, c) => (c.sub < min.sub ? c : min)).key : null;

  const lowConfidence =
    present.length < MIN_COMPONENTS ||
    (inputs.hrv !== null && inputs.hrvBaselineDays < MIN_BASELINE_DAYS);

  return { score, band, components, lowConfidence, redFlag, topNegative };
}

// --- Baseline stats (pure; used by the data-layer assembler) -----------------

/** Arithmetic mean, or null for an empty list. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Sample standard deviation (n-1). Null for fewer than two values — a single
 * point has no spread, and the readiness HRV component treats sd <= 0 as "can't
 * judge deviation yet" (neutral).
 */
export function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
