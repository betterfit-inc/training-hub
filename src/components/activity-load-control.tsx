"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { resetActivityLoadAction, setActivityLoadManualAction } from "@/lib/actions";

export function ActivityLoadControl({
  activityId,
  tss,
  method,
  source,
}: {
  activityId: number;
  tss: number;
  method: string | null;
  source: "auto" | "manual" | "computed";
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(tss));
  const [pending, startTransition] = useTransition();

  const methodLabel = method ? t.fitness.methods[method] : null;

  function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error(t.errors.invalidLoad);
      return;
    }
    startTransition(async () => {
      const result = await setActivityLoadManualAction(activityId, parsed);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.detail.loadSaved);
      setEditing(false);
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetActivityLoadAction(activityId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.detail.loadReset);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {t.detail.load}
        </span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          className="w-24 text-right font-mono tabular-nums"
        />
        <span className="text-xs text-muted-foreground">{t.fitness.tssUnit}</span>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {t.detail.save}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setValue(String(tss));
          }}
          disabled={pending}
        >
          {t.detail.cancel}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {t.detail.load}
      </span>
      <span className="font-mono font-medium tabular-nums">
        {tss} {t.fitness.tssUnit}
      </span>
      {source === "manual" ? (
        <span className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
          {t.detail.loadManual}
        </span>
      ) : methodLabel ? (
        <span className="text-xs text-muted-foreground">· {methodLabel}</span>
      ) : null}
      <Button size="icon-sm" variant="ghost" aria-label={t.detail.editLoad} onClick={() => setEditing(true)}>
        <PencilIcon />
      </Button>
      {source === "manual" ? (
        <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
          <RotateCcwIcon data-icon="inline-start" /> {t.detail.resetLoad}
        </Button>
      ) : null}
    </div>
  );
}
