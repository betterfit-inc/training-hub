"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { generateWeeklyDigestAction } from "@/lib/actions";
import { fillStr } from "@/lib/i18n";
import { fmtDateLong, fmtTime } from "@/lib/format";

export interface WeeklyDigestData {
  generatedAt: string;
  text: string;
}

export function WeeklyDigest({
  digest: initial,
  configured,
}: {
  digest: WeeklyDigestData | null;
  configured: boolean;
}) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [digest, setDigest] = useState<WeeklyDigestData | null>(initial);
  const [pending, startTransition] = useTransition();

  if (!configured) {
    return <p className="text-sm text-muted-foreground/70">{t.coach.notConfigured}</p>;
  }

  function generate() {
    startTransition(async () => {
      const result = await generateWeeklyDigestAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDigest({ generatedAt: result.generatedAt, text: result.text });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {digest ? (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{digest.text}</p>
          <p className="text-xs text-muted-foreground">
            {fillStr(t.digest.generatedAt, {
              date: fmtDateLong(digest.generatedAt, lang),
              time: fmtTime(digest.generatedAt),
            })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/70">{t.digest.empty}</p>
      )}
      <Button onClick={generate} disabled={pending}>
        {pending ? (
          <Loader2Icon className="animate-spin" data-icon="inline-start" />
        ) : (
          <SparklesIcon data-icon="inline-start" />
        )}
        {pending ? t.digest.loading : digest ? t.digest.regenerate : t.digest.generate}
      </Button>
    </div>
  );
}
