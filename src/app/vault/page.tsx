import { redirect, RedirectType } from "next/navigation";
import {
  libraryHref,
  parseLibraryQuery,
  type LibraryParams,
} from "@/lib/library-navigation";

export const metadata = { title: "Purchases" };
export default async function Vault({
  searchParams,
}: {
  searchParams: Promise<LibraryParams>;
}) {
  const query = parseLibraryQuery(await searchParams);
  // Preserve malformed state for Home's explicit unsupported-filter message.
  if (!query.valid)
    redirect("/dashboard?source=unsupported", RedirectType.replace);
  redirect(libraryHref(query), RedirectType.replace);
}
