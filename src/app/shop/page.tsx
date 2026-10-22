import { getDemoData } from "@/lib/demo/repository";
import { checkoutAvailability } from "@/lib/commerce/config";
import { money } from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { ProductArt } from "@/components/product-art";
import { BuyButton } from "@/components/checkout-controls";

export const metadata = { title: "Demo shop" };
export default async function Shop() {
  const data = await getDemoData();
  const checkout = checkoutAvailability();
  return (
    <Shell active="/shop" source={data.source}>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">
        EVERYDAY GOODS · FICTIONAL DEMO MERCHANT
      </p>
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">
        Good things. Better aftercare.
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
        Pick one fictional product. Approve a payment with your PayPal Sandbox
        buyer account. Pal Care will create a Purchase Twin only after verifying
        the actual sandbox capture. Nothing ships; no real money is used.
      </p>
      <div
        role="status"
        className="my-6 rounded-2xl border bg-card p-5 text-sm leading-7"
      >
        {checkout.reason}
        {!checkout.enabled &&
          " The catalog is still browsable; no fake payment will be substituted."}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data.products.map((product) => (
          <Card key={product.id}>
            <ProductArt kind={product.illustration} />
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {product.brand} · {product.model}
            </p>
            <h2 className="mt-3 text-xl font-semibold">{product.name}</h2>
            <p className="mt-3 text-2xl font-semibold">
              {money(product.priceMinor)}
            </p>
            <p className="mt-2 mb-6 text-xs leading-6 text-muted-foreground">
              Sandbox USD · one item · no shipping or real goods
            </p>
            <BuyButton productId={product.id} enabled={checkout.enabled} />
          </Card>
        ))}
      </div>
      <section className="mt-8 rounded-3xl bg-secondary p-6">
        <h2 className="font-display text-2xl">
          Your purchase is just the beginning.
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          A verified capture adds a new Twin to the public demo vault, with a
          sandbox receipt, saved product details and a snapshotted demo policy.
          Only supplied sample care cards are attached; no manufacturer manual
          or warranty is invented.
        </p>
      </section>
    </Shell>
  );
}
