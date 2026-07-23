"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";
import { saveHealthEntryAction } from "@/lib/actions";
import { localDateInputValue } from "@/lib/format";
import { parseFiniteNumber } from "@/lib/validate";
import { cn } from "@/lib/utils";

const RATINGS = [1, 2, 3, 4, 5] as const;
type RatingKey = "fatigue" | "soreness" | "stress" | "mood";

export interface HealthEntryInitial {
  date: string;
  fatigue: number | null;
  soreness: number | null;
  stress: number | null;
  mood: number | null;
  weight: number | null;
  sickness: boolean;
  injury: boolean;
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex items-center gap-1 rounded-lg border p-0.5"
      >
        {RATINGS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={value === r}
            onClick={() => onChange(value === r ? null : r)}
            className={cn(
              "size-7 rounded-md font-mono text-xs font-semibold tabular-nums transition-colors",
              value === r
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HealthEntryForm({ initial }: { initial?: HealthEntryInitial }) {
  const router = useRouter();
  const { t } = useI18n();
  const [date, setDate] = useState(initial?.date ?? localDateInputValue());
  const [ratings, setRatings] = useState<Record<RatingKey, number | null>>({
    fatigue: initial?.fatigue ?? null,
    soreness: initial?.soreness ?? null,
    stress: initial?.stress ?? null,
    mood: initial?.mood ?? null,
  });
  const [weight, setWeight] = useState(initial?.weight != null ? String(initial.weight) : "");
  const [sickness, setSickness] = useState(initial?.sickness ?? false);
  const [injury, setInjury] = useState(initial?.injury ?? false);
  const [pending, startTransition] = useTransition();

  const setRating = (key: RatingKey) => (v: number | null) =>
    setRatings((prev) => ({ ...prev, [key]: v }));

  // Changing the date starts a fresh entry for that day: clear the fields so
  // the previously-shown day's ratings/weight/flags can't be saved onto another
  // date. The prefill only ever applies to the initially-shown day.
  function changeDate(next: string) {
    setDate(next);
    if (next !== (initial?.date ?? "")) {
      setRatings({ fatigue: null, soreness: null, stress: null, mood: null });
      setWeight("");
      setSickness(false);
      setInjury(false);
    } else {
      setRatings({
        fatigue: initial?.fatigue ?? null,
        soreness: initial?.soreness ?? null,
        stress: initial?.stress ?? null,
        mood: initial?.mood ?? null,
      });
      setWeight(initial?.weight != null ? String(initial.weight) : "");
      setSickness(initial?.sickness ?? false);
      setInjury(initial?.injury ?? false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const weightValue = weight.trim() === "" ? null : parseFiniteNumber(weight);
    if (weight.trim() !== "" && weightValue === null) {
      toast.error(t.errors.invalidHealthEntry);
      return;
    }
    startTransition(async () => {
      const result = await saveHealthEntryAction({
        date,
        fatigue: ratings.fatigue,
        soreness: ratings.soreness,
        stress: ratings.stress,
        mood: ratings.mood,
        weight: weightValue,
        sickness,
        injury,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.health.entry.saved);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="health-date">{t.health.entry.date}</Label>
          <Input
            id="health-date"
            type="date"
            value={date}
            max={localDateInputValue()}
            onChange={(e) => changeDate(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="health-weight">{t.health.entry.weight}</Label>
          <Input
            id="health-weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t.health.entry.scaleNote}</p>
      <div className="space-y-2.5">
        <RatingRow
          label={t.health.entry.fatigue}
          value={ratings.fatigue}
          onChange={setRating("fatigue")}
        />
        <RatingRow
          label={t.health.entry.soreness}
          value={ratings.soreness}
          onChange={setRating("soreness")}
        />
        <RatingRow
          label={t.health.entry.stress}
          value={ratings.stress}
          onChange={setRating("stress")}
        />
        <RatingRow label={t.health.entry.mood} value={ratings.mood} onChange={setRating("mood")} />
      </div>

      <div className="flex flex-col gap-2.5 border-t pt-4 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={sickness}
            onChange={(e) => setSickness(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t.health.entry.sickness}
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={injury}
            onChange={(e) => setInjury(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t.health.entry.injury}
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
        {t.health.entry.save}
      </Button>
    </form>
  );
}
