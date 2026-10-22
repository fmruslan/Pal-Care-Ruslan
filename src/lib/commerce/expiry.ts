import type { CheckoutView } from "./contracts";

export function checkoutHasExpired(
  order: Pick<CheckoutView, "state" | "expiresAt" | "captureAttempted">,
  now = Date.now(),
) {
  // An attempted payment must remain reconcilable, even after the deadline.
  return (
    !order.captureAttempted &&
    ["creating", "create_unknown", "created", "pending", "expired"].includes(
      order.state,
    ) &&
    new Date(order.expiresAt).getTime() <= now
  );
}
