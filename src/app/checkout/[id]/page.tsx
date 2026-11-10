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
            Your Sandbox checkout
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            This is a test checkout, with no real money or goods. Buyer approval
            alone does not confirm payment. Pal Care checks the completed PayPal
            Sandbox payment before creating a Purchase Twin—your saved purchase
            record.
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
            Use only a fictional PayPal Sandbox buyer and enter its sign-in
            details only on PayPal. Continue this checkout in the browser where
            you started it. No Pal Care registration is required.
          </p>
        </Card>
      </div>
    </StandaloneShell>
  );
}
