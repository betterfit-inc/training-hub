import {
  ArchiveIcon,
  FootprintsIcon,
  PencilIcon,
  SparklesIcon,
  TrendingDownIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RetireButton, ShoeDialog } from "@/components/shoe-dialog";
import { WearBar, wearStatus } from "@/components/wear-bar";
import { fmtKm } from "@/lib/format";
import type { ShoeWithMileage, StravaGear, WearStatus } from "@/lib/types";

const STATUS_META: Record<
  WearStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  fresh: { label: "Fresh", icon: SparklesIcon, className: "text-primary" },
  worn: { label: "Worn", icon: TrendingDownIcon, className: "text-wear-worn" },
  critical: { label: "Critical", icon: TriangleAlertIcon, className: "text-wear-critical" },
  retired: { label: "Retired", icon: ArchiveIcon, className: "text-muted-foreground" },
};

export function ShoeCard({
  shoe,
  gearOptions,
  gearName,
  connected,
}: {
  shoe: ShoeWithMileage;
  gearOptions: StravaGear[] | null;
  gearName: string | null;
  connected: boolean;
}) {
  const status = wearStatus(shoe);
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const cap = shoe.retirement_km && shoe.retirement_km > 0 ? shoe.retirement_km : 700;
  const overCap = shoe.current_km - cap;
  const retired = status === "retired";

  return (
    <Card className={cn("pt-0", retired && "opacity-80")}>
      <div
        className={cn(
          "relative flex h-40 items-center justify-center overflow-hidden border-b bg-gradient-to-br from-accent via-muted to-background",
          retired && "grayscale"
        )}
      >
        {shoe.photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/uploads/${encodeURIComponent(shoe.photo_path)}`}
            alt={shoe.name}
            className="size-full object-cover"
          />
        ) : (
          <FootprintsIcon className="size-10 text-primary/25" aria-hidden />
        )}
        <span
          className={cn(
            "absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-xs font-medium shadow-xs backdrop-blur",
            meta.className
          )}
        >
          <StatusIcon className="size-3" aria-hidden />
          {meta.label}
        </span>
      </div>

      <CardContent className="space-y-3">
        <div>
          <h3 className="truncate text-[15px] font-medium" title={shoe.name}>
            {shoe.name}
          </h3>
          <p className="mt-0.5 truncate font-display text-[13px] text-muted-foreground italic">
            {shoe.role ?? "no role set"}
          </p>
        </div>

        <WearBar
          currentKm={shoe.current_km}
          retirementKm={shoe.retirement_km}
          status={status}
        />

        <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
          <span>
            <span className="text-sm font-semibold">{shoe.current_km.toFixed(1)}</span>
            <span className="text-muted-foreground"> / {Math.round(cap)} km</span>
          </span>
          {overCap > 0 ? (
            <span className="text-wear-critical">+{fmtKm(overCap, 0)} over</span>
          ) : (
            <span className="text-muted-foreground">{fmtKm(cap - shoe.current_km, 0)} left</span>
          )}
        </div>

        {gearName ? (
          <p className="truncate text-xs text-muted-foreground">Strava gear: {gearName}</p>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3">
          <ShoeDialog shoe={shoe} gearOptions={gearOptions} connected={connected}>
            <Button variant="outline" size="sm">
              <PencilIcon data-icon="inline-start" /> Edit
            </Button>
          </ShoeDialog>
          <RetireButton shoe={shoe} />
        </div>
      </CardContent>
    </Card>
  );
}
