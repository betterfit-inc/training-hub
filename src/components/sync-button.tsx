"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { syncNowAction, type SyncActionResult } from "@/lib/actions";

function announce(result: SyncActionResult, manual: boolean) {
  if (!result.ok) {
    toast.error(result.error);
    return;
  }
  if (result.pendingNew > 0) {
    const noun = result.pendingNew === 1 ? "new activity" : "new activities";
    toast.success(`${result.pendingNew} ${noun} to review`);
  } else if (result.imported > 0) {
    toast.success(`Imported ${result.imported} historical ${result.imported === 1 ? "activity" : "activities"}`);
  } else if (manual) {
    toast.info("Up to date. No new activities.");
  }
}

export function SyncButton({
  connected,
  size = "sm",
}: {
  connected: boolean;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await syncNowAction();
      announce(result, true);
      if (result.ok) router.refresh();
    });
  }

  const button = (
    <Button
      variant="outline"
      size={size}
      onClick={run}
      disabled={!connected || pending}
      aria-label="Sync activities from Strava"
    >
      <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
      {pending ? "Syncing" : "Sync"}
    </Button>
  );

  if (connected) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>Connect Strava in Settings first</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Fires one background sync when the app loads and the last sync is stale. */
export function AutoSync() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncNowAction().then((result) => {
      announce(result, false);
      if (result.ok && (result.imported > 0 || result.pendingNew > 0)) {
        router.refresh();
      }
    });
  }, [router]);

  return null;
}
