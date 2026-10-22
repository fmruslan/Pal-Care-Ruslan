import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card } from "@/components/ui/card";
import { CheckoutControls } from "@/components/checkout-controls";
import { recordIdSchema } from "@/lib/demo/presentation";

export const metadata = {
  title: "Sandbox checkout",
  referrer: "no-referrer" as const,
};
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; cancel?: string }>;
}) {
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success) notFound();
  const query = await searchParams;
  return (
    <main id="main-content" className="mx-auto max-w-xl px-5 py-10">
      <Brand href="/shop" />
      <Card className="mt-8 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          PAYPAL SANDBOX ONLY
        </p>
        <h1 className="mt-4 mb-5 font-display text-4xl">
          One purchase. A lifetime of possibility.
        </h1>
        <p className="mb-6 text-sm leading-7 text-muted-foreground">
          Buyer approval is not proof of payment. Pal Care retrieves the order
          from PayPal and validates the capture before adding it to your vault.
        </p>
        <CheckoutControls
          id={id}
          returned={typeof query.token === "string"}
          cancelled={query.cancel === "1"}
        />
      </Card>
      <p className="mt-6 text-xs leading-6 text-muted-foreground">
        Use only fictional PayPal Sandbox accounts. Provider credentials stay on
        the server. Your anonymous checkout session is browser-specific; no Pal
        Care registration is required.
      </p>
    </main>
  );
}
