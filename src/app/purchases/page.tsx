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
    <Shell active="/purchases" source={data.source}>
      <NorthCollection>
        <div className="mb-5 max-w-3xl sm:mb-7">
          <h1 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight">
            Your products
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Everything you own, all cared for.
          </p>
        </div>
      </NorthCollection>
      <LibrarySearch
        query={query}
        categories={library.categories}
        searchIndex={searchIndex}
      />
      <NorthCollection>
        <LibraryResults library={library} query={query} />
      </NorthCollection>
    </Shell>
  );
}
