import { redirect, RedirectType } from "next/navigation";
import {
  libraryHref,
  parseLibraryQuery,
  type LibraryParams,
} from "@/lib/library-navigation";

export const metadata = { title: "Documents" };
export default async function Documents({
  searchParams,
}: {
  searchParams: Promise<LibraryParams>;
}) {
  const query = parseLibraryQuery(await searchParams);
  if (!query.valid)
    redirect(
      "/purchases?view=documents&source=unsupported",
      RedirectType.replace,
    );
  redirect(
    libraryHref(query, { view: query.q ? "purchases" : "documents" }),
    RedirectType.replace,
  );
}
