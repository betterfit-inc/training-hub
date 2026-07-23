import { redirect } from "next/navigation";

// Bikes moved into the consolidated /gear page (Bikes tab). Kept as a redirect so
// existing links/bookmarks still resolve.
export default function BikesPage() {
  redirect("/gear?tab=bikes");
}
