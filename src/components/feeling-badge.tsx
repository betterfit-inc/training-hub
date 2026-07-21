import { cn } from "@/lib/utils";
import { feelingMeta } from "@/lib/feelings";
import type { Feeling } from "@/lib/types";

export function FeelingBadge({
  feeling,
  label,
  className,
}: {
  feeling: Feeling;
  label: string;
  className?: string;
}) {
  const meta = feelingMeta(feeling);
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.badgeClass,
        className
      )}
    >
      <span aria-hidden>{meta.emoji}</span>
      {label}
    </span>
  );
}
