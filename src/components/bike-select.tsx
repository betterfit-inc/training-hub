"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/components/i18n-provider";
import { NONE } from "@/lib/constants";
import type { BikeOption } from "@/lib/types";

export function BikeSelect({
  value,
  onChange,
  bikes,
  className,
}: {
  value: number | null;
  onChange: (bikeId: number | null) => void;
  bikes: BikeOption[];
  className?: string;
}) {
  const { t } = useI18n();
  const active = bikes.filter((b) => !b.retired);
  const retired = bikes.filter((b) => b.retired);

  return (
    <Select
      value={value != null ? String(value) : NONE}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t.detail.noBike}</SelectItem>
        {active.map((bike) => (
          <SelectItem key={bike.id} value={String(bike.id)}>
            <span className="truncate">{bike.name}</span>
            {bike.role ? (
              <span className="text-xs text-muted-foreground">· {bike.role}</span>
            ) : null}
          </SelectItem>
        ))}
        {retired.length > 0 ? (
          <>
            <SelectSeparator />
            {retired.map((bike) => (
              <SelectItem key={bike.id} value={String(bike.id)}>
                <span className="truncate">{bike.name}</span>
                <span className="text-xs text-muted-foreground">· {t.splits.retiredTag}</span>
              </SelectItem>
            ))}
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}
