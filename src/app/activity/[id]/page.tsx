import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CheckCircle2Icon, ClockIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JournalEditor } from "@/components/journal-editor";
import { SplitsSection } from "@/components/splits-section";
import { SportIcon } from "@/components/sport-icon";
import { getActivity, listShoes } from "@/lib/db";
import {
  fmtDateLong,
  fmtDuration,
  fmtElev,
  fmtHr,
  fmtKm,
  fmtPace,
  fmtTime,
} from "@/lib/format";
import { isRunSport } from "@/lib/validate";
import type { ShoeOption } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params;
  const activity = getActivity(Number(id));
  return { title: activity?.name ?? "Activity" };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export default async function ActivityPage({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const activity = getActivity(numericId);
  if (!activity) notFound();

  const shoes: ShoeOption[] = listShoes().map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    retired: !!s.retired_at,
  }));

  const run = isRunSport(activity.sport_type);
  const confirmed = activity.status === "confirmed";

  let rawPretty: string | null = null;
  if (activity.raw_json) {
    try {
      rawPretty = JSON.stringify(JSON.parse(activity.raw_json), null, 2);
    } catch {
      rawPretty = activity.raw_json;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden /> Training log
      </Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <SportIcon sport={activity.sport_type} />
          <span>{activity.sport_type ?? "Activity"}</span>
          <span aria-hidden>·</span>
          <span>
            {fmtDateLong(activity.started_at)}
            {activity.started_at && fmtTime(activity.started_at) !== "00:00"
              ? `, ${fmtTime(activity.started_at)}`
              : ""}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {activity.name ?? "Untitled activity"}
          </h1>
          {confirmed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
              <CheckCircle2Icon className="size-3.5" aria-hidden /> Confirmed
            </span>
          ) : (
            <Link
              href="/review"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <ClockIcon className="size-3.5" aria-hidden /> Pending review
            </Link>
          )}
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-3 gap-x-4 gap-y-4 rounded-xl border bg-card p-4 sm:grid-cols-5">
        <Stat
          label="Distance"
          value={fmtKm(activity.distance_km, (activity.distance_km ?? 0) >= 100 ? 1 : 2)}
        />
        {run ? <Stat label="Pace" value={fmtPace(activity.avg_pace_s_per_km)} /> : null}
        <Stat label="Time" value={fmtDuration(activity.moving_time_s)} />
        <Stat label="Heart rate" value={fmtHr(activity.avg_hr)} />
        <Stat label="Elevation" value={fmtElev(activity.elevation_gain_m)} />
      </dl>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Journal</CardTitle>
        </CardHeader>
        <CardContent>
          <JournalEditor activity={activity} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Shoes</CardTitle>
        </CardHeader>
        <CardContent>
          <SplitsSection activity={activity} shoes={shoes} />
        </CardContent>
      </Card>

      {rawPretty ? (
        <details className="group mt-6 rounded-xl border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground transition-colors select-none hover:text-foreground">
            Raw Strava data
            <span className="ml-2 text-xs text-muted-foreground/60 group-open:hidden">
              show
            </span>
            <span className="ml-2 hidden text-xs text-muted-foreground/60 group-open:inline">
              hide
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
