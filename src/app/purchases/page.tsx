import { getSavedRecordsData } from "@/lib/demo/repository";
import { Shell } from "@/components/shell";
import { LibrarySearch, LibraryResults } from "@/components/home-library";
import { NorthCollection } from "@/components/careos/integrated";
import { homeLibrary } from "@/lib/demo/library";
import {
  parseLibraryQuery,
  type LibraryParams,
} from "@/lib/library-navigation";

export const metadata = { title: "Purchases · Your library" };
export default async function Purchases({
  searchParams,
}: {
  searchParams?: Promise<LibraryParams>;
}) {
  const data = await getSavedRecordsData();
  const query = parseLibraryQuery((await searchParams) ?? {});
  const library = homeLibrary(data, query);
  const searchIndex = library.searchIndex;
  return (
    <Shell
      active={query.view === "documents" ? "/documents" : "/purchases"}
      source={data.source}
    >
      <NorthCollection>
        <div className="mb-5 max-w-3xl sm:mb-7">
          <h1 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight">
            {query.view === "documents" ? "Your documents" : "Your products"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {query.view === "documents"
              ? "Find receipts and other saved documents by purchase and date."
              : "Everything you own, all cared for."}
          </p>
        </div>
      </NorthCollection>
      <LibrarySearch
        query={query}
        categories={library.categories}
        searchIndex={searchIndex}
        purchases={library.allPurchases}
      />
      <NorthCollection>
        <LibraryResults library={library} query={query} />
      </NorthCollection>
    </Shell>
  );
}
