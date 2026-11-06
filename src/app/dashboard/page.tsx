import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { CareCalendarPanel } from "@/components/care/calendar";
import { careCalendar } from "@/lib/care/calendar";
import { studioEvaluationAllowed } from "@/lib/intelligence/access";
import { Shell } from "@/components/shell";
import { NorthCollection, NorthSearch } from "@/components/careos/integrated";
import { CareFeedView, CareFilters } from "@/components/care/feed";
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
        <h1 className="mb-6 text-[clamp(1.75rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight">
          Care for what you own.
        </h1>
      </NorthCollection>
      <NorthSearch
        query={parseLibraryQuery({})}
        searchIndex={feed.searchIndex}
        footer={<CareFilters filter={filter} feed={feed} />}
      />
      <NorthCollection>
        {feed.demoAsOf && (
          <p
            data-care-demo-disclosure
            className="mb-3 text-xs leading-6 text-muted-foreground"
          >
            Sample collection · Illustrative purchases and care events
          </p>
        )}
        <CareCalendarPanel
          calendar={careCalendar(feed)}
          studioAllowed={studioAllowed}
        />
        <CareFeedView feed={feed} filter={filter} filters={false} />
      </NorthCollection>
    </Shell>
  );
}
