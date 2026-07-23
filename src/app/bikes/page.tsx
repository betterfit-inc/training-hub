import { BikeIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GearCollection } from "@/components/gear-collection";
import { GearDialog } from "@/components/gear-dialog";
import { BikeCard } from "@/components/bike-card";
import { listBikes } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { isStravaConnected, tryFetchBikes } from "@/lib/strava";
import { fmtKm } from "@/lib/format";
import type { BikeWithMileage } from "@/lib/types";

export const metadata = { title: "Bikes" };

export default async function BikesPage() {
  const { t } = await getDict();
  const bikes = await listBikes();
  const connected = await isStravaConnected();
  const gear = await tryFetchBikes();
  const gearNameById = new Map((gear ?? []).map((g) => [g.id, g.name]));

  const active = bikes.filter((b) => !b.retired_at);
  const retired = bikes.filter((b) => b.retired_at);
  const totalKm = bikes.reduce((acc, b) => acc + b.current_km, 0);

  const addTrigger = (
    <GearDialog kind="bike" gearOptions={gear} connected={connected}>
      <Button>
        <PlusIcon data-icon="inline-start" /> {t.bikesPage.addBike}
      </Button>
    </GearDialog>
  );

  const renderCard = (bike: BikeWithMileage) => (
    <BikeCard
      key={bike.id}
      bike={bike}
      gearOptions={gear}
      gearName={bike.strava_gear_id ? (gearNameById.get(bike.strava_gear_id) ?? null) : null}
      connected={connected}
      t={t}
    />
  );

  return (
    <GearCollection
      title={t.bikesPage.title}
      summary={
        bikes.length === 0 ? (
          t.bikesPage.empty
        ) : (
          <>
            {bikes.length} {t.nav.bikes.toLowerCase()}
            <span aria-hidden> · </span>
            <span className="font-mono tabular-nums">{fmtKm(totalKm, 0)}</span>{" "}
            {t.bikesPage.countSuffix}
          </>
        )
      }
      addTrigger={addTrigger}
      empty={
        bikes.length === 0
          ? {
              icon: BikeIcon,
              title: t.bikesPage.firstBikeTitle,
              body: t.bikesPage.firstBikeBody,
              action: addTrigger,
            }
          : null
      }
      active={active.map(renderCard)}
      retired={
        retired.length > 0
          ? { label: t.bikesPage.retiredSection, cards: retired.map(renderCard) }
          : null
      }
    />
  );
}
