"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { AutoSync, SyncButton } from "@/components/sync-button";
import { setLangAction } from "@/lib/actions";
import type { Lang } from "@/lib/i18n";

const NAV = [
  { href: "/", key: "log" },
  { href: "/insights", key: "insights" },
  { href: "/fitness", key: "fitness" },
  { href: "/races", key: "races" },
  { href: "/review", key: "review" },
  { href: "/shoes", key: "shoes" },
  { href: "/bikes", key: "bikes" },
  { href: "/settings", key: "settings" },
] as const;

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t.header.toggleTheme}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}

function LangToggle() {
  const { lang } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Lang) {
    if (next === lang || pending) return;
    startTransition(async () => {
      await setLangAction(next);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center rounded-lg border p-0.5">
      {(["en", "pt"] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => switchTo(code)}
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase transition-colors",
            lang === code
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

export function Header({
  pendingCount,
  connected,
  configured,
  autoSync,
}: {
  pendingCount: number;
  connected: boolean;
  configured: boolean;
  autoSync: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      {autoSync && configured ? <AutoSync /> : null}
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-1.5">
          <span className="font-display text-xl font-bold italic tracking-tight">
            Training Hub
          </span>
          <span aria-hidden className="mt-1.5 inline-block size-1.5 rounded-full bg-primary" />
        </Link>

        <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 text-sm">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
                  active && "bg-muted text-foreground"
                )}
              >
                {t.nav[item.key]}
                {item.href === "/review" && pendingCount > 0 ? (
                  <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10.5px] font-semibold leading-none text-primary-foreground">
                    {pendingCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SyncButton connected={connected} />
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
