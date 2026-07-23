import { ActivityIcon, HeartPulseIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { HealthEntryForm, type HealthEntryInitial } from "@/components/health-entry-form";
import { HealthMetricsPanel } from "@/components/health-metrics-panel";
import { HealthTrendChart } from "@/components/health-chart";
import { ReadinessCoach } from "@/components/readiness-coach";
import { ReadinessSnapshot } from "@/components/readiness-snapshot";
import {
  getLatestHealthDate,
  getReadinessNarrative,
  getReadinessSnapshot,
  getRecoveryState,
  getResolvedMetricsForDate,
  getResolvedNumericSeries,
} from "@/lib/db";
import { isCoachConfigured } from "@/lib/coach";
import { getDict } from "@/lib/lang";
import { fmtDate, fmtDateLong, localDateInputValue, parseLocalDate } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import type { HealthMetric, HealthMetricRow } from "@/lib/types";

export const metadata = { title: "Health" };

// Metrics charted in the trends grid, when they have at least two data points.
const TREND_METRICS: HealthMetric[] = [
  "hrv_overnight",
  "resting_hr",
  "sleep_total",
  "sleep_quality",
  "stress_avg",
  "body_battery_high",
  "device_readiness",
  "weight",
];

const RECOVERY_BAND = (h: number) =>
  h >= 24 ? "var(--wear-critical)" : h >= 8 ? "var(--wear-worn)" : "var(--positive)";

function shiftDays(dayKey: string, days: number): string {
  const d = parseLocalDate(dayKey);
  d.setDate(d.getDate() + days);
  return localDateInputValue(d);
}

/** Prefill the check-in from today's manual/resolved subjective values, if any. */
function entryInitial(today: string, rows: HealthMetricRow[]): HealthEntryInitial {
  const value = (metric: HealthMetric) => rows.find((r) => r.metric === metric)?.value ?? null;
  return {
    date: today,
    fatigue: value("fatigue"),
    soreness: value("soreness"),
    stress: value("stress_subjective"),
    mood: value("mood"),
    weight: value("weight"),
    sickness: value("sickness") === 1,
    injury: value("injury") === 1,
  };
}

export default async function HealthPage() {
  const { t, lang } = await getDict();
  const today = localDateInputValue(new Date());
  const from30 = shiftDays(today, -30);

  const [latestDate, snapshot, recovery, deviceRecoverySeries, todayRows] = await Promise.all([
    getLatestHealthDate(),
    getReadinessSnapshot(),
    getRecoveryState(),
    getResolvedNumericSeries("device_recovery_hours", from30, today),
    getResolvedMetricsForDate(today),
  ]);

  const latestRows = latestDate ? await getResolvedMetricsForDate(latestDate) : [];
  const deviceRecoveryHours = deviceRecoverySeries.at(-1)?.value ?? null;
  const narrative = await getReadinessNarrative();
  const coachConfigured = isCoachConfigured();

  const trendSeries = await Promise.all(
    TREND_METRICS.map(async (metric) => ({
      metric,
      points: await getResolvedNumericSeries(metric, from30, today),
    }))
  );
  const trends = trendSeries.filter((s) => s.points.length >= 2);

  const hasAnyData = latestDate !== null || snapshot !== null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t.health.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.health.subtitle}</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.health.readiness.title}</CardTitle>
            <CardDescription>{t.health.readiness.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            {snapshot ? (
              <ReadinessSnapshot readiness={snapshot.readiness} />
            ) : (
              <EmptyState
                icon={ActivityIcon}
                title={t.health.readiness.empty}
                description={t.health.readiness.emptyBody}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.health.recovery.title}</CardTitle>
            <CardDescription>{t.health.recovery.infoBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <span
                className="font-display text-4xl font-bold tabular-nums"
                style={{ color: RECOVERY_BAND(recovery.remainingHours) }}
              >
                {recovery.remainingHours < 0.5
                  ? t.health.recovery.recovered
                  : fillStr(t.health.recovery.hoursLeft, {
                      h: Math.round(recovery.remainingHours),
                    })}
              </span>
              {deviceRecoveryHours != null ? (
                <span className="text-xs text-muted-foreground">
                  {fillStr(t.health.recovery.deviceRef, { h: Math.round(deviceRecoveryHours) })}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.health.recovery.computed}</p>

            <h3 className="mt-5 mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t.health.recovery.contributions}
            </h3>
            {recovery.contributions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.health.recovery.noContributions}</p>
            ) : (
              <ul className="space-y-1.5">
                {recovery.contributions.slice(0, 5).map((c) => {
                  const positive = c.addedHours >= 0;
                  return (
                    <li
                      key={`${c.activityId}-${c.finishedAt}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate text-muted-foreground">
                        {fmtDate(c.finishedAt, lang)} · {c.name ?? "—"}
                      </span>
                      <span
                        className="shrink-0 font-mono tabular-nums"
                        style={{ color: positive ? "var(--wear-worn)" : "var(--positive)" }}
                      >
                        {positive
                          ? fillStr(t.health.recovery.added, { h: c.addedHours })
                          : fillStr(t.health.recovery.drained, { h: Math.abs(c.addedHours) })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {snapshot ? (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>{t.health.coach.title}</CardTitle>
            <CardDescription>{t.health.coach.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            <ReadinessCoach narrative={narrative} configured={coachConfigured} />
          </CardContent>
        </Card>
      ) : null}

      {trends.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">{t.health.trends.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.health.trends.subtitle}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trends.map((s) => (
              <HealthTrendChart key={s.metric} metric={s.metric} points={s.points} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{t.health.today}</h2>
          {latestDate ? (
            <span className="text-xs text-muted-foreground">
              {fillStr(t.health.updated, { date: fmtDateLong(`${latestDate}T12:00:00`, lang) })}
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          {latestRows.length > 0 ? (
            <HealthMetricsPanel rows={latestRows} />
          ) : (
            <EmptyState
              icon={HeartPulseIcon}
              title={t.health.empty}
              description={t.health.emptyBody}
            />
          )}
        </div>
      </section>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t.health.entry.title}</CardTitle>
          <CardDescription>{t.health.entry.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <HealthEntryForm initial={entryInitial(today, todayRows)} />
        </CardContent>
      </Card>

      {!hasAnyData ? <div className="sr-only">{t.health.emptyBody}</div> : null}
    </div>
  );
}
