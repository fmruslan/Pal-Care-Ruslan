import { headers } from "next/headers";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { CustomerWorkspace } from "@/components/intelligence/customer-workspace";
import { getCustomerIntelligence } from "@/lib/intelligence/customer-repository";
import { studioEvaluationAllowed } from "@/lib/intelligence/access";
import { CareCalendarPanel } from "@/components/care/calendar";
import { careCalendar } from "@/lib/care/calendar";
import { getCareFeed } from "@/lib/care/repository";

export const metadata = { title: "Purchase Insights" };
export default async function InsightsPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const showCalendar = (await searchParams)?.view === "care-events";
  const [dataset, h] = await Promise.all([
    getCustomerIntelligence(),
    headers(),
  ]);
  const allowed = studioEvaluationAllowed(process.env, h.get("host") ?? "");
  const live =
    allowed &&
    ((process.env.CAREOS_PROVIDER === "responses" &&
      process.env.CAREOS_LIVE_ENABLED === "true") ||
      (process.env.CAREOS_PROVIDER === "subscription" &&
        process.env.CAREOS_SUBSCRIPTION_ENABLED === "true"));
  return (
    <Shell active="/insights" source={dataset.source}>
      <PageHeading
        title="Insights"
        description="Explore your saved purchases, find documents and review recorded price adjustments."
      />
      {showCalendar && (
        <CareCalendarPanel
          calendar={careCalendar(await getCareFeed())}
          studioAllowed={allowed}
          all
        />
      )}
      <CustomerWorkspace
        dataset={dataset}
        studioAllowed={allowed}
        live={live}
      />
    </Shell>
  );
}
