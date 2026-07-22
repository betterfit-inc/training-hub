import type { Activity } from "./types";

export function isRideSport(sport: string | null | undefined): boolean {
  const s = (sport ?? "").toLowerCase();
  return s.includes("ride") || s.includes("velomobile") || s === "ebikeride";
}

/** Indoor when Strava tags it VirtualRide or the raw payload marks a trainer. */
export function isIndoorRide(activity: {
  sport_type: string | null;
  raw_json?: string | null;
}): boolean {
  if ((activity.sport_type ?? "") === "VirtualRide") return true;
  if (activity.raw_json) {
    try {
      return JSON.parse(activity.raw_json).trainer === true;
    } catch {
      return false;
    }
  }
  return false;
}

export interface RideMetrics {
  indoor: boolean;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  avgPower: number | null;
  /** Strava's weighted_average_watts, i.e. Normalized Power. */
  normalizedPower: number | null;
  maxPower: number | null;
  hasRealPower: boolean;
  /** Normalized / average power; ~1.0 steady, higher = surging/intervals. */
  variabilityIndex: number | null;
  avgCadence: number | null;
  kilojoules: number | null;
}

interface RawRide {
  average_speed?: number;
  max_speed?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  device_watts?: boolean;
  average_cadence?: number;
  kilojoules?: number;
}

/** Pulls cycling metrics out of the cached Strava payload; null-safe throughout. */
export function rideMetrics(activity: Pick<Activity, "sport_type" | "raw_json">): RideMetrics {
  let raw: RawRide = {};
  if (activity.raw_json) {
    try {
      raw = JSON.parse(activity.raw_json) as RawRide;
    } catch {
      raw = {};
    }
  }
  const avgPower = raw.average_watts ?? null;
  const normalizedPower = raw.weighted_average_watts ?? null;
  const vi =
    normalizedPower && avgPower && avgPower > 0
      ? Math.round((normalizedPower / avgPower) * 100) / 100
      : null;
  return {
    indoor: isIndoorRide(activity),
    avgSpeedKmh: raw.average_speed != null ? raw.average_speed * 3.6 : null,
    maxSpeedKmh: raw.max_speed != null ? raw.max_speed * 3.6 : null,
    avgPower,
    normalizedPower,
    maxPower: raw.max_watts ?? null,
    hasRealPower: raw.device_watts === true,
    variabilityIndex: vi,
    avgCadence: raw.average_cadence ?? null,
    kilojoules: raw.kilojoules ?? null,
  };
}

export function fmtSpeed(kmh: number | null | undefined): string {
  if (!kmh || kmh <= 0) return "–";
  return `${kmh.toFixed(1)} km/h`;
}

export function fmtPower(watts: number | null | undefined): string {
  if (watts == null) return "–";
  return `${Math.round(watts)} W`;
}

export function fmtCadence(rpm: number | null | undefined): string {
  if (!rpm) return "–";
  return `${Math.round(rpm)} rpm`;
}

export function fmtEnergy(kj: number | null | undefined): string {
  if (!kj) return "–";
  return `${Math.round(kj)} kJ`;
}
