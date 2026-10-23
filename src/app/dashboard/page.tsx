import Link from "next/link";
import {
  Archive,
  ArrowRight,
  FileText,
  ShieldCheck,
  CircleDollarSign,
  CalendarDays,
} from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeading } from "@/components/page-heading";
import { CareOSPanel } from "@/components/careos-panel";
import { TwinList } from "@/components/vault";
import { Events } from "@/components/events";
import { CareBriefing } from "@/components/careos/briefing";
import { buildBriefing } from "@/lib/careos/briefing";
import { getKnowledge } from "@/lib/careos/knowledge-repository";
import { getGuardian } from "@/lib/price-guardian/runtime";

export const metadata = { title: "Your care space" };
export default async function Dashboard() {
  const data = await getDemoData();
  const guardian = await getGuardian();
  return (
    <Shell active="/dashboard" source={data.source}>
      <PageHeading
        eyebrow="Your everyday, beautifully connected."
        title={`Your care space, ${data.customer.name}.`}
        description="Your purchases, useful guidance, and the paperwork that belongs with them."
        action={
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href="/shop">
              Explore the demo shop
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <CareBriefing
        items={buildBriefing(data, await getKnowledge(), guardian.cases)}
      />
      <div className="mb-8 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { icon: Archive, value: data.twins.length, label: "Purchase Twins" },
          {
            icon: FileText,
            value: data.documents.length,
            label: "Documents together",
          },
          {
            icon: ShieldCheck,
            value: data.twins.filter((twin) => twin.origin === "sandbox")
              .length,
            label: "Verified sandbox purchases",
          },
        ].map(({ icon: Icon, value, label }) => (
          <div
            key={label}
            className="flex flex-col items-start gap-1 rounded-2xl border bg-card px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4"
          >
            <span className="inline-flex items-center gap-2">
              <Icon
                className="size-4 shrink-0 text-primary sm:size-5"
                strokeWidth={1.6}
                aria-hidden="true"
              />
              <span className="text-xl font-semibold tabular-nums">
                {value}
              </span>
            </span>
            <span className="text-xs leading-5 text-muted-foreground sm:text-sm">
              {label}
            </span>
          </div>
        ))}
      </div>
      <section aria-labelledby="purchases-title">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="purchases-title" className="section-title">
            Your purchase vault
          </h2>
          <Link
            href="/vault"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
          >
            View all
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <TwinList data={data} />
      </section>
      <div className="mt-9 grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="care-title">
          <div className="mb-5">
            <h2 id="care-title" className="section-title">
              A little care, along the way.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Source-labeled history. Sample scenarios are not live monitoring.
            </p>
          </div>
          <Events events={data.events} />
        </section>
        <div className="space-y-5 xl:pt-16">
          <CareOSPanel compact />
          {[
            {
              icon: CircleDollarSign,
              title: "Price Guardian",
              description:
                "Merchant price comparisons and approval workflows are implemented. Actual Sandbox refund verification awaits a separately approved test.",
            },
            {
              icon: CalendarDays,
              title: "Purchase Protection",
              description:
                "A place for return dates, supplied warranty terms, and official recall evidence. Live checks are not active.",
            },
          ].map(({ icon: Icon, title, description }) => (
            <Card key={title} className="rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {title}
                </h3>
                <Badge>
                  {title === "Price Guardian"
                    ? "Sandbox test pending"
                    : "Not active"}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {description}
              </p>
              {title === "Price Guardian" && (
                <Link
                  className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                  href="/guardian"
                >
                  Explore Price Guardian →
                </Link>
              )}
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}
