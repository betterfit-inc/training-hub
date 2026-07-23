"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GearSelectItem } from "@/components/gear-select-item";
import { useI18n } from "@/components/i18n-provider";
import { saveBikeAction, setBikeRetiredAction } from "@/lib/actions";
import { NONE } from "@/lib/constants";
import { fillStr } from "@/lib/i18n";
import type { Bike, StravaGear } from "@/lib/types";

export function BikeDialog({
  bike,
  gearOptions,
  connected,
  children,
}: {
  bike?: Bike;
  gearOptions: StravaGear[] | null;
  connected: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveBikeAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(bike ? t.toasts.bikeUpdated : t.toasts.bikeAdded);
      setOpen(false);
      router.refresh();
    });
  }

  const gearList = gearOptions ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {bike ? fillStr(t.bikeDialog.editTitle, { name: bike.name }) : t.bikeDialog.addTitle}
          </DialogTitle>
          <DialogDescription>
            {bike ? t.bikeDialog.editBody : t.bikeDialog.addBody}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {bike ? <input type="hidden" name="id" value={bike.id} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor="bike-name">{t.bikeDialog.name}</Label>
            <Input
              id="bike-name"
              name="name"
              required
              defaultValue={bike?.name ?? ""}
              placeholder="TSW TR10 One"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bike-role">{t.bikeDialog.role}</Label>
            <Input
              id="bike-role"
              name="role"
              defaultValue={bike?.role ?? ""}
              placeholder={t.bikeDialog.rolePlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bike-initial">{t.bikeDialog.baseline}</Label>
            <Input
              id="bike-initial"
              name="initial_km"
              type="number"
              step="1"
              min="0"
              defaultValue={bike?.initial_km ?? 0}
              className="font-mono tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bike-photo">{t.bikeDialog.photo}</Label>
            <Input id="bike-photo" name="photo" type="file" accept="image/*" />
            {bike?.photo_path ? (
              <p className="text-xs text-muted-foreground">{t.bikeDialog.keepPhoto}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bike-gear">{t.bikeDialog.gear}</Label>
            {gearList.length > 0 ? (
              <Select name="strava_gear_id" defaultValue={bike?.strava_gear_id ?? NONE}>
                <SelectTrigger id="bike-gear" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t.bikeDialog.notLinked}</SelectItem>
                  {gearList.map((gear) => (
                    <GearSelectItem key={gear.id} gear={gear} />
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {connected ? t.bikeDialog.gearUnavailable : t.bikeDialog.gearConnectHint}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {bike ? t.bikeDialog.save : t.bikeDialog.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RetireBikeButton({ bike }: { bike: Bike }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const retired = !!bike.retired_at;

  function toggle() {
    startTransition(async () => {
      const result = await setBikeRetiredAction(bike.id, !retired);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        fillStr(retired ? t.toasts.backInRotation : t.toasts.retired, { name: bike.name })
      );
      router.refresh();
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} disabled={pending}>
      {retired ? (
        <ArchiveRestoreIcon data-icon="inline-start" />
      ) : (
        <ArchiveIcon data-icon="inline-start" />
      )}
      {retired ? t.bikesPage.unretire : t.bikesPage.retire}
    </Button>
  );
}
