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
    <Shell active="/vault" source={data.source}>
      <PageHeading
        eyebrow="CareOS · Proactive ownership care"
        title="Your value, looked after."
        description="Eligible merchant price adjustments, discovered from saved purchase facts—not a customer complaint or a refund chatbot."
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
            The original purchases keep their demo-v1 terms. The new 14-day
            price promise applies only to future eligible purchases created
            after activation. A new Sandbox purchase and refund still require
            separate owner approval.
          </p>
          <Link
            href="/vault"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Explore your Purchase Twins →
          </Link>
        </Card>
      )}
      <p className="mt-5 text-sm text-muted-foreground">
        {guardian.monitoring.lastCheck
          ? `Last successful catalog check: ${new Date(guardian.monitoring.lastCheck).toISOString()}.`
          : "No scheduled catalog check has been verified yet."}{" "}
        {guardian.monitoring.scheduled
          ? "Schedule configured; check the timestamp for freshness."
          : "Cloud scheduling is not active. Local jobs and controlled demo actions are separate from continuous monitoring."}
      </p>
      <GuardianIllustration />
      <details className="mt-6 rounded-2xl border bg-card p-5">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Read the new demo merchant promise
        </summary>
        <p className="mt-3 text-sm leading-7 whitespace-pre-wrap">
          {guardianTerms}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Defined policy is not proof of activation or coverage for an earlier
          purchase.
        </p>
      </details>
    </Shell>
  );
}
