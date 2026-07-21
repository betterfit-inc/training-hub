"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { InboxIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "review-banner-dismissed";
const EVENT = "review-banner-change";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

export function ReviewBanner({ count }: { count: number }) {
  // sessionStorage keeps the dismissal for the browser session; the server
  // snapshot renders the banner so SSR and hydration stay consistent.
  const dismissedFor = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(KEY),
    () => null
  );

  if (count === 0 || dismissedFor === String(count)) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
      <InboxIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        You have <span className="font-semibold">{count}</span>{" "}
        {count === 1 ? "activity" : "activities"} waiting for review.
      </p>
      <Button asChild size="sm">
        <Link href="/review">Review now</Link>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem(KEY, String(count));
          window.dispatchEvent(new Event(EVENT));
        }}
      >
        <XIcon />
      </Button>
    </div>
  );
}
