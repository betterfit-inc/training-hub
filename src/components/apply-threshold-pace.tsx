"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { saveThresholdsAction } from "@/lib/actions";
import type { AthleteThresholds } from "@/lib/fitness";

/**
 * Explicit, user-initiated apply of the Critical Speed threshold-pace SUGGESTION
 * to the athlete's stored thresholds. Nothing here runs automatically: it posts
 * only on click, and it reuses the existing `saveThresholdsAction` save path
 * (which re-validates ranges and refreshes the fitness curves), carrying every
 * current threshold value unchanged except the threshold pace.
 */
export function ApplyThresholdPaceButton({
  thresholds,
  suggestedPaceSPerKm,
}: {
  thresholds: AthleteThresholds;
  suggestedPaceSPerKm: number;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  function apply() {
    startTransition(async () => {
      const result = await saveThresholdsAction({
        maxHr: thresholds.maxHr,
        restingHr: thresholds.restingHr,
        lthr: thresholds.lthr,
        thresholdPaceSPerKm: Math.round(suggestedPaceSPerKm),
        ftpW: thresholds.ftpW,
        restingHrEstimated: thresholds.restingHrEstimated,
        ftpProvisional: thresholds.ftpProvisional,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.performance.applied);
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={apply} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
      {t.performance.apply}
    </Button>
  );
}
