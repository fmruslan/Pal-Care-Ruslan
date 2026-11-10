import Link from "next/link";
import { getDemoData } from "@/lib/demo/repository";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { GuardianCard, GuardianIllustration } from "@/components/guardian";
import { guardianTerms } from "@/lib/price-guardian/policy";

export const metadata = { title: "Price Guardian" };
export default async function GuardianPage() {
  const [data, guardian] = await Promise.all([getDemoData(), getGuardian()]);
  return (
    <Shell active="/guardian" source={data.source}>
      <PageHeading
        eyebrow="Pal Care · Price Guardian"
        title="Price adjustments"
        description="Review saved price comparisons, merchant terms and any recorded refund status. A proposed adjustment is not a completed refund."
      />
      <div className="grid gap-5 md:grid-cols-2">
        {guardian.cases.map((item) => (
          <GuardianCard key={item.id} item={item} />
        ))}
      </div>
      {!guardian.cases.length && (
        <Card>
          <h2 className="section-title">No eligible adjustment recorded.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            Existing purchases keep their original merchant terms. The demo
            14-day price promise would apply only to eligible new purchases
            after it is activated, not earlier purchases. New Sandbox purchases
            and refunds require separate approval from the demo owner; no real
            money is involved.
          </p>
          <Link
            href="/vault"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            View your purchases →
          </Link>
        </Card>
      )}
      <p className="mt-5 text-sm text-muted-foreground">
        {guardian.monitoring.lastCheck
          ? `Last successful catalog check: ${new Date(guardian.monitoring.lastCheck).toISOString()}.`
          : "No scheduled catalog check has been verified yet."}{" "}
        {guardian.monitoring.scheduled
          ? "A schedule is configured; the timestamp shows when a check last succeeded."
          : "No continuous cloud monitoring is active. A saved demo check does not mean prices are being watched live."}
      </p>
      <GuardianIllustration />
      <details className="mt-6 rounded-2xl border bg-card p-5">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Read the demo price-adjustment terms
        </summary>
        <p className="mt-3 text-sm leading-7 whitespace-pre-wrap">
          {guardianTerms}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          These terms do not confirm that the promise is active or applies to an
          earlier purchase.
        </p>
      </details>
    </Shell>
  );
}
