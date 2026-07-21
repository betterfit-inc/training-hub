import { ReviewFlow } from "@/components/review-flow";
import { listPendingActivities, listShoes } from "@/lib/db";
import type { ShoeOption } from "@/lib/types";

export const metadata = { title: "Review" };

export default function ReviewPage() {
  const items = listPendingActivities();
  const shoes: ShoeOption[] = listShoes().map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    retired: !!s.retired_at,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="sr-only">Review queue</h1>
      <ReviewFlow items={items} shoes={shoes} />
    </div>
  );
}
