import { getSavedRecordsData } from "@/lib/demo/repository";
import { Shell } from "@/components/shell";
import Link from "next/link";
import { Package, Files } from "lucide-react";
import { LibrarySearch, LibraryResults } from "@/components/home-library";
import { NorthCollection } from "@/components/careos/integrated";
import { homeLibrary } from "@/lib/demo/library";
import {
  parseLibraryQuery,
  libraryHref,
  type LibraryParams,
} from "@/lib/library-navigation";

export const metadata = { title: "Purchases & Docs · Your library" };
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
        <nav
          aria-label="Purchases and documents"
          className="mb-1 grid w-full max-w-lg grid-cols-2 gap-2 rounded-2xl border bg-muted/40 p-1 sm:mb-6 sm:p-2"
        >
          {(
            [
              ["purchases", "Purchases", Package],
              ["documents", "Documents", Files],
            ] as const
          ).map(([view, label, Icon]) => (
            <Link
              key={view}
              href={libraryHref(query, { view, page: 1 })}
              aria-current={query.view === view ? "page" : undefined}
              className={`inline-flex min-h-14 min-w-0 flex-wrap items-center justify-center gap-2 rounded-xl px-3 py-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${query.view === view ? "bg-secondary text-secondary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mb-1 max-w-3xl sm:mb-7">
          <h1 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight">
            {query.view === "documents" ? "Your documents" : "Your products"}
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground sm:mt-2">
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
