import { FootprintsIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ShoeCard } from "@/components/shoe-card";
import { ShoeDialog } from "@/components/shoe-dialog";
import { listShoes } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { isStravaConnected, tryFetchGear } from "@/lib/strava";
import { fmtKm } from "@/lib/format";

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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{t.shoesPage.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {shoes.length === 0 ? (
              t.shoesPage.empty
            ) : (
              <>
                {shoes.length} {t.nav.shoes.toLowerCase()}
                <span aria-hidden> · </span>
                <span className="font-mono tabular-nums">{fmtKm(totalKm, 0)}</span>{" "}
                {t.shoesPage.countSuffix}
              </>
            )}
          </p>
        </div>
        <ShoeDialog gearOptions={gear} connected={connected}>
          <Button>
            <PlusIcon data-icon="inline-start" /> {t.shoesPage.addShoe}
          </Button>
        </ShoeDialog>
      </div>

      {shoes.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={FootprintsIcon}
            title={t.shoesPage.firstShoeTitle}
            description={t.shoesPage.firstShoeBody}
          >
            <ShoeDialog gearOptions={gear} connected={connected}>
              <Button>
                <PlusIcon data-icon="inline-start" /> {t.shoesPage.addShoe}
              </Button>
            </ShoeDialog>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((shoe) => (
              <ShoeCard
                key={shoe.id}
                shoe={shoe}
                gearOptions={gear}
                gearName={
                  shoe.strava_gear_id ? (gearNameById.get(shoe.strava_gear_id) ?? null) : null
                }
                connected={connected}
                t={t}
              />
            ))}
          </div>

          {retired.length > 0 ? (
            <section className="mt-10">
              <h2 className="font-display text-lg font-semibold italic text-muted-foreground">
                {t.shoesPage.retiredSection}
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {retired.map((shoe) => (
                  <ShoeCard
                    key={shoe.id}
                    shoe={shoe}
                    gearOptions={gear}
                    gearName={
                      shoe.strava_gear_id ? (gearNameById.get(shoe.strava_gear_id) ?? null) : null
                    }
                    connected={connected}
                    t={t}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
