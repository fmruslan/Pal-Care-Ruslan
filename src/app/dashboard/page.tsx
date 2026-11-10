import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { CareCalendarPanel } from "@/components/care/calendar";
import { careCalendar, demoCareCalendar } from "@/lib/care/calendar";
import { studioEvaluationAllowed } from "@/lib/intelligence/access";
import { Shell } from "@/components/shell";
import { NorthCollection, NorthSearch } from "@/components/careos/integrated";
import { CareFeedView, CareFilters } from "@/components/care/feed";
import {
  CareAttention,
  CareHelpShortcuts,
  HowPalCareWorks,
} from "@/components/care/home-help";
import { getCareFeed } from "@/lib/care/repository";
import { parseCareFilter } from "@/lib/care/summary";
import {
  libraryHref,
  parseLibraryQuery,
  type LibraryParams,
} from "@/lib/library-navigation";

export const metadata = { title: "Care · Pal Care" };
export default async function Care({
  searchParams,
}: {
  searchParams?: Promise<LibraryParams>;
}) {
  const params = (await searchParams) ?? {};
  // Old Home library URLs keep their filters; plain /dashboard is now Care.
  if (
    ["q", "view", "category", "source", "documents", "sort", "page"].some(
      (key) => params[key] !== undefined,
    )
  ) {
    const query = parseLibraryQuery(params);
    redirect(
      query.valid ? libraryHref(query) : "/purchases?source=unsupported",
    );
  }
  const feed = await getCareFeed();
  const studioAllowed = studioEvaluationAllowed(
    process.env,
    (await headers()).get("host") ?? "",
  );
  const filter = parseCareFilter(params.status);
  return (
    <Shell active="/dashboard" source={feed.source}>
      <NorthCollection>
        <h1 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight">
          Care for what you own.
        </h1>
        <p className="mt-2 mb-4 text-base leading-7 text-muted-foreground">
          Your purchases, important dates, and the help you need.
        </p>
      </NorthCollection>
      <NorthSearch
        query={parseLibraryQuery({})}
        searchIndex={feed.searchIndex}
      />
      <NorthCollection>
        <CareHelpShortcuts feed={feed} />
        <CareAttention feed={feed} />
        <CareCalendarPanel
          calendar={feed.demoAsOf ? demoCareCalendar(feed) : careCalendar(feed)}
          studioAllowed={studioAllowed}
        />
        <section aria-labelledby="all-products-title" className="border-t pt-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="all-products-title"
                className="text-xl font-semibold tracking-tight sm:text-2xl"
              >
                All your products
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your saved purchases and key care information.
              </p>
            </div>
            <a
              href="/purchases"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-intelligence-foreground hover:underline"
            >
              View purchases →
            </a>
          </div>
          <CareFilters filter={filter} feed={feed} />
          <div className="mt-4">
            <CareFeedView feed={feed} filter={filter} filters={false} />
          </div>
        </section>
        <HowPalCareWorks feed={feed} />
      </NorthCollection>
    </Shell>
  );
}
