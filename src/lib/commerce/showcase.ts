import { z } from "zod";
import { CheckoutError } from "./contracts";

export const SHOWCASE_PRODUCT_ID = "00000000-0000-4000-8000-000000000110";
export const SHOWCASE_REQUEST_ID = "8972bc61-9d98-4d01-b9b8-64c5ef8678e3";
export const SHOWCASE_AMOUNT_MINOR = 6499;
export const showcaseScopeSchema = z
  .strictObject({
    requestId: z.literal(SHOWCASE_REQUEST_ID),
    sessionHash: z.string().regex(/^[a-f0-9]{64}$/),
    balanceConfirmed: z.boolean(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (s) =>
      Date.parse(s.endsAt) > Date.parse(s.startsAt) &&
      Date.parse(s.endsAt) - Date.parse(s.startsAt) <= 2 * 3600000,
    "Showcase window exceeds two hours",
  );
export type ShowcaseScope = z.infer<typeof showcaseScopeSchema>;

/** Fixed scope only; approval/configuration never proves buyer balance or payment. */
export function assertShowcaseScope(
  scope: ShowcaseScope | undefined,
  input: {
    productId: string;
    requestId: string;
    sessionHash: string;
    amountMinor?: number;
  },
  now = Date.now(),
) {
  const parsed = showcaseScopeSchema.safeParse(scope);
  if (
    !parsed.success ||
    !parsed.data.balanceConfirmed ||
    input.productId !== SHOWCASE_PRODUCT_ID ||
    input.requestId !== SHOWCASE_REQUEST_ID ||
    input.sessionHash !== parsed.data.sessionHash ||
    (input.amountMinor !== undefined &&
      input.amountMinor !== SHOWCASE_AMOUNT_MINOR) ||
    now < Date.parse(parsed.data.startsAt) ||
    now >= Date.parse(parsed.data.endsAt)
  )
    throw new CheckoutError("sandbox_test_not_authorized", 403);
}
