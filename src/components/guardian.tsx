import Link from "next/link";
import { ArrowUpRight, CircleDollarSign } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { money } from "@/lib/demo/presentation";
import type { GuardianView } from "@/lib/price-guardian/contracts";

export const guardianLabels: Record<GuardianView["state"], string> = {
  awaiting_approval: "Awaiting merchant approval",
  approved: "Approved · not submitted",
  submitting: "Submitted · not yet verified",
  unknown: "Outcome unresolved · further refunds blocked",
  pending: "PayPal refund pending",
  completed: "Refund verified in PayPal Sandbox",
  failed: "PayPal refund failed",
  cancelled: "PayPal refund cancelled",
  expired: "Opportunity expired",
  review: "Evidence needs operator review",
};
export function GuardianCard({ item }: { item: GuardianView }) {
  return (
    <Card
      className="intelligence-wash"
      aria-label={`Price Guardian for ${item.productName}`}
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
        <CircleDollarSign className="size-4" aria-hidden="true" />
        CareOS · Price Guardian
      </p>
      <h2 className="text-xl font-semibold">
        {item.state === "completed"
          ? `${money(item.amountMinor)} refunded in Sandbox.`
          : `${money(item.amountMinor)} price adjustment found.`}
      </h2>
      <p className="mt-3 text-sm font-medium">{guardianLabels[item.state]}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {item.productName} · Original {money(item.originalMinor)} → recorded
        merchant price {money(item.comparedMinor)}. No customer claim is needed.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        {item.priceOrigin === "controlled_demo"
          ? "Controlled demo price change"
          : "Recorded merchant catalog price"}{" "}
        · {item.policyVersion}
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link href={`/guardian/${item.id}`}>
          View adjustment evidence
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </Button>
    </Card>
  );
}
export function GuardianIllustration() {
  return (
    <details className="mt-6 rounded-3xl border bg-card p-5 sm:p-7">
      <summary className="min-h-11 cursor-pointer text-base font-semibold">
        Explore a clearly labeled example
      </summary>
      <div className="mt-5">
        <Badge>Illustrative scenario · not a saved entitlement</Badge>
        <h2 className="mt-4 text-2xl font-semibold">
          A little value, looked after.
        </h2>
        <dl className="mt-5 grid grid-cols-3 gap-3">
          {[
            ["Original", "$129"],
            ["New price", "$109"],
            ["Proposed", "$20"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-2 text-xl font-semibold text-intelligence-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          CareOS would discover the qualifying change, prepare the calculation,
          and send it for merchant approval. This example is fictional, is not
          attached to an existing purchase, and is not a completed refund or an
          existing PayPal benefit. The original demo-v1 purchases remain
          uncovered.
        </p>
      </div>
    </details>
  );
}
