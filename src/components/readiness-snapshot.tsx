"use client";

import { AlertTriangleIcon } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { fill } from "@/lib/i18n";
import type { Readiness, ReadinessBand } from "@/lib/readiness";

const BAND_COLOR: Record<ReadinessBand, string> = {
  ready: "var(--positive)",
  caution: "var(--wear-worn)",
  rest: "var(--wear-critical)",
};

/** Sub-score color, matching the readiness bands so the bars read consistently. */
function subColor(sub: number): string {
  if (sub >= 70) return "var(--positive)";
  if (sub >= 45) return "var(--wear-worn)";
  return "var(--wear-critical)";
}

export function ReadinessSnapshot({ readiness }: { readiness: Readiness }) {
  const { t } = useI18n();
  const color = BAND_COLOR[readiness.band];

  return (
    <div>
      <div className="flex items-end gap-4">
        <div
          className="flex size-20 shrink-0 items-center justify-center rounded-full border-4 font-display text-3xl font-bold tabular-nums"
          style={{ borderColor: color, color }}
          role="meter"
          aria-valuenow={readiness.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t.health.readiness.score}
        >
          {readiness.score}
        </div>
        <div className="min-w-0 pb-1">
          <div className="text-2xl font-semibold" style={{ color }}>
            {t.health.readiness.bands[readiness.band]}
          </div>
          {readiness.lowConfidence ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {t.health.readiness.lowConfidenceNote}
            </div>
          ) : null}
        </div>
      </div>

      {readiness.redFlag ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--wear-critical)]/40 bg-[var(--wear-critical)]/10 px-3 py-2 text-sm text-foreground">
          <AlertTriangleIcon
            className="mt-0.5 size-4 shrink-0 text-[var(--wear-critical)]"
            aria-hidden
          />
          <span>{t.health.readiness.redFlags[readiness.redFlag.reason]}</span>
        </div>
      ) : null}

      {readiness.components.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t.health.readiness.breakdown}
          </h3>
          <dl className="space-y-2.5">
            {readiness.components.map((component) => (
              <div key={component.key} className="flex items-center gap-3">
                <dt className="w-28 shrink-0 truncate text-sm text-muted-foreground">
                  {t.health.readiness.components[component.key]}
                </dt>
                <dd className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(component.sub)}%`,
                        backgroundColor: subColor(component.sub),
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {Math.round(component.sub)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          {readiness.topNegative ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {fill(t.health.readiness.draggedDown, {
                component: (
                  <span key="c" className="font-medium text-foreground">
                    {t.health.readiness.components[readiness.topNegative]}
                  </span>
                ),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
