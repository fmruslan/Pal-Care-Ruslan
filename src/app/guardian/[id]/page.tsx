import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoData } from "@/lib/demo/repository";
import { findTwin, money, recordIdSchema } from "@/lib/demo/presentation";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { contextOf } from "@/lib/careos/contracts";
import {
  CareContextRegistration,
  AskCareOS,
} from "@/components/careos/provider";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { guardianLabels } from "@/components/guardian";

export const metadata = { title: "Price adjustment evidence" };
export default async function GuardianCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success) notFound();
  const overview = await getGuardian(undefined, id);
  const item = overview.cases.find((c) => c.id === id);
  if (!item) notFound();
  const data = await getDemoData(item.twinId);
  const record = findTwin(data, item.twinId);
  if (!item || !record) notFound();
  return (
    <Shell active="/vault" source={data.source}>
      <CareContextRegistration context={contextOf(record)} />
      <Link
        href={`/vault/${item.twinId}`}
        className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
      >
        ← Back to {item.productName}
      </Link>
      <PageHeading
        eyebrow="CareOS · Price Guardian evidence"
        title={guardianLabels[item.state]}
        description="The purchase, merchant promise, price observation, approval and provider outcome stay connected."
        action={
          <div className="hidden sm:block">
            <AskCareOS context={contextOf(record)}>
              Ask about this adjustment
            </AskCareOS>
          </div>
        }
      />
      <Card className="intelligence-wash">
        <Badge tone={item.state === "completed" ? "success" : "intelligence"}>
          {item.state === "completed"
            ? "Provider-verified Sandbox refund"
            : "Recorded opportunity · not a completed refund"}
        </Badge>
        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            ["Original paid", money(item.originalMinor)],
            ["Compared price", money(item.comparedMinor)],
            [
              item.state === "completed" ? "Refunded" : "Proposed adjustment",
              money(item.amountMinor),
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-2 text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-sm text-muted-foreground">
          {item.priceOrigin === "controlled_demo"
            ? "Controlled demo merchant price change"
            : "Merchant catalog observation"}{" "}
          · {item.priceObservedAt}. PayPal does not verify merchant price
          comparisons.
        </p>
        {item.state === "completed" && (
          <p className="mt-4 text-sm font-semibold">
            Effective cost after this verified adjustment:{" "}
            {money(item.originalMinor - item.amountMinor)}. Original receipt
            unchanged.
          </p>
        )}
      </Card>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="section-title">Why this amount?</h2>
          <p className="mt-4 text-sm leading-7">
            Original price minus eligible merchant price:{" "}
            {money(item.originalMinor)} − {money(item.comparedMinor)}. Limited
            to the approved policy cap of $20 and one adjustment per capture. No
            customer claim is required; merchant approval is required.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Initial dispatch deadline: {item.expiresAt}. Reason: {item.reason}.
          </p>
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              Policy snapshot · {item.policyVersion}
            </summary>
            <p className="text-sm leading-7 whitespace-pre-wrap">
              {item.policyTerms}
            </p>
            <p className="mt-3 break-all font-mono text-xs">
              SHA-256 {item.policyHash}
            </p>
          </details>
        </Card>
        <Card>
          <h2 className="section-title">Recorded outcome</h2>
          <p className="mt-4 text-sm leading-7">
            {guardianLabels[item.state]}. Only independent PayPal retrieval can
            establish a verified completed refund. This does not promise a
            bank-credit timing or a real-money benefit.
          </p>
          {item.refundId && (
            <dl className="mt-4 text-sm">
              <dt>PayPal Sandbox refund</dt>
              <dd className="mt-1 break-all font-mono">{item.refundId}</dd>
              <dt className="mt-3">Retrieved provider status</dt>
              <dd>{item.providerStatus ?? "Not verified"}</dd>
              <dt className="mt-3">Completion verified</dt>
              <dd>{item.verifiedAt ?? "Not established"}</dd>
            </dl>
          )}
        </Card>
      </div>
      <section className="mt-7" aria-labelledby="guardian-history">
        <h2 id="guardian-history" className="section-title mb-4">
          Living purchase history
        </h2>
        <ol className="space-y-3">
          {item.history.map((e) => (
            <li key={e.id}>
              <Card className="rounded-2xl">
                <p className="text-sm font-semibold">{e.kind}</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {e.detail}
                </p>
                <time
                  className="mt-3 block text-xs text-muted-foreground"
                  dateTime={e.at}
                >
                  {e.at}
                </time>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </Shell>
  );
}
