"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FeelingBadge } from "@/components/feeling-badge";
import { FeelingControl, RpeControl } from "@/components/journal-controls";
import { updateJournalAction } from "@/lib/actions";
import type { Activity, Feeling } from "@/lib/types";

function NoteBlock({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      {text ? (
        <p className="mt-1 font-display text-[15px] leading-relaxed italic whitespace-pre-wrap">
          {text}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground/60">Nothing noted.</p>
      )}
    </div>
  );
}

export function JournalEditor({ activity }: { activity: Activity }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rpe, setRpe] = useState<number | null>(activity.rpe);
  const [feeling, setFeeling] = useState<Feeling | null>(activity.feeling);
  const [workoutNotes, setWorkoutNotes] = useState(activity.workout_notes ?? "");
  const [healthNotes, setHealthNotes] = useState(activity.health_notes ?? "");
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setRpe(activity.rpe);
    setFeeling(activity.feeling);
    setWorkoutNotes(activity.workout_notes ?? "");
    setHealthNotes(activity.health_notes ?? "");
    setEditing(true);
  }

  function save() {
    startTransition(async () => {
      const result = await updateJournalAction({
        activityId: activity.id,
        rpe,
        feeling,
        workoutNotes,
        healthNotes,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Journal saved");
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    const empty =
      activity.rpe == null &&
      activity.feeling == null &&
      !activity.workout_notes &&
      !activity.health_notes;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {activity.feeling ? <FeelingBadge feeling={activity.feeling} /> : null}
            {activity.rpe != null ? (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-medium tabular-nums">
                RPE {activity.rpe}
              </span>
            ) : null}
            {empty ? (
              <span className="text-sm text-muted-foreground/60">
                No journal entry for this activity yet.
              </span>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <PencilIcon data-icon="inline-start" />
            {empty ? "Add notes" : "Edit"}
          </Button>
        </div>
        {!empty ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <NoteBlock label="Workout" text={activity.workout_notes} />
            <NoteBlock label="Health" text={activity.health_notes} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs tracking-wider text-muted-foreground uppercase">
            Effort (RPE)
          </Label>
          <RpeControl value={rpe} onChange={setRpe} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs tracking-wider text-muted-foreground uppercase">Feeling</Label>
          <FeelingControl value={feeling} onChange={setFeeling} />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="edit-workout-notes"
            className="text-xs tracking-wider text-muted-foreground uppercase"
          >
            Workout notes
          </Label>
          <Textarea
            id="edit-workout-notes"
            value={workoutNotes}
            onChange={(e) => setWorkoutNotes(e.target.value)}
            className="min-h-24 resize-y"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="edit-health-notes"
            className="text-xs tracking-wider text-muted-foreground uppercase"
          >
            Health notes
          </Label>
          <Textarea
            id="edit-health-notes"
            value={healthNotes}
            onChange={(e) => setHealthNotes(e.target.value)}
            className="min-h-24 resize-y"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          Save
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
