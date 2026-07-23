"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/components/i18n-provider";
import {
  createManualActivityAction,
  disconnectStravaAction,
  setBikeGearAction,
  setShoeGearAction,
} from "@/lib/actions";
import { NONE } from "@/lib/constants";
import { fmtKm, localDateInputValue } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import type { BikeOption, ShoeOption, StravaGear } from "@/lib/types";

export function DisconnectButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  function disconnect() {
    startTransition(async () => {
      const result = await disconnectStravaAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.toasts.disconnected);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={disconnect} disabled={pending}>
      {pending ? (
        <Loader2Icon className="animate-spin" data-icon="inline-start" />
      ) : (
        <UnplugIcon data-icon="inline-start" />
      )}
      {t.settingsPage.disconnect}
    </Button>
  );
}

export function GearMatcher({
  shoes,
  gear,
}: {
  shoes: Array<ShoeOption & { gearId: string | null }>;
  gear: StravaGear[];
}) {
  const router = useRouter();
  const { t } = useI18n();

  function link(shoeId: number, value: string) {
    const gearId = value === NONE ? null : value;
    setShoeGearAction(shoeId, gearId).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(gearId ? t.toasts.gearLinked : t.toasts.gearUnlinked);
      router.refresh();
    });
  }

  return (
    <ul className="space-y-2.5">
      {shoes.map((shoe) => (
        <li key={shoe.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{shoe.name}</p>
            {shoe.role ? (
              <p className="truncate text-xs text-muted-foreground italic">{shoe.role}</p>
            ) : null}
          </div>
          <Select value={shoe.gearId ?? NONE} onValueChange={(value) => link(shoe.id, value)}>
            <SelectTrigger size="sm" className="w-52 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t.settingsPage.notLinked}</SelectItem>
              {gear.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="truncate">{g.name}</span>
                  {g.distance ? (
                    <span className="text-xs text-muted-foreground">
                      · {fmtKm(g.distance / 1000, 0)}
                    </span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  );
}

export function BikeMatcher({
  bikes,
  gear,
}: {
  bikes: Array<BikeOption & { gearId: string | null }>;
  gear: StravaGear[];
}) {
  const router = useRouter();
  const { t } = useI18n();

  function link(bikeId: number, value: string) {
    const gearId = value === NONE ? null : value;
    setBikeGearAction(bikeId, gearId).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(gearId ? t.toasts.gearLinked : t.toasts.gearUnlinked);
      router.refresh();
    });
  }

  return (
    <ul className="space-y-2.5">
      {bikes.map((bike) => (
        <li key={bike.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{bike.name}</p>
            {bike.role ? (
              <p className="truncate text-xs text-muted-foreground italic">{bike.role}</p>
            ) : null}
          </div>
          <Select value={bike.gearId ?? NONE} onValueChange={(value) => link(bike.id, value)}>
            <SelectTrigger size="sm" className="w-52 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t.settingsPage.notLinked}</SelectItem>
              {gear.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  <span className="truncate">{g.name}</span>
                  {g.distance ? (
                    <span className="text-xs text-muted-foreground">
                      · {fmtKm(g.distance / 1000, 0)}
                    </span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  );
}

export function ManualActivityForm({ shoes }: { shoes: ShoeOption[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [date, setDate] = useState(() => localDateInputValue());
  const [km, setKm] = useState("");
  const [shoeId, setShoeId] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const kmValue = parseFloat(km);
    if (!shoeId) {
      toast.error(t.toasts.pickShoe);
      return;
    }
    if (!Number.isFinite(kmValue) || kmValue === 0) {
      toast.error(t.toasts.zeroDistance);
      return;
    }
    startTransition(async () => {
      const result = await createManualActivityAction({
        date,
        km: kmValue,
        shoeId: Number(shoeId),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const shoeName = shoes.find((s) => s.id === Number(shoeId))?.name ?? "";
      toast.success(
        fillStr(kmValue > 0 ? t.toasts.manualAdded : t.toasts.manualRemoved, {
          km: fmtKm(Math.abs(kmValue)),
          name: shoeName,
        })
      );
      setKm("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="manual-date">{t.settingsPage.date}</Label>
        <Input
          id="manual-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-38 font-mono tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="manual-km">{t.settingsPage.distanceKm}</Label>
        <Input
          id="manual-km"
          type="number"
          step="0.1"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          placeholder="8.0"
          required
          className="w-28 text-right font-mono tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="manual-shoe">{t.settingsPage.shoe}</Label>
        <Select value={shoeId} onValueChange={setShoeId}>
          <SelectTrigger id="manual-shoe" className="w-56">
            <SelectValue placeholder={t.splits.pickShoe} />
          </SelectTrigger>
          <SelectContent>
            {shoes.map((shoe) => (
              <SelectItem key={shoe.id} value={String(shoe.id)}>
                <span className="truncate">{shoe.name}</span>
                {shoe.retired ? (
                  <span className="text-xs text-muted-foreground">· {t.splits.retiredTag}</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2Icon className="animate-spin" data-icon="inline-start" />
        ) : (
          <PlusIcon data-icon="inline-start" />
        )}
        {t.settingsPage.addEntry}
      </Button>
    </form>
  );
}
