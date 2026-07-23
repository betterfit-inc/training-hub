import { ReviewFlow } from "@/components/review-flow";
import { listBikes, listPendingActivities, listShoes } from "@/lib/db";
import { toGearOption } from "@/lib/gear";
import { getDict } from "@/lib/lang";

export const metadata = { title: "Review" };

export default async function ReviewPage() {
  const { t } = await getDict();
  const items = await listPendingActivities();
  const shoes = (await listShoes()).map(toGearOption);
  const bikes = (await listBikes()).map(toGearOption);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="sr-only">{t.nav.review}</h1>
      <ReviewFlow items={items} shoes={shoes} bikes={bikes} />
    </div>
  );
}
