import { redirect } from "next/navigation";

// Shoes moved into the consolidated /gear page (Shoes tab). Kept as a redirect so
// existing links/bookmarks still resolve.
export default function ShoesPage() {
  redirect("/gear");
}
