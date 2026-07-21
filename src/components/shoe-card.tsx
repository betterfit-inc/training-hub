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
import { fillStr, type Dict } from "@/lib/i18n";
import { photoSrc } from "@/lib/storage";
import type { ShoeWithMileage, StravaGear, WearStatus } from "@/lib/types";

const STATUS_META: Record<WearStatus, { icon: LucideIcon; className: string }> = {
  fresh: { icon: SparklesIcon, className: "text-positive" },
  worn: { icon: TrendingDownIcon, className: "text-wear-worn" },
  critical: { icon: TriangleAlertIcon, className: "text-wear-critical" },
  retired: { icon: ArchiveIcon, className: "text-muted-foreground" },
};

export function ShoeCard({
  shoe,
  gearOptions,
  gearName,
  connected,
  t,
}: {
  shoe: ShoeWithMileage;
  gearOptions: StravaGear[] | null;
  gearName: string | null;
  connected: boolean;
  t: Dict;
}) {
  const status = wearStatus(shoe);
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  const cap = shoe.retirement_km && shoe.retirement_km > 0 ? shoe.retirement_km : 700;
  const overCap = shoe.current_km - cap;
  const retired = status === "retired";
  const photo = photoSrc(shoe.photo_path);

  return (
    <Card className={cn("pt-0", retired && "opacity-80")}>
      <div
        className={cn(
          "relative flex h-44 items-center justify-center overflow-hidden border-b",
          photo ? "bg-white" : "bg-gradient-to-br from-accent via-muted to-background",
          retired && "grayscale"
        )}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={shoe.name}
            className="size-full object-contain p-4 mix-blend-multiply transition-transform duration-300 group-hover/card:scale-[1.04]"
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
          {t.wear[status]}
        </span>
      </div>

      <CardContent className="space-y-3">
        <div>
          <h3 className="truncate text-[15px] font-medium" title={shoe.name}>
            {shoe.name}
          </h3>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground italic">
            {shoe.role ?? t.shoesPage.noRole}
          </p>
        </div>

        <WearBar currentKm={shoe.current_km} retirementKm={shoe.retirement_km} status={status} />

        <div className="flex items-baseline justify-between gap-2 font-mono text-xs tabular-nums">
          <span>
            <span className="text-sm font-semibold">{shoe.current_km.toFixed(1)}</span>
            <span className="text-muted-foreground"> / {Math.round(cap)} km</span>
          </span>
          {overCap > 0 ? (
            <span className="text-wear-critical">
              {fillStr(t.shoesPage.kmOver, { km: fmtKm(overCap, 0) })}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {fillStr(t.shoesPage.kmLeft, { km: fmtKm(cap - shoe.current_km, 0) })}
            </span>
          )}
        </div>

        {gearName ? (
          <p className="truncate text-xs text-muted-foreground">
            {fillStr(t.shoesPage.gearLabel, { name: gearName })}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3">
          <ShoeDialog shoe={shoe} gearOptions={gearOptions} connected={connected}>
            <Button variant="outline" size="sm">
              <PencilIcon data-icon="inline-start" /> {t.shoesPage.edit}
            </Button>
          </ShoeDialog>
          <RetireButton shoe={shoe} />
        </div>
      </CardContent>
    </Card>
  );
}
