import { FootprintsIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GearCollection } from "@/components/gear-collection";
import { GearDialog } from "@/components/gear-dialog";
import { ShoeCard } from "@/components/shoe-card";
import { listShoes } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { isStravaConnected, tryFetchGear } from "@/lib/strava";
import { fmtKm } from "@/lib/format";
import type { ShoeWithMileage } from "@/lib/types";

export const metadata = { title: "Shoes" };

export default async function ShoesPage() {
  const { t } = await getDict();
  const shoes = await listShoes();
  const connected = await isStravaConnected();
  const gear = await tryFetchGear();
  const gearNameById = new Map((gear ?? []).map((g) => [g.id, g.name]));

  const active = shoes.filter((s) => !s.retired_at);
  const retired = shoes.filter((s) => s.retired_at);
  const totalKm = shoes.reduce((acc, s) => acc + s.current_km, 0);

  const addTrigger = (
    <GearDialog kind="shoe" gearOptions={gear} connected={connected}>
      <Button>
        <PlusIcon data-icon="inline-start" /> {t.shoesPage.addShoe}
      </Button>
    </GearDialog>
  );

  const renderCard = (shoe: ShoeWithMileage) => (
    <ShoeCard
      key={shoe.id}
      shoe={shoe}
      gearOptions={gear}
      gearName={shoe.strava_gear_id ? (gearNameById.get(shoe.strava_gear_id) ?? null) : null}
      connected={connected}
      t={t}
    />
  );

  return (
    <GearCollection
      title={t.shoesPage.title}
      summary={
        shoes.length === 0 ? (
          t.shoesPage.empty
        ) : (
          <>
            {shoes.length} {t.nav.shoes.toLowerCase()}
            <span aria-hidden> · </span>
            <span className="font-mono tabular-nums">{fmtKm(totalKm, 0)}</span>{" "}
            {t.shoesPage.countSuffix}
          </>
        )
      }
      addTrigger={addTrigger}
      empty={
        shoes.length === 0
          ? {
              icon: FootprintsIcon,
              title: t.shoesPage.firstShoeTitle,
              body: t.shoesPage.firstShoeBody,
              action: addTrigger,
            }
          : null
      }
      active={active.map(renderCard)}
      retired={
        retired.length > 0
          ? { label: t.shoesPage.retiredSection, cards: retired.map(renderCard) }
          : null
      }
    />
  );
}
