import { getSavedRecordsData } from "@/lib/demo/repository";
import { Shell } from "@/components/shell";
import { LibrarySearch, LibraryResults } from "@/components/home-library";
import { homeLibrary } from "@/lib/demo/library";
import {
  parseLibraryQuery,
  type LibraryParams,
} from "@/lib/library-navigation";
import { CareBriefing } from "@/components/careos/briefing";
import { buildBriefing } from "@/lib/careos/briefing";
import { getKnowledge } from "@/lib/careos/knowledge-repository";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { getPurchaseActivity } from "@/lib/careos/activity-repository";
import { PurchaseActivity } from "@/components/purchase-activity";

export const metadata = { title: "Home · Your library" };
export default async function Dashboard({
  searchParams,
}: {
  searchParams?: Promise<LibraryParams>;
}) {
  const data = await getSavedRecordsData();
  const query = parseLibraryQuery((await searchParams) ?? {});
  const library = homeLibrary(data, query);
  const showUpdates = !query.q && query.view === "purchases" && query.valid;
  const updates = showUpdates
    ? await Promise.all([
        getGuardian(),
        getPurchaseActivity(data),
        getKnowledge(),
      ])
    : null;
  return (
    <Shell active="/dashboard" source={data.source}>
      <div className="mb-5 max-w-3xl">
        <p className="mb-2 hidden text-sm font-medium text-primary sm:block">
          {data.customer.name}’s care space
        </p>
        <h1 className="text-[clamp(1.6rem,3vw,2rem)] leading-tight font-bold tracking-tight">
          Your purchases, together.
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your products, paperwork and available care.
        </p>
      </div>
      <LibrarySearch query={query} categories={library.categories} />
      <LibraryResults library={library} query={query} />
      {updates && (
        <div className="mt-10 border-t pt-7">
          <CareBriefing
            items={buildBriefing(
              data,
              updates[2],
              updates[0].cases,
              updates[1],
            )}
          />
          <section className="mt-8" aria-label="Recent saved activity">
            <h2 className="section-title mb-4">
              A little care, along the way.
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Source-labeled history, not live monitoring.
            </p>
            <PurchaseActivity
              activity={{ ...updates[1], items: updates[1].items.slice(0, 5) }}
            />
          </section>
        </div>
      )}
    </Shell>
  );
}
