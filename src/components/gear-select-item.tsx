import { SelectItem } from "@/components/ui/select";
import { fmtKm } from "@/lib/format";
import type { StravaGear } from "@/lib/types";

/** A Strava gear entry as a Select option, showing its lifetime distance when known. */
export function GearSelectItem({ gear }: { gear: StravaGear }) {
  return (
    <SelectItem value={gear.id}>
      <span className="truncate">{gear.name}</span>
      {gear.distance ? (
        <span className="text-xs text-muted-foreground">· {fmtKm(gear.distance / 1000, 0)}</span>
      ) : null}
    </SelectItem>
  );
}
