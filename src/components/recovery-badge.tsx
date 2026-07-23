"use client";

import { useEffect, useState } from "react";
import { HeartPulseIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/i18n-provider";
import { fillStr } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import type { RecoveryContribution } from "@/lib/recovery";

export interface RecoveryBadgeData {
  remainingHours: number;
  asOf: string;
  drainRatePerHour: number;
  contributions: RecoveryContribution[];
  /** Device-native recovery time (hours) for the secondary reference, if present. */
  deviceHours: number | null;
}

/**
 * Live recovery-remaining badge for the header. The server hands the debt at
 * `asOf` plus the drain rate; this extrapolates the current value on the client
 * and re-renders each minute so it decrements without a round-trip. Clicking it
 * opens a transparent breakdown (recent sessions, the decay, that it is
 * app-computed) with the device value as a secondary reference.
 */
export function RecoveryBadge({ data }: { data: RecoveryBadgeData }) {
  const { t, lang } = useI18n();
  // A ticking clock so the extrapolated value updates ~once a minute. This is a
  // genuine external-time source, one of the few justified useEffect cases.
  // Start from the server's asOf (0 elapsed) so the first render is deterministic;
  // a deferred kick + a 1-minute interval then track real elapsed time. Both
  // setState calls fire from timer callbacks (not synchronously in the effect).
  const [now, setNow] = useState<number>(() => Date.parse(data.asOf));
  useEffect(() => {
    const kick = setTimeout(() => setNow(Date.now()), 30);
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearTimeout(kick);
      clearInterval(id);
    };
  }, []);

  const elapsedHours = Math.max(0, (now - Date.parse(data.asOf)) / 3_600_000);
  const remaining = Math.max(0, data.remainingHours - elapsedHours * data.drainRatePerHour);
  // The header badge stays compact (numeric hours, even "0h"); the word
  // "Recovered" is reserved for the dialog where there is room for it.
  const badgeLabel = `${Math.round(remaining)}h`;
  const fullLabel = remaining < 0.5 ? t.health.recovery.recovered : badgeLabel;
  const color =
    remaining >= 24
      ? "var(--wear-critical)"
      : remaining >= 8
        ? "var(--wear-worn)"
        : "var(--positive)";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label={fillStr(t.health.recovery.badgeLabel, { h: Math.round(remaining) })}
        >
          <HeartPulseIcon className="size-3.5" style={{ color }} aria-hidden />
          <span className="font-mono tabular-nums" style={{ color }}>
            {badgeLabel}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.health.recovery.remaining}</DialogTitle>
          <DialogDescription>{t.health.recovery.infoBody}</DialogDescription>
        </DialogHeader>

        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-bold tabular-nums" style={{ color }}>
            {fullLabel}
          </span>
          <span className="text-xs text-muted-foreground">{t.health.recovery.computed}</span>
          {data.deviceHours != null ? (
            <span className="ml-auto text-xs text-muted-foreground">
              {fillStr(t.health.recovery.deviceRef, { h: Math.round(data.deviceHours) })}
            </span>
          ) : null}
        </div>

        <div className="mt-2">
          <h3 className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t.health.recovery.contributions}
          </h3>
          {data.contributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.health.recovery.noContributions}</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {data.contributions.map((c) => {
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
                      style={{
                        color: positive ? "var(--wear-worn)" : "var(--positive)",
                      }}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
