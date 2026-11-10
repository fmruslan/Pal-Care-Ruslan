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
  unknown: "Refund outcome unknown · further refunds blocked",
  pending: "PayPal refund pending",
  completed: "Refund verified in PayPal Sandbox",
  failed: "PayPal refund failed",
  cancelled: "PayPal refund cancelled",
  expired: "Opportunity expired",
  review: "Needs manual review",
};
export function GuardianCard({ item }: { item: GuardianView }) {
  return (
    <Card
      className="intelligence-wash"
      aria-label={`Price Guardian for ${item.productName}`}
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
        <CircleDollarSign className="size-4" aria-hidden="true" />
        Pal Care · Price Guardian
      </p>
      <h2 className="text-xl font-semibold">
        {item.state === "completed"
          ? `${money(item.amountMinor)} refunded in Sandbox.`
          : `${money(item.amountMinor)} proposed price adjustment.`}
      </h2>
      <p className="mt-3 text-sm font-medium">{guardianLabels[item.state]}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {item.productName} · Original price {money(item.originalMinor)} → saved
        merchant price {money(item.comparedMinor)}. This record is read-only;
        any refund requires merchant approval.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        {item.priceOrigin === "controlled_demo"
          ? "Example price change · not a current retail price"
          : "Recorded merchant catalog price"}{" "}
        · {item.policyVersion}
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link href={`/guardian/${item.id}`}>
          View adjustment details
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
        How a price adjustment could work
      </summary>
      <div className="mt-5">
        <Badge>Fictional example · no refund issued</Badge>
        <h2 className="mt-4 text-2xl font-semibold">
          A lower price, subject to merchant terms.
        </h2>
        <dl className="mt-5 grid grid-cols-3 gap-3">
          {[
            ["Original price", "$129"],
            ["New price", "$109"],
            ["Proposed adjustment", "$20"],
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
          In this fictional example, a qualifying price drop could lead to a
          proposed adjustment for merchant approval. It is not linked to a saved
          purchase, and no refund was issued. This is not an existing PayPal
          benefit. Earlier purchases retain their original terms and do not gain
          price protection from this example.
        </p>
      </div>
    </details>
  );
}
