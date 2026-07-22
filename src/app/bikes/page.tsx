import { BikeIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { BikeCard } from "@/components/bike-card";
import { BikeDialog } from "@/components/bike-dialog";
import { listBikes } from "@/lib/db";
import { getDict } from "@/lib/lang";
import { isStravaConnected, tryFetchBikes } from "@/lib/strava";
import { fmtKm } from "@/lib/format";

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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{t.bikesPage.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bikes.length === 0 ? (
              t.bikesPage.empty
            ) : (
              <>
                {bikes.length} {t.nav.bikes.toLowerCase()}
                <span aria-hidden> · </span>
                <span className="font-mono tabular-nums">{fmtKm(totalKm, 0)}</span>{" "}
                {t.bikesPage.countSuffix}
              </>
            )}
          </p>
        </div>
        <BikeDialog gearOptions={gear} connected={connected}>
          <Button>
            <PlusIcon data-icon="inline-start" /> {t.bikesPage.addBike}
          </Button>
        </BikeDialog>
      </div>

      {bikes.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={BikeIcon}
            title={t.bikesPage.firstBikeTitle}
            description={t.bikesPage.firstBikeBody}
          >
            <BikeDialog gearOptions={gear} connected={connected}>
              <Button>
                <PlusIcon data-icon="inline-start" /> {t.bikesPage.addBike}
              </Button>
            </BikeDialog>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((bike) => (
              <BikeCard
                key={bike.id}
                bike={bike}
                gearOptions={gear}
                gearName={
                  bike.strava_gear_id ? gearNameById.get(bike.strava_gear_id) ?? null : null
                }
                connected={connected}
                t={t}
              />
            ))}
          </div>

          {retired.length > 0 ? (
            <section className="mt-10">
              <h2 className="font-display text-lg font-semibold italic text-muted-foreground">
                {t.bikesPage.retiredSection}
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {retired.map((bike) => (
                  <BikeCard
                    key={bike.id}
                    bike={bike}
                    gearOptions={gear}
                    gearName={
                      bike.strava_gear_id ? gearNameById.get(bike.strava_gear_id) ?? null : null
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
