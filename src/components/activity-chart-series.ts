import type { ActivityStreams } from "@/lib/streams";
import type { Dict } from "@/lib/i18n";
import { fmtHr, fmtPace, fmtPaceShort } from "@/lib/format";
import { fmtCadence, fmtPower } from "@/lib/cycling";

export type SeriesKey = "heartRate" | "pace" | "power" | "cadence" | "elevation";
export type XMode = "distance" | "time";

export interface SeriesDef {
  key: SeriesKey;
  data: (number | null)[]; // guaranteed non-null series (available ones only)
  color: string; // fixed CSS-var order: primary, chart-2..chart-5
  label: string;
  unit: string;
  invert: boolean; // pace: faster (smaller) sits higher
  area: boolean; // elevation renders as a filled area
  fmt: (v: number) => string;
  tick: (v: number) => string;
}

type SeriesCandidate = Omit<SeriesDef, "data"> & { data: (number | null)[] | null };

// viewBox geometry (unitless; the SVG scales to its container width)
export const VBW = 760;
export const PAD_L = 48;
export const PAD_R = 14;
export const PLOT_W = VBW - PAD_L - PAD_R;
export const TOP = 8;
export const PANEL_H = 68;
export const GAP = 16;
export const AXIS_H = 26;

const round = (v: number) => String(Math.round(v));

/** Compact clock for the time axis: h:mm past an hour, else m:ss. */
export function fmtClock(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function extent(data: (number | null)[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v == null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return null;
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  // Don't pad below zero for naturally non-negative series (power, cadence).
  const lo = min >= 0 ? Math.max(0, min - pad) : min - pad;
  return [lo, max + pad];
}

/**
 * Every candidate series with its fixed color slot; only the ones whose stream
 * is present (data != null) survive the filter and become togglable.
 */
export function buildSeries(streams: ActivityStreams, t: Dict, isRide: boolean): SeriesDef[] {
  const defs: SeriesCandidate[] = [
    {
      key: "heartRate",
      data: streams.heartrate,
      color: "var(--primary)",
      label: t.chart.heartRate,
      unit: "bpm",
      invert: false,
      area: false,
      fmt: (v) => fmtHr(v),
      tick: round,
    },
    {
      key: "pace",
      data: streams.paceSPerKm,
      color: "var(--chart-2)",
      label: t.chart.pace,
      unit: "min/km",
      invert: true,
      area: false,
      fmt: (v) => fmtPace(v),
      tick: fmtPaceShort,
    },
    {
      key: "power",
      data: streams.watts,
      color: "var(--chart-3)",
      label: t.chart.power,
      unit: "W",
      invert: false,
      area: false,
      fmt: (v) => fmtPower(v),
      tick: round,
    },
    {
      key: "cadence",
      data: streams.cadence,
      color: "var(--chart-4)",
      label: t.chart.cadence,
      unit: isRide ? "rpm" : "spm",
      invert: false,
      area: false,
      fmt: (v) => fmtCadence(v),
      tick: round,
    },
    {
      key: "elevation",
      data: streams.altitudeM,
      color: "var(--chart-5)",
      label: t.chart.elevation,
      unit: "m",
      invert: false,
      area: true,
      fmt: (v) => `${round(v)} m`,
      tick: round,
    },
  ];
  return defs.filter((d): d is SeriesDef => d.data != null);
}
