import { ArrowRight, Layers2, LockKeyhole } from "lucide-react";
import { cookies } from "next/headers";
import { getDemoData } from "@/lib/demo/repository";
import { checkoutAvailability } from "@/lib/commerce/config";
import { CHECKOUT_COOKIE, checkoutTokenSchema } from "@/lib/commerce/contracts";
import { sessionHash } from "@/lib/commerce/security";
import { money } from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeading } from "@/components/page-heading";
import { ProductArt } from "@/components/product-art";
import { BuyButton } from "@/components/checkout-controls";
import { REFERENCE_PRODUCT } from "@/lib/careos/knowledge";
import { displayedPromise } from "@/lib/price-guardian/runtime";

export const metadata = { title: "Demo shop" };
const descriptions: Record<string, string> = {
  headphones:
    "A little more focus for your everyday. A fictional audio companion with a place for its whole ownership story.",
  kettle:
    "A thoughtful start to the morning. A fictional kitchen favorite, with the purchase details kept close.",
  speaker:
    "A little atmosphere, wherever the day goes. A fictional speaker with a Purchase Twin of its own.",
};
export default async function Shop() {
  const data = await getDemoData();
  const token = checkoutTokenSchema.safeParse(
    (await cookies()).get(CHECKOUT_COOKIE)?.value,
  );
  const checkout = checkoutAvailability(
    token.success ? sessionHash(token.data) : undefined,
  );
  const promises = await Promise.all(
    data.products.map(async (p) => ({
      id: p.id,
      promise: await displayedPromise(p),
    })),
  );
  return (
    <Shell active="/shop" source={data.source}>
      <PageHeading
        eyebrow="Everyday Goods · Fictional demo merchant"
        title="Good things. Better aftercare."
        description="A small collection for a bigger idea: the purchase should be the beginning of a useful care experience."
      />
      <div
        role="status"
        className="mb-7 flex items-start gap-3 rounded-2xl border bg-secondary p-5 text-sm leading-7 text-secondary-foreground"
      >
        <LockKeyhole className="mt-1 size-4 shrink-0" aria-hidden="true" />
        <p>
          <strong className="font-semibold">{checkout.reason}</strong>
          {!checkout.enabled &&
            " The catalog is still browsable; no fake payment will be substituted."}{" "}
          Nothing ships. Use only a fictional Sandbox buyer and simulated money.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data.products
          .filter((product) => product.id !== REFERENCE_PRODUCT)
          .map((product) => (
            <Card key={product.id} className="motion-card p-4 sm:p-5">
              <ProductArt kind={product.illustration} />
              <div className="px-1 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {product.brand} · {product.model}
                  </p>
                  <Badge>Fictional product</Badge>
                </div>
                <h2 className="mt-3 text-xl font-semibold tracking-tight">
                  {product.name}
                </h2>
                <p className="mt-3 min-h-21 text-sm leading-7 text-muted-foreground">
                  {descriptions[product.illustration] ??
                    "A fictional demo product. No real goods are sold."}
                </p>
                <div className="my-5 flex items-end justify-between gap-3 border-t pt-5">
                  <p className="text-2xl font-semibold tabular-nums">
                    {money(product.priceMinor)}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    Sandbox USD · 1 item
                  </span>
                </div>
                <BuyButton
                  productId={product.id}
                  offerHash={
                    promises.find((p) => p.id === product.id)?.promise
                      ?.offerHash
                  }
                  enabled={
                    checkout.enabled &&
                    (!checkout.allowedProductId ||
                      checkout.allowedProductId === product.id)
                  }
                  approvedRequestId={
                    checkout.allowedProductId === product.id
                      ? checkout.approvedRequestId
                      : undefined
                  }
                />
                {promises.find((p) => p.id === product.id)?.promise && (
                  <details className="mt-4 rounded-xl border p-3 text-xs leading-6">
                    <summary className="min-h-11 cursor-pointer font-semibold">
                      Included demo-price-v2 price promise
                    </summary>
                    <p>
                      {
                        promises.find((p) => p.id === product.id)!.promise!
                          .terms
                      }
                    </p>
                  </details>
                )}
                <p className="mt-3 text-center text-xs leading-6 text-muted-foreground">
                  Buyer approval required · No real money
                </p>
              </div>
            </Card>
          ))}
      </div>
      <section
        className="hero-wash mt-8 grid gap-5 rounded-3xl border p-7 sm:p-8 md:grid-cols-[auto_1fr]"
        aria-labelledby="ownership-title"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-card text-primary shadow-card">
          <Layers2 className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 id="ownership-title" className="section-title">
            Your purchase is just the beginning.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            A real, verified PayPal Sandbox capture creates a new Purchase Twin
            with a sandbox receipt, saved product details, and a snapshotted
            demo policy. Only supplied sample care cards are attached; no
            manufacturer manual or warranty is invented.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
            Purchase → Verified capture → Purchase Twin
            <ArrowRight className="size-4" aria-hidden="true" />
          </p>
        </div>
      </section>
    </Shell>
  );
}
