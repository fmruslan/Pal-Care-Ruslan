import { z } from "zod";

export const productSnapshotSchema = z.object({
  id: z.uuid(),
  merchantId: z.uuid(),
  name: z.string().min(1).max(120),
  brand: z.string().max(80),
  model: z.string().max(80),
  category: z.string().max(40),
  illustration: z.string().max(20),
  priceMinor: z.number().int().positive().max(20000),
  currency: z.literal("USD"),
  merchantName: z.string().max(120),
});
export type ProductSnapshot = z.infer<typeof productSnapshotSchema>;
export type PolicySnapshot = {
  version: string;
  title: string;
  content: string;
};
export const demoMerchantPolicy: PolicySnapshot = {
  version: "demo-v1",
  title: "Everyday Goods · demo merchant policy v1",
  content:
    "DEMO MERCHANT POLICY — VERSION demo-v1\nFictional goods, PayPal Sandbox money only. Nothing ships. No real warranty, insurance or coverage is provided. No automated price adjustment or refund is offered in this stage. These are demonstration terms, not terms for real commerce.",
};
export const startCheckoutSchema = z
  .object({ productId: z.uuid(), requestId: z.uuid() })
  .strict();
export const CHECKOUT_COOKIE = "palcare_checkout";
export const checkoutTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const providerIdSchema = z.string().regex(/^[A-Z0-9]{10,36}$/);
export type CheckoutState =
  | "creating"
  | "create_unknown"
  | "created"
  | "capturing"
  | "pending"
  | "completed"
  | "cancelled"
  | "failed"
  | "review";
export type CheckoutView = {
  id: string;
  // Expiry is derived from the saved deadline, not a new persisted payment state.
  state: CheckoutState | "expired";
  product: ProductSnapshot;
  approvalUrl: string | null;
  twinId: string | null;
  error: string | null;
  expiresAt: string;
  captureAttempted: boolean;
};

export class CheckoutError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
