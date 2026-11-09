import Purchases from "../purchases/page";
import type { LibraryParams } from "@/lib/library-navigation";

export const metadata = { title: "Documents · Your library" };

/** Canonical document library; the legacy Purchases view remains compatible. */
export default async function Documents({
  searchParams,
}: {
  searchParams?: Promise<LibraryParams>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <Purchases
      searchParams={Promise.resolve({ ...params, view: "documents" })}
    />
  );
}
