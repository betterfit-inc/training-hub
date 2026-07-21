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
import { saveShoeAction, setShoeRetiredAction } from "@/lib/actions";
import { fmtKm } from "@/lib/format";
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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveShoeAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(shoe ? "Shoe updated" : "Shoe added");
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
          <DialogTitle>{shoe ? `Edit ${shoe.name}` : "Add a shoe"}</DialogTitle>
          <DialogDescription>
            {shoe
              ? "Update details, photo or Strava gear link."
              : "New shoes start at zero unless you give them a baseline."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          {shoe ? <input type="hidden" name="id" value={shoe.id} /> : null}

          <div className="space-y-1.5">
            <Label htmlFor="shoe-name">Name</Label>
            <Input
              id="shoe-name"
              name="name"
              required
              defaultValue={shoe?.name ?? ""}
              placeholder="ASICS Superblast 3"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shoe-role">Role</Label>
            <Input
              id="shoe-role"
              name="role"
              defaultValue={shoe?.role ?? ""}
              placeholder="easy runs, long runs..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shoe-initial">Baseline km</Label>
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
              <Label htmlFor="shoe-retirement">Retire at (km)</Label>
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
            <Label htmlFor="shoe-photo">Photo</Label>
            <Input id="shoe-photo" name="photo" type="file" accept="image/*" />
            {shoe?.photo_path ? (
              <p className="text-xs text-muted-foreground">
                Leave empty to keep the current photo.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shoe-gear">Strava gear</Label>
            {gearList.length > 0 ? (
              <Select name="strava_gear_id" defaultValue={shoe?.strava_gear_id ?? "none"}>
                <SelectTrigger id="shoe-gear" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
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
                {connected
                  ? "Could not load your gear list from Strava right now."
                  : "Connect Strava in Settings to link this shoe to its gear, so synced runs match it automatically."}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
              {shoe ? "Save changes" : "Add shoe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RetireButton({ shoe }: { shoe: Shoe }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const retired = !!shoe.retired_at;

  function toggle() {
    startTransition(async () => {
      const result = await setShoeRetiredAction(shoe.id, !retired);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(retired ? `${shoe.name} is back in rotation` : `${shoe.name} retired`);
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
      {retired ? "Unretire" : "Retire"}
    </Button>
  );
}
