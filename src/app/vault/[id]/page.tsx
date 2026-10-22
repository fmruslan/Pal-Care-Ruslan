import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Sparkles } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import {
  findTwin,
  displayDate,
  money,
  recordIdSchema,
} from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { ProductArt } from "@/components/product-art";
import { DocumentList } from "@/components/vault";
import { Events } from "@/components/events";

export const metadata = { title: "Purchase Twin" };

export default async function TwinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success) notFound();
  const data = await getDemoData();
  const record = findTwin(data, id);
  if (!record) notFound();
  const { twin, product, documents, events } = record;
  return (
    <Shell active="/vault" source={data.source}>
      <Link
        href="/vault"
        className="mb-6 inline-flex min-h-11 items-center gap-2 text-xs font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to purchase vault
      </Link>
      <div className="grid gap-7 lg:grid-cols-2">
        <ProductArt kind={product.illustration} large />
        <div className="py-3">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">
            PURCHASE TWIN ·{" "}
            {twin.origin === "sandbox"
              ? "VERIFIED PAYPAL SANDBOX"
              : "SAMPLE RECORD"}
          </p>
          <h1 className="mt-4 font-display text-4xl sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {product.brand} · {product.model}
          </p>
          <dl className="mt-7 grid grid-cols-2 gap-6 border-t pt-6">
            {[
              [
                twin.origin === "sandbox"
                  ? "Sandbox purchase"
                  : "Sample purchase",
                displayDate(twin.purchasedOn),
              ],
              [
                twin.origin === "sandbox"
                  ? "Sandbox price paid"
                  : "Sample price paid",
                money(twin.purchasePriceMinor),
              ],
              [
                "Fictional merchant",
                twin.productSnapshot?.merchantName ?? data.merchant.name,
              ],
              [
                "Payment verification",
                twin.origin === "sandbox"
                  ? "COMPLETED · verified server-side"
                  : "Not connected",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-2 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-7 rounded-2xl bg-secondary p-4 text-xs leading-6">
            {twin.origin === "sandbox"
              ? "A completed PayPal Sandbox capture was retrieved and validated on the server. The product and customer are fictional; no real money was used."
              : "This is a sample Purchase Twin, not a verified PayPal purchase."}{" "}
            Warranty, return and recall status have not been verified.
          </div>
          {twin.origin === "sandbox" && (
            <dl className="mt-5 space-y-3 break-all text-xs">
              <div>
                <dt className="text-muted-foreground">PayPal Sandbox order</dt>
                <dd className="mt-1 font-mono">{twin.paypalOrderId}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  PayPal Sandbox capture
                </dt>
                <dd className="mt-1 font-mono">{twin.paypalCaptureId}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Verified at</dt>
                <dd className="mt-1">{twin.verifiedAt}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
      <div className="mt-9 grid gap-7 xl:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="documents-heading">
          <h2
            id="documents-heading"
            className="mb-5 flex items-center gap-2 font-display text-2xl"
          >
            <FileText className="size-5" aria-hidden="true" />
            The paperwork
          </h2>
          <DocumentList documents={documents} />
          <h2 className="mt-8 mb-5 font-display text-2xl">Care history</h2>
          <Events events={events} />
        </section>
        <section aria-labelledby="care-heading">
          <h2 id="care-heading" className="mb-5 font-display text-2xl">
            A little help, when you need it.
          </h2>
          <Card>
            <Sparkles className="size-7 text-primary" aria-hidden="true" />
            <h3 className="mt-5 text-base font-semibold">AI Product Care</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Source-backed setup and troubleshooting are planned. No AI model
              is connected.
            </p>
            <span className="mt-5 inline-block rounded-full bg-secondary px-3 py-2 text-xs font-medium">
              Coming in a later stage
            </span>
          </Card>
          <Card className="mt-5">
            <h3 className="text-base font-semibold">
              Care that follows through.
            </h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Price Guardian, official recall checks, return reminders, and
              replacement discovery will build on this record. None are active
              yet.
            </p>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
