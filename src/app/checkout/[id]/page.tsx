import { notFound } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckoutControls } from "@/components/checkout-controls";
import { StandaloneShell } from "@/components/standalone-shell";
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
    <StandaloneShell href="/shop">
      <div className="passport-frame">
        <Card className="rounded-[27px] border-0 p-6 sm:p-9">
          <Badge tone="blue">
            <LockKeyhole className="size-3.5" aria-hidden="true" />
            PayPal Sandbox only
          </Badge>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            A good start for
            <br />
            your next purchase.
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Buyer approval is not proof of payment. Pal Care validates PayPal’s
            capture before creating your Purchase Twin.
          </p>
          <ol
            aria-label="Checkout process"
            className="my-6 grid grid-cols-3 gap-2 rounded-2xl bg-background p-4 text-xs text-muted-foreground"
          >
            {["Review product", "Approve on PayPal", "Verify purchase"].map(
              (label, index) => (
                <li key={label} className="flex flex-col gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full border bg-card font-semibold text-primary">
                    {index + 1}
                  </span>
                  {label}
                </li>
              ),
            )}
          </ol>
          <CheckoutControls
            id={id}
            returned={typeof query.token === "string"}
            cancelled={query.cancel === "1"}
          />
          <p className="mt-6 border-t pt-5 text-sm leading-7 text-muted-foreground">
            Use only a fictional PayPal Sandbox buyer. Credentials stay on
            PayPal or the server; your anonymous Pal Care checkout session stays
            in its original browser. No registration required.
          </p>
        </Card>
      </div>
    </StandaloneShell>
  );
}
