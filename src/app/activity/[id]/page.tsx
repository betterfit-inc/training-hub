import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CheckCircle2Icon, ClockIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MedalIcon } from "lucide-react";
import { BikeSection } from "@/components/bike-section";
import { RaceControl } from "@/components/race-control";
import { JournalEditor } from "@/components/journal-editor";
import { SplitsSection } from "@/components/splits-section";
import { SportIcon } from "@/components/sport-icon";
import { getActivity, listBikes, listShoes } from "@/lib/db";
import { getDict } from "@/lib/lang";
import {
  ensureActivityDetail,
  type StravaLap,
  type StravaSplit,
} from "@/lib/strava";
import {
  fmtCadence,
  fmtEnergy,
  fmtPower,
  fmtSpeed,
  isRideSport,
  rideMetrics,
} from "@/lib/cycling";
import {
  fmtDateLong,
  fmtDuration,
  fmtElev,
  fmtHr,
  fmtKm,
  fmtPace,
  fmtTime,
} from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { isRunSport } from "@/lib/validate";
import type { BikeOption, ShoeOption } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params;
  const activity = Number.isInteger(Number(id)) ? await getActivity(Number(id)) : null;
  return { title: activity?.name ?? "Activity" };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function paceOf(distanceM?: number, movingS?: number): number | null {
  if (!distanceM || !movingS || distanceM <= 0) return null;
  return movingS / (distanceM / 1000);
}

function fmtLapDist(distanceM?: number): string {
  if (!distanceM || distanceM <= 0) return "–";
  if (distanceM < 950) return `${Math.round(distanceM)} m`;
  return fmtKm(distanceM / 1000, distanceM < 99500 ? 2 : 1);
}

const TH = "px-2 py-1.5 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase";
const TD = "px-2 py-1.5 font-mono text-sm tabular-nums whitespace-nowrap";

function LapsTable({ laps, t, ride }: { laps: StravaLap[]; t: Dict; ride: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className={TH}>{t.detail.lap}</th>
            <th className={TH}>{t.review.distance}</th>
            <th className={TH}>{t.review.time}</th>
            <th className={TH}>{ride ? t.detail.speed : t.review.pace}</th>
            <th className={TH}>{t.detail.hr}</th>
            <th className={TH}>{t.detail.maxShort}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {laps.map((lap, index) => {
            const speedKmh = lap.average_speed ? lap.average_speed * 3.6 : null;
            const pace = lap.average_speed
              ? 1000 / lap.average_speed
              : paceOf(lap.distance, lap.moving_time);
            return (
              <tr key={index}>
                <td className={`${TD} text-muted-foreground`}>{lap.lap_index ?? index + 1}</td>
                <td className={TD}>{fmtLapDist(lap.distance)}</td>
                <td className={TD}>{fmtDuration(lap.moving_time)}</td>
                <td className={`${TD} font-medium`}>
                  {ride ? fmtSpeed(speedKmh) : pace ? fmtPace(pace) : "–"}
                </td>
                <td className={`${TD} text-muted-foreground`}>
                  {lap.average_heartrate ? Math.round(lap.average_heartrate) : "–"}
                </td>
                <td className={`${TD} text-muted-foreground`}>
                  {lap.max_heartrate ? Math.round(lap.max_heartrate) : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KmSplitsTable({ splits, t }: { splits: StravaSplit[]; t: Dict }) {
  const paces = splits
    .map((s) => (s.average_speed ? 1000 / s.average_speed : paceOf(s.distance, s.moving_time)))
    .map((p) => p ?? Number.POSITIVE_INFINITY);
  const fastest = Math.min(...paces.filter((p) => Number.isFinite(p)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className={TH}>km</th>
            <th className={TH}>{t.review.pace}</th>
            <th className={`${TH} w-full`} aria-hidden></th>
            <th className={TH}>{t.detail.hr}</th>
            <th className={TH}>{t.detail.elev}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {splits.map((split, index) => {
            const pace = paces[index];
            const partial = (split.distance ?? 1000) < 950;
            const width =
              Number.isFinite(pace) && Number.isFinite(fastest) && pace > 0
                ? Math.max(8, Math.round((fastest / pace) * 100))
                : 0;
            return (
              <tr key={index}>
                <td className={`${TD} text-muted-foreground`}>
                  {partial ? ((split.distance ?? 0) / 1000).toFixed(1) : split.split ?? index + 1}
                </td>
                <td className={`${TD} font-medium`}>
                  {Number.isFinite(pace) ? fmtPace(pace) : "–"}
                </td>
                <td className="w-full min-w-28 px-2 py-1.5">
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </td>
                <td className={`${TD} text-muted-foreground`}>
                  {split.average_heartrate ? Math.round(split.average_heartrate) : "–"}
                </td>
                <td className={`${TD} text-muted-foreground`}>
                  {split.elevation_difference != null
                    ? `${split.elevation_difference > 0 ? "+" : ""}${Math.round(split.elevation_difference)} m`
                    : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ActivityPage({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const activity = await getActivity(numericId);
  if (!activity) notFound();

  const { lang, t } = await getDict();
  const run = isRunSport(activity.sport_type);
  const ride = isRideSport(activity.sport_type);
  const confirmed = activity.status === "confirmed";

  const shoes: ShoeOption[] = ride
    ? []
    : (await listShoes()).map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        retired: !!s.retired_at,
      }));
  const bikes: BikeOption[] = ride
    ? (await listBikes()).map((b) => ({
        id: b.id,
        name: b.name,
        role: b.role,
        retired: !!b.retired_at,
      }))
    : [];
  const metrics = ride ? rideMetrics(activity) : null;

  const detail = await ensureActivityDetail(activity);
  const laps = (detail?.laps ?? []).filter(
    (lap) => (lap.distance ?? 0) > 0 || (lap.moving_time ?? 0) > 0
  );
  const kmSplits = (detail?.splits_metric ?? []).filter((s) => (s.distance ?? 0) > 0);
  // Devices auto-lap every km; only show laps when they carry real structure.
  const structuredLaps =
    laps.length > 1 && laps.some((lap) => Math.abs((lap.distance ?? 0) - 1000) > 150);
  const description = detail?.description?.trim();

  let rawPretty: string | null = null;
  const rawSource = detail ?? (activity.raw_json ? activity.raw_json : null);
  if (rawSource) {
    try {
      rawPretty = JSON.stringify(
        typeof rawSource === "string" ? JSON.parse(rawSource) : rawSource,
        null,
        2
      );
    } catch {
      rawPretty = typeof rawSource === "string" ? rawSource : null;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden /> {t.detail.backToLog}
      </Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <SportIcon sport={activity.sport_type} />
          <span>{activity.sport_type ?? ""}</span>
          <span aria-hidden>·</span>
          <span>
            {fmtDateLong(activity.started_at, lang)}
            {activity.started_at && fmtTime(activity.started_at) !== "00:00"
              ? `, ${fmtTime(activity.started_at)}`
              : ""}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 font-display text-3xl font-semibold tracking-tight">
            {activity.is_race === 1 ? (
              <MedalIcon className="size-6 shrink-0 text-primary" aria-label={t.detail.race} />
            ) : null}
            {activity.name ?? t.log.untitled}
          </h1>
          {confirmed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
              <CheckCircle2Icon className="size-3.5" aria-hidden /> {t.detail.confirmed}
            </span>
          ) : (
            <Link
              href="/review"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <ClockIcon className="size-3.5" aria-hidden /> {t.detail.pending}
            </Link>
          )}
        </div>
      </header>

      {description ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground italic">
          {description}
        </p>
      ) : null}

      {confirmed ? (
        <div className="mt-4">
          <RaceControl activity={activity} />
        </div>
      ) : null}

      {ride && metrics ? (
        <dl className="mt-6 grid grid-cols-3 gap-x-4 gap-y-4 rounded-xl border bg-card p-4 sm:grid-cols-4">
          <Stat
            label={t.review.distance}
            value={fmtKm(activity.distance_km, (activity.distance_km ?? 0) >= 100 ? 1 : 2)}
          />
          <Stat label={t.review.time} value={fmtDuration(activity.moving_time_s)} />
          <Stat
            label={metrics.indoor ? `${t.detail.speed} (${t.detail.estimated})` : t.detail.avgSpeed}
            value={fmtSpeed(metrics.avgSpeedKmh)}
          />
          {metrics.indoor ? null : (
            <Stat label={t.review.elevation} value={fmtElev(activity.elevation_gain_m)} />
          )}
          {metrics.avgPower != null ? (
            <Stat label={t.detail.avgPower} value={fmtPower(metrics.avgPower)} />
          ) : null}
          {metrics.normalizedPower != null ? (
            <Stat label={t.detail.normPower} value={fmtPower(metrics.normalizedPower)} />
          ) : null}
          {metrics.maxPower != null ? (
            <Stat label={t.detail.maxPower} value={fmtPower(metrics.maxPower)} />
          ) : null}
          {metrics.avgCadence != null ? (
            <Stat label={t.detail.cadence} value={fmtCadence(metrics.avgCadence)} />
          ) : null}
          <Stat label={t.review.heartRate} value={fmtHr(activity.avg_hr)} />
          {detail?.max_heartrate ? (
            <Stat label={t.detail.maxHr} value={fmtHr(detail.max_heartrate)} />
          ) : null}
          {metrics.kilojoules != null ? (
            <Stat label={t.detail.energy} value={fmtEnergy(metrics.kilojoules)} />
          ) : detail?.calories ? (
            <Stat label={t.detail.calories} value={`${Math.round(detail.calories)} kcal`} />
          ) : null}
          {metrics.variabilityIndex != null ? (
            <Stat label={t.detail.variability} value={metrics.variabilityIndex.toFixed(2)} />
          ) : null}
        </dl>
      ) : (
        <dl className="mt-6 grid grid-cols-3 gap-x-4 gap-y-4 rounded-xl border bg-card p-4 sm:grid-cols-5">
          <Stat
            label={t.review.distance}
            value={fmtKm(activity.distance_km, (activity.distance_km ?? 0) >= 100 ? 1 : 2)}
          />
          {run ? <Stat label={t.review.pace} value={fmtPace(activity.avg_pace_s_per_km)} /> : null}
          <Stat label={t.review.time} value={fmtDuration(activity.moving_time_s)} />
          <Stat label={t.review.heartRate} value={fmtHr(activity.avg_hr)} />
          <Stat label={t.review.elevation} value={fmtElev(activity.elevation_gain_m)} />
          {detail?.max_heartrate ? (
            <Stat label={t.detail.maxHr} value={fmtHr(detail.max_heartrate)} />
          ) : null}
          {detail?.calories ? (
            <Stat label={t.detail.calories} value={`${Math.round(detail.calories)} kcal`} />
          ) : null}
        </dl>
      )}

      {structuredLaps ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.detail.laps}</CardTitle>
          </CardHeader>
          <CardContent>
            <LapsTable laps={laps} t={t} ride={ride} />
          </CardContent>
        </Card>
      ) : null}

      {kmSplits.length > 1 && !ride ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.detail.kmSplits}</CardTitle>
          </CardHeader>
          <CardContent>
            <KmSplitsTable splits={kmSplits} t={t} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t.detail.journal}</CardTitle>
        </CardHeader>
        <CardContent>
          <JournalEditor activity={activity} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{ride ? t.detail.bike : t.detail.shoes}</CardTitle>
        </CardHeader>
        <CardContent>
          {ride ? (
            <BikeSection activity={activity} bikes={bikes} />
          ) : (
            <SplitsSection activity={activity} shoes={shoes} />
          )}
        </CardContent>
      </Card>

      {rawPretty ? (
        <details className="group mt-6 rounded-xl border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground transition-colors select-none hover:text-foreground">
            {t.detail.raw}
            <span className="ml-2 text-xs text-muted-foreground/60 group-open:hidden">
              {t.detail.show}
            </span>
            <span className="ml-2 hidden text-xs text-muted-foreground/60 group-open:inline">
              {t.detail.hide}
            </span>
          </summary>
          <pre className="max-h-96 overflow-auto border-t px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {rawPretty}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
