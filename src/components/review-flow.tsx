"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2Icon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FootprintsIcon,
  InboxIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { FeelingControl, RpeControl } from "@/components/journal-controls";
import { SportIcon } from "@/components/sport-icon";
import {
  SplitsEditor,
  newRowKey,
  rowsToSplits,
  type SplitRow,
} from "@/components/splits-editor";
import { confirmActivityAction } from "@/lib/actions";
import {
  fmtDate,
  fmtDuration,
  fmtElev,
  fmtHr,
  fmtKm,
  fmtPace,
  fmtTime,
} from "@/lib/format";
import { isRunSport, validateSplits } from "@/lib/validate";
import type { ActivityWithSplits, Feeling, ShoeOption } from "@/lib/types";

interface FormState {
  rows: SplitRow[];
  rpe: number | null;
  feeling: Feeling | null;
  workoutNotes: string;
  healthNotes: string;
}

interface Summary {
  count: number;
  totalKm: number;
  perShoe: Record<string, number>;
}

function initForm(activity: ActivityWithSplits): FormState {
  const rows: SplitRow[] = activity.splits.map((s) => ({
    key: newRowKey(),
    shoeId: s.shoe_id,
    km: s.km ? String(s.km) : "",
  }));
  if (
    rows.length === 0 &&
    isRunSport(activity.sport_type) &&
    (activity.distance_km ?? 0) > 0
  ) {
    rows.push({ key: newRowKey(), shoeId: null, km: String(activity.distance_km) });
  }
  return {
    rows,
    rpe: activity.rpe,
    feeling: activity.feeling,
    workoutNotes: activity.workout_notes ?? "",
    healthNotes: activity.health_notes ?? "",
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

export function ReviewFlow({
  items: serverItems,
  shoes,
}: {
  items: ActivityWithSplits[];
  shoes: ShoeOption[];
}) {
  const router = useRouter();
  const [queue, setQueue] = useState<ActivityWithSplits[]>(serverItems);
  const [index, setIndex] = useState(0);
  const [forms, setForms] = useState<Record<number, FormState>>({});
  const [handledIds, setHandledIds] = useState<Set<number>>(() => new Set());
  const [summary, setSummary] = useState<Summary>({ count: 0, totalKm: 0, perShoe: {} });
  const [pending, startTransition] = useTransition();
  const kmInputRef = useRef<HTMLInputElement | null>(null);

  const sessionTotal = summary.count + queue.length;
  const current = queue[index] ?? null;
  const form = useMemo(
    () => (current ? forms[current.id] ?? initForm(current) : null),
    [current, forms]
  );

  const splitsPayload = useMemo(() => (form ? rowsToSplits(form.rows) : []), [form]);
  const validationError = current && form ? validateSplits(current, splitsPayload) : null;

  function patchForm(patch: Partial<FormState>) {
    if (!current) return;
    const id = current.id;
    const base = forms[id] ?? initForm(current);
    setForms((f) => ({ ...f, [id]: { ...base, ...patch } }));
  }

  function goto(next: number) {
    if (queue.length === 0) return;
    setIndex(Math.min(Math.max(next, 0), queue.length - 1));
  }

  function confirmCurrent() {
    if (!current || !form || pending) return;
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const activity = current;
    const payload = splitsPayload;
    startTransition(async () => {
      const result = await confirmActivityAction({
        activityId: activity.id,
        splits: payload,
        rpe: form.rpe,
        feeling: form.feeling,
        workoutNotes: form.workoutNotes,
        healthNotes: form.healthNotes,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSummary((prev) => {
        const perShoe = { ...prev.perShoe };
        for (const split of payload) {
          const shoe = shoes.find((s) => s.id === split.shoe_id);
          if (shoe) perShoe[shoe.name] = (perShoe[shoe.name] ?? 0) + split.km;
        }
        return {
          count: prev.count + 1,
          totalKm: prev.totalKm + (activity.distance_km ?? 0),
          perShoe,
        };
      });
      setHandledIds((prev) => new Set(prev).add(activity.id));
      setQueue((q) => {
        const nextQueue = q.filter((a) => a.id !== activity.id);
        setIndex((i) => Math.min(i, Math.max(0, nextQueue.length - 1)));
        return nextQueue;
      });
      router.refresh();
    });
  }

  // Keep the handlers fresh for the global keyboard listener.
  const keyApi = useRef({ confirmCurrent, goto, index, rpe: patchForm });
  useEffect(() => {
    keyApi.current = { confirmCurrent, goto, index, rpe: patchForm };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const api = keyApi.current;
      const target = event.target as HTMLElement | null;
      const typing = !!target?.closest(
        "input, textarea, select, [contenteditable], [role='combobox'], [role='listbox'], [role='option']"
      );

      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        api.confirmCurrent();
        return;
      }
      if (typing) return;

      if (event.key === "Enter") {
        // Let focused buttons and links keep their native Enter behavior.
        if (target?.closest("button, a")) return;
        event.preventDefault();
        api.confirmCurrent();
      } else if (event.key === "ArrowRight") {
        api.goto(api.index + 1);
      } else if (event.key === "ArrowLeft") {
        api.goto(api.index - 1);
      } else if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        kmInputRef.current?.focus();
        kmInputRef.current?.select();
      } else if (/^[0-9]$/.test(event.key)) {
        const value = event.key === "0" ? 10 : Number(event.key);
        api.rpe({ rpe: value });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ------------------------------------------------------------------
  // Empty queue states
  // ------------------------------------------------------------------
  if (!current || !form) {
    const freshArrivals = serverItems.filter((a) => !handledIds.has(a.id));
    return (
      <div className="animate-in fade-in zoom-in-95 duration-500">
        {summary.count > 0 ? (
          <div className="flex flex-col items-center rounded-xl border bg-card px-6 py-14 text-center">
            <CheckCircle2Icon className="size-10 text-positive" aria-hidden />
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight">
              All caught up
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You confirmed {summary.count} {summary.count === 1 ? "activity" : "activities"}
              {summary.totalKm > 0 ? <> covering {fmtKm(summary.totalKm)}</> : null}.
            </p>
            {Object.keys(summary.perShoe).length > 0 ? (
              <dl className="mt-6 w-full max-w-sm space-y-1.5 text-sm">
                {Object.entries(summary.perShoe)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, km]) => (
                    <div
                      key={name}
                      className="flex items-baseline justify-between gap-4 border-b border-dashed border-border/70 pb-1.5"
                    >
                      <dt className="truncate text-muted-foreground">{name}</dt>
                      <dd className="font-mono font-medium tabular-nums text-positive">
                        +{fmtKm(km)}
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : null}
            <div className="mt-8 flex items-center gap-2">
              <Button asChild>
                <Link href="/">Back to the log</Link>
              </Button>
              {freshArrivals.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQueue(freshArrivals);
                    setIndex(0);
                  }}
                >
                  Review {freshArrivals.length} more
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={InboxIcon}
            title="All caught up"
            description="New activities land here after a sync. Confirm them to add mileage to your shoes."
          >
            <Button asChild variant="outline">
              <Link href="/">Back to the log</Link>
            </Button>
          </EmptyState>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Review card
  // ------------------------------------------------------------------
  const run = isRunSport(current.sport_type);
  const distance = current.distance_km ?? 0;
  const hadUnmatchedShoe = run && current.splits.some((s) => s.shoe_id === null);
  const activeShoes = shoes.filter((s) => !s.retired);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {summary.count + index + 1} of {sessionTotal}
          </span>
          {sessionTotal <= 30 ? (
            <div className="flex items-center gap-1" aria-hidden>
              {Array.from({ length: sessionTotal }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-3 w-[3px] rounded-full",
                    i < summary.count + index
                      ? "bg-positive"
                      : i === summary.count + index
                        ? "bg-primary"
                        : "bg-border"
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous activity"
            disabled={index === 0}
            onClick={() => goto(index - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next activity"
            disabled={index >= queue.length - 1}
            onClick={() => goto(index + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <Card key={current.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        <CardContent className="space-y-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SportIcon sport={current.sport_type} />
              <span>{current.sport_type ?? "Activity"}</span>
              <span aria-hidden>·</span>
              <span className="font-mono tabular-nums">
                {fmtDate(current.started_at)}
                {current.started_at ? `, ${fmtTime(current.started_at)}` : ""}
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight">
              {current.name ?? "Untitled activity"}
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5">
            <Stat label="Distance" value={fmtKm(distance, distance >= 100 ? 0 : 2)} />
            {run ? <Stat label="Pace" value={fmtPace(current.avg_pace_s_per_km)} /> : null}
            <Stat label="Time" value={fmtDuration(current.moving_time_s)} />
            <Stat label="Heart rate" value={fmtHr(current.avg_hr)} />
            <Stat label="Elevation" value={fmtElev(current.elevation_gain_m)} />
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs tracking-wider text-muted-foreground uppercase">
                {run ? "Shoes" : "Shoes (optional)"}
              </Label>
              {hadUnmatchedShoe ? (
                <span className="inline-flex items-center gap-1 text-xs text-wear-worn">
                  <TriangleAlertIcon className="size-3.5" aria-hidden />
                  No shoe matched from Strava gear
                </span>
              ) : null}
            </div>
            <SplitsEditor
              rows={form.rows}
              onChange={(rows) => patchForm({ rows })}
              distanceKm={distance}
              isRun={run}
              shoes={shoes}
              firstKmInputRef={kmInputRef}
            />
          </div>

          <Separator />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs tracking-wider text-muted-foreground uppercase">
                Effort (RPE)
              </Label>
              <RpeControl value={form.rpe} onChange={(rpe) => patchForm({ rpe })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs tracking-wider text-muted-foreground uppercase">
                Feeling
              </Label>
              <FeelingControl
                value={form.feeling}
                onChange={(feeling) => patchForm({ feeling })}
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="workout-notes"
                className="text-xs tracking-wider text-muted-foreground uppercase"
              >
                Workout notes
              </Label>
              <Textarea
                id="workout-notes"
                value={form.workoutNotes}
                onChange={(e) => patchForm({ workoutNotes: e.target.value })}
                placeholder="How did it go? Execution, splits, fueling..."
                className="min-h-24 resize-y"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="health-notes"
                className="text-xs tracking-wider text-muted-foreground uppercase"
              >
                Health notes
              </Label>
              <Textarea
                id="health-notes"
                value={form.healthNotes}
                onChange={(e) => patchForm({ healthNotes: e.target.value })}
                placeholder="Body, sleep, niggles, general health..."
                className="min-h-24 resize-y"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full"
              onClick={confirmCurrent}
              disabled={pending || !!validationError || activeShoes.length === 0}
            >
              {pending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckIcon data-icon="inline-start" />
              )}
              Confirm activity
              <kbd className="kbd ml-1 border-primary-foreground/30 bg-transparent text-primary-foreground/80">
                ↵
              </kbd>
            </Button>
            {validationError ? (
              <p className="text-center text-xs text-wear-worn">{validationError}</p>
            ) : null}
            {activeShoes.length === 0 && run ? (
              <p className="text-center text-xs text-wear-worn">
                Add a shoe first, from the <Link href="/shoes" className="underline">Shoes</Link> page.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <kbd className="kbd">↵</kbd> confirm
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="kbd">←</kbd>
          <kbd className="kbd">→</kbd> navigate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="kbd">E</kbd> edit splits
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="kbd">1</kbd>–<kbd className="kbd">0</kbd> RPE
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FootprintsIcon className="size-3" aria-hidden /> confirming adds mileage to your shoes
        </span>
      </p>
    </div>
  );
}
