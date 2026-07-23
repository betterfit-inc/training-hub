"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { generateReadinessNarrativeAction } from "@/lib/actions";
import { fillStr } from "@/lib/i18n";
import { fmtDateLong, fmtTime } from "@/lib/format";

export interface ReadinessNarrativeData {
  generatedAt: string;
  text: string;
}

/**
 * The morning "how ready am I to train" coach read. Mirrors the weekly-digest
 * pattern: generate on demand, persist the latest, show when it was written.
 * Reads only the generic health model server-side, so it is source-agnostic.
 */
export function ReadinessCoach({
  narrative: initial,
  configured,
}: {
  narrative: ReadinessNarrativeData | null;
  configured: boolean;
}) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [narrative, setNarrative] = useState<ReadinessNarrativeData | null>(initial);
  const [pending, startTransition] = useTransition();

  if (!configured) {
    return <p className="text-sm text-muted-foreground/70">{t.health.coach.notConfigured}</p>;
  }

  function generate() {
    startTransition(async () => {
      const result = await generateReadinessNarrativeAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setNarrative({ generatedAt: result.generatedAt, text: result.text });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {narrative ? (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{narrative.text}</p>
          <p className="text-xs text-muted-foreground">
            {fillStr(t.health.coach.generatedAt, {
              date: fmtDateLong(narrative.generatedAt, lang),
              time: fmtTime(narrative.generatedAt),
            })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/70">{t.health.coach.empty}</p>
      )}
      <Button onClick={generate} disabled={pending}>
        {pending ? (
          <Loader2Icon className="animate-spin" data-icon="inline-start" />
        ) : (
          <SparklesIcon data-icon="inline-start" />
        )}
        {pending
          ? t.health.coach.loading
          : narrative
            ? t.health.coach.regenerate
            : t.health.coach.generate}
      </Button>
    </div>
  );
}
