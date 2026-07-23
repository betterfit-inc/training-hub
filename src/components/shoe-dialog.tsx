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
import { useI18n } from "@/components/i18n-provider";
import { saveShoeAction, setShoeRetiredAction } from "@/lib/actions";
import { NONE } from "@/lib/constants";
import { fmtKm } from "@/lib/format";
import { fillStr } from "@/lib/i18n";
import type { Shoe, StravaGear } from "@/lib/types";

export function ShoeDialog({
  shoe,
  gearOptions,
  connected,
  children,
}: {
  shoe?: Shoe;
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
      const result = await saveShoeAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(shoe ? t.toasts.shoeUpdated : t.toasts.shoeAdded);
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
            {shoe ? fillStr(t.shoeDialog.editTitle, { name: shoe.name }) : t.shoeDialog.addTitle}
          </DialogTitle>
          <DialogDescription>
            {shoe ? t.shoeDialog.editBody : t.shoeDialog.addBody}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {shoe ? <input type="hidden" name="id" value={shoe.id} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor="shoe-name">{t.shoeDialog.name}</Label>
            <Input
              id="shoe-name"
              name="name"
              required
              defaultValue={shoe?.name ?? ""}
              placeholder="ASICS Superblast 3"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shoe-role">{t.shoeDialog.role}</Label>
            <Input
              id="shoe-role"
              name="role"
              defaultValue={shoe?.role ?? ""}
              placeholder={t.shoeDialog.rolePlaceholder}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shoe-initial">{t.shoeDialog.baseline}</Label>
              <Input
                id="shoe-initial"
                name="initial_km"
                type="number"
                step="0.1"
                min="0"
                defaultValue={shoe?.initial_km ?? 0}
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shoe-retirement">{t.shoeDialog.retireAt}</Label>
              <Input
                id="shoe-retirement"
                name="retirement_km"
                type="number"
                step="10"
                min="1"
                defaultValue={shoe?.retirement_km ?? 700}
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shoe-photo">{t.shoeDialog.photo}</Label>
            <Input id="shoe-photo" name="photo" type="file" accept="image/*" />
            {shoe?.photo_path ? (
              <p className="text-xs text-muted-foreground">{t.shoeDialog.keepPhoto}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shoe-gear">{t.shoeDialog.gear}</Label>
            {gearList.length > 0 ? (
              <Select name="strava_gear_id" defaultValue={shoe?.strava_gear_id ?? NONE}>
                <SelectTrigger id="shoe-gear" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t.shoeDialog.notLinked}</SelectItem>
                  {gearList.map((gear) => (
                    <SelectItem key={gear.id} value={gear.id}>
                      <span className="truncate">{gear.name}</span>
                      {gear.distance ? (
                        <span className="text-xs text-muted-foreground">
                          · {fmtKm(gear.distance / 1000, 0)}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {connected ? t.shoeDialog.gearUnavailable : t.shoeDialog.gearConnectHint}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {shoe ? t.shoeDialog.save : t.shoeDialog.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RetireButton({ shoe }: { shoe: Shoe }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const retired = !!shoe.retired_at;

  function toggle() {
    startTransition(async () => {
      const result = await setShoeRetiredAction(shoe.id, !retired);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        fillStr(retired ? t.toasts.backInRotation : t.toasts.retired, { name: shoe.name })
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
      {retired ? t.shoesPage.unretire : t.shoesPage.retire}
    </Button>
  );
}
