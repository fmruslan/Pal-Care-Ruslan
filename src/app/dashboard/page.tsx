import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { PageHeading } from "@/components/page-heading";
import { PurchaseMetrics } from "@/components/purchase-metrics";
import { TwinList } from "@/components/vault";
import { PurchaseActivity } from "@/components/purchase-activity";
import { CareBriefing } from "@/components/careos/briefing";
import { buildBriefing } from "@/lib/careos/briefing";
import { getKnowledge } from "@/lib/careos/knowledge-repository";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { getPurchaseActivity } from "@/lib/careos/activity-repository";

export const metadata = { title: "Home · Your care space" };
export default async function Dashboard() {
  const data = await getDemoData();
  const [guardian, activity, knowledge] = await Promise.all([
    getGuardian(),
    getPurchaseActivity(data),
    getKnowledge(),
  ]);
  return (
    <Shell active="/dashboard" source={data.source}>
      <div className="mb-8 max-w-3xl [&>div:first-child]:mb-0">
        <PageHeading
          eyebrow="Your purchases. A little more organized."
          title={`Everything you own, ${data.customer.name}.`}
          description="All cared for. Your saved purchases, receipts and supported guidance, together in one place."
        />
      </div>
      <PurchaseMetrics
        purchases={data.twins.length}
        documents={data.documents.length}
        verified={data.twins.filter((twin) => twin.origin === "sandbox").length}
      />
      <section aria-labelledby="purchases-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
          <h2 id="purchases-title" className="section-title">
            Your purchases
          </h2>
          <Link
            href="/vault"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
          >
            View all
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <TwinList data={data} compact />
      </section>
      <div className="mt-8">
        <CareBriefing
          items={buildBriefing(data, knowledge, guardian.cases, activity)}
        />
      </div>
      <div className="mt-9 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0" aria-labelledby="care-title">
          <div className="mb-5">
            <h2 id="care-title" className="section-title">
              A little care, along the way.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Source-labeled history. Sample scenarios are not live monitoring.
            </p>
          </div>
          <PurchaseActivity
            activity={{ ...activity, items: activity.items.slice(0, 5) }}
          />
        </section>
        <Card className="min-w-0 rounded-2xl xl:mt-16">
          <h2 className="text-base font-semibold">Explore at your pace</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            Open saved paperwork or explore a specific aftercare question. These
            views do not authorize payments or confirm coverage.
          </p>
          <nav aria-label="Purchase resources" className="mt-4 divide-y">
            {[
              {
                href: "/documents",
                label: "Documents",
                detail: "Receipts and available guides",
              },
              {
                href: "/guardian",
                label: "Price Guardian",
                detail: "Recorded comparisons · financial activation off",
              },
              {
                href: "/safety",
                label: "Safety & recalls",
                detail: "One reviewed official notice · limited coverage",
              },
              {
                href: "/replacements",
                label: "Replacement options",
                detail: "Care first · fixture comparisons are labeled",
              },
            ].map(({ href, label, detail }) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-11 items-center justify-between gap-3 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-primary">{label}</span>
                  <span className="mt-1 block leading-6 text-muted-foreground">
                    {detail}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </nav>
        </Card>
      </div>
    </Shell>
  );
}
