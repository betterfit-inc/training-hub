"use client";

import { useI18n } from "@/components/i18n-provider";
import { fmtHoursMin } from "@/lib/format";
import { METRIC_META, type MetricGroup } from "@/lib/health";
import type { HealthMetricRow } from "@/lib/types";

const GROUP_ORDER: MetricGroup[] = ["sleep", "cardio", "stress", "body", "subjective", "device"];

export function HealthMetricsPanel({ rows }: { rows: HealthMetricRow[] }) {
  const { t } = useI18n();

  function formatValue(row: HealthMetricRow): string {
    const meta = METRIC_META[row.metric];
    if (meta.kind === "text") return row.value_text ?? t.health.entry.none;
    if (row.value === null) return t.health.entry.none;
    if (meta.kind === "flag") return row.value ? t.health.yes : t.health.no;
    // Sleep stages/duration are stored in minutes; show as h m.
    if (meta.unit === "min") return fmtHoursMin(row.value * 60);
    return String(Math.round(row.value * 10) / 10);
  }

  const byGroup = new Map<MetricGroup, HealthMetricRow[]>();
  for (const row of rows) {
    const group = METRIC_META[row.metric].group;
    const list = byGroup.get(group);
    if (list) list.push(row);
    else byGroup.set(group, [row]);
  }

  return (
    <div className="space-y-6">
      {GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => (
        <div key={group}>
          <h3 className="mb-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t.health.groups[group]}
          </h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {(byGroup.get(group) ?? []).map((row) => {
              const meta = METRIC_META[row.metric];
              const showUnit = meta.kind === "numeric" && meta.unit && meta.unit !== "min";
              return (
                <div key={`${row.metric}-${row.source}`} className="rounded-xl border bg-card p-3">
                  <dt className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {t.health.metrics[row.metric]}
                  </dt>
                  <dd className="mt-1 font-display text-xl font-bold tabular-nums">
                    {formatValue(row)}
                    {showUnit ? (
                      <span className="ml-1 align-middle text-xs font-medium text-muted-foreground">
                        {meta.unit}
                      </span>
                    ) : null}
                  </dd>
                  <dd className="mt-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                    {t.health.sources[row.source]}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}
