import {
  ActivityIcon,
  BikeIcon,
  DumbbellIcon,
  FootprintsIcon,
  MountainIcon,
  WavesIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SportIcon({
  sport,
  className,
}: {
  sport: string | null | undefined;
  className?: string;
}) {
  const cls = cn("size-3.5 text-muted-foreground", className);
  const s = (sport ?? "").toLowerCase();

  if (s === "manual") return <WrenchIcon aria-hidden className={cls} />;
  if (s.includes("trail")) return <MountainIcon aria-hidden className={cls} />;
  if (s.includes("run") || s.includes("walk") || s.includes("hike")) {
    return <FootprintsIcon aria-hidden className={cls} />;
  }
  if (s.includes("ride") || s.includes("bike") || s.includes("velo")) {
    return <BikeIcon aria-hidden className={cls} />;
  }
  if (s.includes("swim")) return <WavesIcon aria-hidden className={cls} />;
  if (s.includes("weight") || s.includes("workout") || s.includes("crossfit")) {
    return <DumbbellIcon aria-hidden className={cls} />;
  }
  return <ActivityIcon aria-hidden className={cls} />;
}
