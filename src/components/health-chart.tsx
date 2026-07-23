"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { fmtDayMonth, parseLocalDate } from "@/lib/format";
import { METRIC_META } from "@/lib/health";
import type { HealthMetric } from "@/lib/types";

export interface HealthPoint {
  date: string; // YYYY-MM-DD local
  value: number;
}

// viewBox geometry (unitless; the SVG scales to its container width).
const VBW = 320;
const VBH = 132;
const PAD_L = 34;
const PAD_R = 10;
const TOP = 10;
const PLOT_H = 84;
const PLOT_W = VBW - PAD_L - PAD_R;
const BOTTOM = TOP + PLOT_H;

const AVG_WINDOW = 7;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

/**
 * A compact 30-day trend for one health metric in the house SVG style: the daily
 * line, a shaded normal-range band (mean ± 1 SD), and a 7-day trailing average.
 * Mirrors the geometry-constant + CSS-var approach of pmc-chart / activity-chart.
 */
export function HealthTrendChart({
  metric,
  points,
}: {
  metric: HealthMetric;
  points: HealthPoint[];
}) {
  const { t, lang } = useI18n();
  const label = t.health.metrics[metric];
  const unit = METRIC_META[metric].unit;

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const m = mean(values);
    const sd = stdDev(values);
    const bandLow = m - sd;
    const bandHigh = m + sd;
    const lo = Math.min(...values, bandLow);
    const hi = Math.max(...values, bandHigh);
    const pad = (hi - lo) * 0.1 || 1;
    const yMin = lo - pad;
    const yMax = hi + pad;
    const n = points.length;

    const xPx = (i: number) => (n <= 1 ? PAD_L + PLOT_W / 2 : PAD_L + (i / (n - 1)) * PLOT_W);
    const yPx = (v: number) => BOTTOM - ((v - yMin) / (yMax - yMin)) * PLOT_H;

    const line = points
      .map((p, i) => `${i ? "L" : "M"}${xPx(i).toFixed(1)},${yPx(p.value).toFixed(1)}`)
      .join(" ");

    // 7-day trailing average line.
    const avg = points.map((_, i) => {
      const from = Math.max(0, i - (AVG_WINDOW - 1));
      return mean(values.slice(from, i + 1));
    });
    const avgLine = avg
      .map((v, i) => `${i ? "L" : "M"}${xPx(i).toFixed(1)},${yPx(v).toFixed(1)}`)
      .join(" ");

    const ticks = Array.from({ length: Math.min(3, n) }, (_, k) => {
      const count = Math.min(3, n);
      const i = count === 1 ? 0 : Math.round((k / (count - 1)) * (n - 1));
      return { i, label: fmtDayMonth(parseLocalDate(points[i].date), lang) };
    });

    return {
      line,
      avgLine,
      bandTop: yPx(bandHigh),
      bandBottom: yPx(bandLow),
      last: points[n - 1].value,
      lastX: xPx(n - 1),
      lastY: yPx(points[n - 1].value),
      yMaxLabel: Math.round(yMax),
      yMinLabel: Math.round(yMin),
      ticks,
    };
  }, [points, lang]);

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        {geom ? (
          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
            {Math.round(geom.last * 10) / 10}
            {unit ? <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span> : null}
          </span>
        ) : null}
      </div>
      {geom ? (
        <svg
          viewBox={`0 0 ${VBW} ${VBH}`}
          width="100%"
          style={{ height: "auto" }}
          role="img"
          aria-label={label}
        >
          {/* normal-range band */}
          <rect
            x={PAD_L}
            y={geom.bandTop}
            width={PLOT_W}
            height={Math.max(0, geom.bandBottom - geom.bandTop)}
            fill="var(--primary)"
            opacity={0.08}
          />
          <line
            x1={PAD_L}
            y1={BOTTOM}
            x2={VBW - PAD_R}
            y2={BOTTOM}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={PAD_L - 5}
            y={TOP + 4}
            textAnchor="end"
            fontSize={8}
            fill="var(--muted-foreground)"
            className="font-mono"
          >
            {geom.yMaxLabel}
          </text>
          <text
            x={PAD_L - 5}
            y={BOTTOM}
            textAnchor="end"
            fontSize={8}
            fill="var(--muted-foreground)"
            className="font-mono"
          >
            {geom.yMinLabel}
          </text>
          {/* 7-day average */}
          <path
            d={geom.avgLine}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.7}
          />
          {/* daily line */}
          <path
            d={geom.line}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={geom.lastX}
            cy={geom.lastY}
            r={2.75}
            fill="var(--primary)"
            stroke="var(--card)"
            strokeWidth={1.5}
          />
          {geom.ticks.map((tick, k) => {
            // Anchor the first tick to the start and the last to the end so
            // neither label is clipped at the plot edges.
            const anchor = k === 0 ? "start" : k === geom.ticks.length - 1 ? "end" : "middle";
            return (
              <text
                key={tick.i}
                x={
                  PAD_L +
                  (points.length <= 1 ? PLOT_W / 2 : (tick.i / (points.length - 1)) * PLOT_W)
                }
                y={BOTTOM + 13}
                textAnchor={anchor}
                fontSize={8}
                fill="var(--muted-foreground)"
                className="font-mono"
              >
                {tick.label}
              </text>
            );
          })}
        </svg>
      ) : (
        <p className="py-6 text-center text-xs text-muted-foreground">{t.health.trends.noData}</p>
      )}
    </div>
  );
}
