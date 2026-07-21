import Link from "next/link";
import { CableIcon, FootprintsIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { FeelingBadge } from "@/components/feeling-badge";
import { ReviewBanner } from "@/components/review-banner";
import { SportIcon } from "@/components/sport-icon";
import { countPending, listConfirmedActivities } from "@/lib/db";
import { isStravaConnected, stravaConfigured } from "@/lib/strava";
import {
  fmtDate,
  fmtDuration,
  fmtKm,
  fmtPace,
  mondayOf,
  weekLabel,
} from "@/lib/format";
import { isRunSport } from "@/lib/validate";
import type { ActivityWithSplits } from "@/lib/types";

export const metadata = { title: "Training log" };

interface WeekGroup {
  key: string;
  label: string;
  runKm: number;
  items: ActivityWithSplits[];
}

function groupByWeek(activities: ActivityWithSplits[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  const byKey = new Map<string, WeekGroup>();
  for (const activity of activities) {
    const date = new Date(activity.started_at ?? activity.created_at);
    const monday = mondayOf(date);
    const key = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: weekLabel(monday), runKm: 0, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(activity);
    if (isRunSport(activity.sport_type)) group.runKm += activity.distance_km ?? 0;
  }
  return groups;
}

function ActivityRow({ activity }: { activity: ActivityWithSplits }) {
  const run = isRunSport(activity.sport_type);
  const statParts = [
    activity.distance_km ? fmtKm(activity.distance_km) : null,
    run ? fmtPace(activity.avg_pace_s_per_km) : null,
    activity.moving_time_s ? fmtDuration(activity.moving_time_s) : null,
  ].filter((part) => part && part !== "–");
  const shoeSplits = activity.splits.filter((s) => s.shoe_name);

  return (
    <li>
      <Link
        href={`/activity/${activity.id}`}
        className="group -mx-2 grid grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/50 lg:grid-cols-[74px_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_92px_minmax(0,0.85fr)]"
      >
        <span className="font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
          {fmtDate(activity.started_at)}
        </span>

        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <SportIcon sport={activity.sport_type} className="shrink-0" />
            <span className="truncate text-sm font-medium transition-colors group-hover:text-primary">
              {activity.name ?? "Untitled activity"}
            </span>
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-muted-foreground">
            {statParts.join(" · ") || activity.sport_type}
          </span>
        </span>

        <span className="hidden min-w-0 truncate font-display text-[13px] text-muted-foreground italic lg:block">
          {activity.workout_notes ?? ""}
        </span>

        <span className="hidden min-w-0 truncate font-display text-[13px] text-muted-foreground italic lg:block">
          {activity.health_notes ?? ""}
        </span>

        <span className="justify-self-start">
          {activity.feeling ? (
            <FeelingBadge feeling={activity.feeling} />
          ) : (
            <span aria-hidden className="text-xs text-muted-foreground/40">
              –
            </span>
          )}
        </span>

        <span className="hidden min-w-0 flex-wrap items-center gap-1 lg:flex">
          {shoeSplits.length === 0 ? (
            <span aria-hidden className="text-xs text-muted-foreground/40">
              –
            </span>
          ) : (
            shoeSplits.map((split) => (
              <span
                key={split.id}
                className="max-w-full truncate rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
                title={`${split.shoe_name} · ${fmtKm(split.km)}`}
              >
                {split.shoe_name}
                {shoeSplits.length > 1 ? (
                  <span className="font-mono tabular-nums"> {fmtKm(split.km, 0)}</span>
                ) : null}
              </span>
            ))
          )}
        </span>
      </Link>
    </li>
  );
}

export default function TrainingLogPage() {
  const pending = countPending();
  const activities = listConfirmedActivities();
  const weeks = groupByWeek(activities);
  const totalKm = activities.reduce((acc, a) => acc + (a.distance_km ?? 0), 0);
  const connected = isStravaConnected();
  const configured = stravaConfigured();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Training log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activities.length === 0 ? (
              "Nothing confirmed yet."
            ) : (
              <>
                {activities.length} confirmed {activities.length === 1 ? "activity" : "activities"}
                <span aria-hidden> · </span>
                <span className="font-mono tabular-nums">{fmtKm(totalKm, 0)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {pending > 0 ? (
        <div className="mt-5">
          <ReviewBanner count={pending} />
        </div>
      ) : null}

      {activities.length === 0 ? (
        <div className="mt-6">
          {pending > 0 ? (
            <EmptyState
              icon={FootprintsIcon}
              title="Your log starts in the review queue"
              description="Confirm the synced activities waiting for review and they will show up here."
            >
              <Button asChild>
                <Link href="/review">Go to review</Link>
              </Button>
            </EmptyState>
          ) : !configured || !connected ? (
            <EmptyState
              icon={CableIcon}
              title="Connect Strava to start your log"
              description={
                configured
                  ? "Link your Strava account and your activities will sync into the review queue."
                  : "Add your Strava API keys, connect your account, and your activities will sync into the review queue."
              }
            >
              <Button asChild>
                <Link href="/settings">Open Settings</Link>
              </Button>
            </EmptyState>
          ) : (
            <EmptyState
              icon={RefreshCwIcon}
              title="No activities yet"
              description="Press Sync in the header to pull your recent Strava activities, or add a manual entry from Settings."
            >
              <Button asChild variant="outline">
                <Link href="/settings">Open Settings</Link>
              </Button>
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {weeks.map((week) => (
            <section key={week.key}>
              <header className="flex items-baseline justify-between gap-4 border-b pb-2">
                <h2 className="font-display text-base font-medium italic">{week.label}</h2>
                {week.runKm > 0 ? (
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {fmtKm(week.runKm)} run
                  </span>
                ) : null}
              </header>
              <ul className="mt-1.5 divide-y divide-border/50">
                {week.items.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
