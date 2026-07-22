import { SparklesIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterPill } from "@/components/filter-pill";
import { SportIcon } from "@/components/sport-icon";
import { listConfirmedActivities } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { computeInsights, type CategoryStats } from "@/lib/insights";
import { fmtHoursMin, fmtKm, fmtPace } from "@/lib/format";
import { fill, fillStr, type Dict } from "@/lib/i18n";
import type { SportCategory } from "@/lib/sports";

export const metadata = { title: "Insights" };

const WINDOWS = [
  { key: "30d", days: 30 },
  { key: "60d", days: 60 },
  { key: "90d", days: 90 },
  { key: "6m", days: 183 },
  { key: "1y", days: 365 },
] as const;

const CATEGORY_ICON_SPORT: Record<SportCategory, string> = {
  run: "Run",
  bike: "Ride",
  strength: "WeightTraining",
  walk: "Walk",
  elliptical: "Elliptical",
  swim: "Swim",
  other: "Activity",
};

/** Inline number inside the insight sentences. */
function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[15px] font-medium tabular-nums text-foreground not-italic">
      {children}
    </span>
  );
}

function dayWord(n: number, t: Dict): string {
  return `${n} ${n === 1 ? t.words.day : t.words.days}`;
}

function Headline({ stats, t }: { stats: CategoryStats; t: Dict }) {
  const time = <Num>{fmtHoursMin(stats.movingS)}</Num>;
  const km = <Num>{fmtKm(stats.km, stats.km >= 100 ? 0 : 1)}</Num>;
  const n = <Num>{stats.sessions}</Num>;
  const days = <Num>{dayWord(stats.activeDays, t)}</Num>;
  const sessionNoun = stats.sessions === 1 ? t.words.session : t.words.sessions;
  const timesNoun = stats.sessions === 1 ? t.insights.time : t.insights.times;

  switch (stats.category) {
    case "run":
      return <>{fill(t.insights.runLine, { days, km, time })}</>;
    case "strength":
      return <>{fill(t.insights.strengthLine, { n, noun: sessionNoun, time, days })}</>;
    case "bike":
      return <>{fill(t.insights.bikeLine, { n, times: timesNoun, km, time })}</>;
    case "walk":
      return (
        <>
          {fill(t.insights.walkLine, {
            km,
            n,
            noun: stats.sessions === 1 ? t.insights.walkNoun : t.insights.walksNoun,
            time,
          })}
        </>
      );
    case "elliptical":
      return <>{fill(t.insights.ellipticalLine, { n, noun: sessionNoun, time })}</>;
    case "swim":
      return <>{fill(t.insights.swimLine, { n, times: timesNoun, time })}</>;
    default:
      return (
        <>
          {fill(t.insights.otherLine, {
            n,
            noun: stats.sessions === 1 ? t.words.activity : t.words.activities,
            time,
          })}
        </>
      );
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function categoryDetails(
  stats: CategoryStats,
  windowDays: number,
  t: Dict
): Array<[string, string]> {
  const perWeek = stats.km / (windowDays / 7);
  const avgSession = stats.sessions > 0 ? stats.movingS / stats.sessions : 0;
  switch (stats.category) {
    case "run":
      return [
        [t.insights.avgPace, fmtPace(stats.avgPaceSPerKm)],
        [t.insights.longestRun, fmtKm(stats.longestKm, 1)],
        [t.insights.perWeek, fmtKm(perWeek, 1)],
      ];
    case "strength":
      return [
        [t.insights.perWeek, `${(stats.sessions / (windowDays / 7)).toFixed(1)}x`],
        [t.insights.avgSession, fmtHoursMin(avgSession)],
        [t.insights.longest, fmtHoursMin(stats.longestS)],
      ];
    case "bike":
      return [
        [t.insights.longestRide, fmtKm(stats.longestKm, 1)],
        [t.insights.avgRide, fmtHoursMin(avgSession)],
        [t.insights.perWeek, fmtKm(perWeek, 1)],
      ];
    case "walk":
      return [
        [t.insights.activeDaysLabel, dayWord(stats.activeDays, t)],
        [t.insights.longestWalk, fmtKm(stats.longestKm, 1)],
      ];
    case "elliptical":
      return [
        [t.insights.avgSession, fmtHoursMin(avgSession)],
        [t.insights.activeDaysLabel, dayWord(stats.activeDays, t)],
      ];
    case "swim":
      return [
        [t.insights.distanceLabel, stats.km > 0 ? fmtKm(stats.km, 1) : "–"],
        [t.insights.avgSession, fmtHoursMin(avgSession)],
      ];
    default:
      return [[t.insights.activeDaysLabel, dayWord(stats.activeDays, t)]];
  }
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-bold">
        {value}
        {sub ? <span className="ml-1 text-sm font-normal text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  );
}

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const params = await searchParams;
  const { t } = await getDict();
  const rawWindow = typeof params.window === "string" ? params.window : "30d";
  const window = WINDOWS.find((w) => w.key === rawWindow) ?? WINDOWS[0];
  const windowLabel = t.insights.windows[window.key];

  const insights = computeInsights(await listConfirmedActivities(), window.days);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t.insights.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {fillStr(t.insights.subtitle, { window: windowLabel })}
      </p>

      <nav aria-label="Time window" className="mt-5 flex flex-wrap items-center gap-1.5">
        {WINDOWS.map((w) => (
          <FilterPill
            key={w.key}
            href={w.key === "30d" ? "/insights" : `/insights?window=${w.key}`}
            active={window.key === w.key}
            label={t.insights.windows[w.key]}
          />
        ))}
      </nav>

      {insights.sessions === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={SparklesIcon}
            title={t.insights.emptyTitle}
            description={t.insights.emptyBody}
          />
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl border bg-card p-5 sm:grid-cols-4">
            <SummaryTile
              label={t.insights.activeDays}
              value={String(insights.activeDays)}
              sub={fillStr(t.insights.ofWindow, { n: window.days })}
            />
            <SummaryTile label={t.insights.sessions} value={String(insights.sessions)} />
            <SummaryTile label={t.insights.totalTime} value={fmtHoursMin(insights.movingS)} />
            <SummaryTile label={t.insights.distance} value={fmtKm(insights.km, 0)} />
          </dl>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {insights.categories.map((stats) => (
              <Card key={stats.category} size="sm">
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <SportIcon
                      sport={CATEGORY_ICON_SPORT[stats.category]}
                      className="text-primary"
                    />
                    <h2 className="text-sm font-medium">{t.sports[stats.category]}</h2>
                    <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                      {stats.sessions} {stats.sessions === 1 ? t.words.session : t.words.sessions}
                    </span>
                  </div>
                  <p className="text-[16px] leading-relaxed text-muted-foreground italic">
                    <Headline stats={stats} t={t} />
                  </p>
                  <dl className="grid grid-cols-3 gap-x-3 gap-y-2 border-t pt-3">
                    {categoryDetails(stats, window.days, t).map(([label, value]) => (
                      <Detail key={label} label={label} value={value} />
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
