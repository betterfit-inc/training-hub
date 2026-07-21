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
import {
  createManualActivityAction,
  disconnectStravaAction,
  setShoeGearAction,
} from "@/lib/actions";
import { fmtKm, localDateInputValue } from "@/lib/format";
import type { ShoeOption, StravaGear } from "@/lib/types";

export function DisconnectButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function disconnect() {
    startTransition(async () => {
      const result = await disconnectStravaAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Strava disconnected");
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
      Disconnect
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

  function link(shoeId: number, value: string) {
    const gearId = value === "none" ? null : value;
    setShoeGearAction(shoeId, gearId).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(gearId ? "Gear linked" : "Gear unlinked");
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
              <p className="truncate font-display text-xs text-muted-foreground italic">
                {shoe.role}
              </p>
            ) : null}
          </div>
          <Select
            value={shoe.gearId ?? "none"}
            onValueChange={(value) => link(shoe.id, value)}
          >
            <SelectTrigger size="sm" className="w-52 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not linked</SelectItem>
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
  const [date, setDate] = useState(() => localDateInputValue());
  const [km, setKm] = useState("");
  const [shoeId, setShoeId] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const kmValue = parseFloat(km);
    if (!shoeId) {
      toast.error("Pick a shoe.");
      return;
    }
    if (!Number.isFinite(kmValue) || kmValue === 0) {
      toast.error("Distance cannot be zero.");
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
      const shoeName = shoes.find((s) => s.id === Number(shoeId))?.name ?? "shoe";
      toast.success(`${kmValue > 0 ? "Added" : "Removed"} ${fmtKm(Math.abs(kmValue))} ${kmValue > 0 ? "to" : "from"} ${shoeName}`);
      setKm("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="manual-date">Date</Label>
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
        <Label htmlFor="manual-km">Distance (km)</Label>
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
        <Label htmlFor="manual-shoe">Shoe</Label>
        <Select value={shoeId} onValueChange={setShoeId}>
          <SelectTrigger id="manual-shoe" className="w-56">
            <SelectValue placeholder="Pick a shoe" />
          </SelectTrigger>
          <SelectContent>
            {shoes.map((shoe) => (
              <SelectItem key={shoe.id} value={String(shoe.id)}>
                <span className="truncate">{shoe.name}</span>
                {shoe.retired ? (
                  <span className="text-xs text-muted-foreground">· retired</span>
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
        Add entry
      </Button>
    </form>
  );
}
