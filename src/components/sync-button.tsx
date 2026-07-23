"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-provider";
import { syncNowAction, type SyncActionResult } from "@/lib/actions";
import { fillStr, type Dict } from "@/lib/i18n";

function announce(result: SyncActionResult, manual: boolean, t: Dict) {
  if (!result.ok) {
    toast.error(result.error);
    return;
  }
  if (result.pendingNew > 0) {
    const noun = result.pendingNew === 1 ? t.words.activity : t.words.activities;
    toast.success(fillStr(t.toasts.newToReview, { n: result.pendingNew, noun }));
  } else if (result.imported > 0) {
    const noun = result.imported === 1 ? t.words.activity : t.words.activities;
    toast.success(fillStr(t.toasts.imported, { n: result.imported, noun }));
  } else if (manual) {
    toast.info(t.toasts.upToDate);
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
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await syncNowAction();
      announce(result, true, t);
      if (result.ok) router.refresh();
    });
  }

  const button = (
    <Button
      variant="outline"
      size={size}
      onClick={run}
      disabled={!connected || pending}
      aria-label={t.header.sync}
    >
      <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
      {pending ? t.header.syncing : t.header.sync}
    </Button>
  );

  if (connected) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent>{t.header.connectFirst}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Fires one background sync when the app loads and the last sync is stale. */
export function AutoSync() {
  const router = useRouter();
  const { t } = useI18n();
  const ran = useRef(false);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    syncNowAction().then((result) => {
      announce(result, false, tRef.current);
      if (result.ok && (result.imported > 0 || result.pendingNew > 0)) {
        router.refresh();
      }
    });
  }, [router]);

  return null;
}
