"use client";

import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtKm, round2 } from "@/lib/format";
import type { ShoeOption } from "@/lib/types";

export interface SplitRow {
  key: string;
  shoeId: number | null;
  km: string;
}

export function rowsToSplits(rows: SplitRow[]) {
  return rows.map((r) => ({ shoe_id: r.shoeId, km: parseFloat(r.km) || 0 }));
}

let rowCounter = 0;
export function newRowKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function SplitsEditor({
  rows,
  onChange,
  distanceKm,
  isRun,
  shoes,
  firstKmInputRef,
}: {
  rows: SplitRow[];
  onChange: (rows: SplitRow[]) => void;
  distanceKm: number;
  isRun: boolean;
  shoes: ShoeOption[];
  firstKmInputRef?: React.Ref<HTMLInputElement>;
}) {
  const active = shoes.filter((s) => !s.retired);
  const retired = shoes.filter((s) => s.retired);
  const total = rows.reduce((acc, r) => acc + (parseFloat(r.km) || 0), 0);
  const remaining = round2(distanceKm - total);

  function setRow(index: number, patch: Partial<SplitRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    onChange([
      ...rows,
      { key: newRowKey(), shoeId: null, km: remaining > 0 ? String(remaining) : "" },
    ]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          {isRun
            ? "No shoe assigned yet. Add a split below."
            : "No shoe mileage for this activity. Add a split if it wore a shoe down."}
        </p>
      ) : null}

      {rows.map((row, index) => (
        <div key={row.key} className="flex items-center gap-2">
          <Select
            value={row.shoeId != null ? String(row.shoeId) : undefined}
            onValueChange={(v) => setRow(index, { shoeId: Number(v) })}
          >
            <SelectTrigger
              className={cn(
                "min-w-0 flex-1",
                row.shoeId == null && "border-wear-worn text-muted-foreground"
              )}
            >
              <SelectValue placeholder="Pick a shoe" />
            </SelectTrigger>
            <SelectContent>
              {active.map((shoe) => (
                <SelectItem key={shoe.id} value={String(shoe.id)}>
                  <span className="truncate">{shoe.name}</span>
                  {shoe.role ? (
                    <span className="text-xs text-muted-foreground">· {shoe.role}</span>
                  ) : null}
                </SelectItem>
              ))}
              {retired.length > 0 ? (
                <>
                  <SelectSeparator />
                  {retired.map((shoe) => (
                    <SelectItem key={shoe.id} value={String(shoe.id)}>
                      <span className="truncate">{shoe.name}</span>
                      <span className="text-xs text-muted-foreground">· retired</span>
                    </SelectItem>
                  ))}
                </>
              ) : null}
            </SelectContent>
          </Select>

          <div className="relative shrink-0">
            <Input
              ref={index === 0 ? firstKmInputRef : undefined}
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={row.km}
              onChange={(e) => setRow(index, { km: e.target.value })}
              aria-label="Split distance in kilometers"
              className="w-27 pr-9 text-right font-mono tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
              km
            </span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove split"
            onClick={() => removeRow(index)}
          >
            <XIcon />
          </Button>
        </div>
      ))}

      <div className="flex min-h-7 items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={addRow}>
          <PlusIcon data-icon="inline-start" /> Add split
        </Button>
        {distanceKm > 0 && (isRun || rows.length > 0) ? (
          Math.abs(remaining) <= 0.05 ? (
            <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-positive">
              <CheckIcon className="size-3.5" aria-hidden />
              all {fmtKm(distanceKm)} assigned
            </span>
          ) : remaining > 0 ? (
            <span className="font-mono text-xs tabular-nums text-wear-worn">
              {fmtKm(remaining)} unassigned
            </span>
          ) : (
            <span className="font-mono text-xs tabular-nums text-wear-critical">
              {fmtKm(-remaining)} over the distance
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}
