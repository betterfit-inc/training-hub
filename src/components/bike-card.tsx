import { BikeIcon, HomeIcon, MountainIcon, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BikeDialog, RetireBikeButton } from "@/components/bike-dialog";
import { fmtKm } from "@/lib/format";
import { fillStr, type Dict } from "@/lib/i18n";
import { photoSrc } from "@/lib/storage";
import type { BikeWithMileage, StravaGear } from "@/lib/types";

/** Share of a bike's distance done indoors, as a single split bar. */
function IndoorOutdoorBar({ indoor, outdoor }: { indoor: number; outdoor: number }) {
  const total = indoor + outdoor;
  if (total <= 0) {
    return <div className="h-2 rounded-full bg-border" />;
  }
  const indoorPct = Math.round((indoor / total) * 100);
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-border">
      <div className="bg-chart-2" style={{ width: `${indoorPct}%` }} />
      <div className="flex-1 bg-primary" />
    </div>
  );
}

export function BikeCard({
  bike,
  gearOptions,
  gearName,
  connected,
  t,
}: {
  bike: BikeWithMileage;
  gearOptions: StravaGear[] | null;
  gearName: string | null;
  connected: boolean;
  t: Dict;
}) {
  const retired = !!bike.retired_at;
  const photo = photoSrc(bike.photo_path);
  const mountain = (bike.role ?? "").toLowerCase().includes("mount");
  const RoleIcon = mountain ? MountainIcon : BikeIcon;
  const hasBreakdown = bike.indoor_km > 0.05 || bike.outdoor_km > 0.05;

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
            alt={bike.name}
            className="size-full object-contain p-4 mix-blend-multiply transition-transform duration-300 group-hover/card:scale-[1.04]"
          />
        ) : (
          <RoleIcon className="size-10 text-primary/25" aria-hidden />
        )}
      </div>

      <CardContent className="space-y-3">
        <div>
          <h3 className="truncate text-[15px] font-medium" title={bike.name}>
            {bike.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted-foreground italic">
            <RoleIcon className="size-3.5 shrink-0" aria-hidden />
            {bike.role ?? t.bikesPage.noRole}
          </p>
        </div>

        <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
          <span className="text-2xl font-semibold">{bike.current_km.toFixed(0)}</span>
          <span className="text-xs text-muted-foreground">
            {fillStr(t.bikesPage.rides, { n: bike.ride_count })}
          </span>
        </div>

        <IndoorOutdoorBar indoor={bike.indoor_km} outdoor={bike.outdoor_km} />
        {hasBreakdown ? (
          <div className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <HomeIcon className="size-3 text-chart-2" aria-hidden />
              {fmtKm(bike.indoor_km, 0)} {t.detail.indoor.toLowerCase()}
            </span>
            <span className="inline-flex items-center gap-1">
              <BikeIcon className="size-3 text-primary" aria-hidden />
              {fmtKm(bike.outdoor_km, 0)} {t.detail.outdoor.toLowerCase()}
            </span>
          </div>
        ) : null}

        {gearName ? (
          <p className="truncate text-xs text-muted-foreground">
            {fillStr(t.bikesPage.gearLabel, { name: gearName })}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3">
          <BikeDialog bike={bike} gearOptions={gearOptions} connected={connected}>
            <Button variant="outline" size="sm">
              <PencilIcon data-icon="inline-start" /> {t.bikesPage.edit}
            </Button>
          </BikeDialog>
          <RetireBikeButton bike={bike} />
        </div>
      </CardContent>
    </Card>
  );
}
