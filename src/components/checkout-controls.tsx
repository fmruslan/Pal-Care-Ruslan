"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import type { CheckoutView } from "@/lib/commerce/contracts";
import { checkoutHasExpired } from "@/lib/commerce/expiry";

const errorMessages: Record<string, string> = {
  guardian_offer_changed:
    "The price or price-adjustment terms changed. Reload Browse products and review the current terms before continuing. No new order was created.",
  guardian_policy_unavailable:
    "The merchant’s new price-adjustment terms are not active. No checkout with those terms was created.",
  checkout_unavailable:
    "Sandbox checkout is unavailable. No payment is marked complete.",
  operation_in_progress:
    "This checkout is already processing. Wait a moment, then check its status.",
  demo_limit_reached:
    "The demo's safety limit has been reached. Please try again later.",
  checkout_not_found:
    "This checkout is not available in this browser. Go back to Browse products.",
  checkout_session_lost:
    "This checkout belongs to another browser, or its browser session was lost. No new order was created. Ask the demo operator to check the original checkout before starting another.",
  INSTRUMENT_DECLINED:
    "PayPal declined the test payment method. Stop here and ask the demo operator to review this checkout. Do not start another purchase without their approval.",
  verification_failed:
    "PayPal’s payment details did not match this checkout. The demo operator needs to review it. No verified purchase record was created.",
  checkout_expired:
    "This checkout has expired. No further payment collection will be requested.",
  capture_not_attempted:
    "No payment collection has been requested for this checkout. Checking its status cannot start a payment.",
  capture_failed:
    "PayPal reports that the test payment failed. No verified purchase record was created. Do not try to collect this payment again.",
  capture_declined:
    "PayPal reports that the test payment was declined. No verified purchase record was created. Do not try to collect this payment again.",
  sandbox_balance_confirmation_required:
    "This test is paused until sufficient available Sandbox USD balance is confirmed. No new order was created.",
  sandbox_test_not_authorized:
    "Only the single approved test in its originating browser is allowed. No additional order was created.",
  sandbox_test_price_changed:
    "The product price no longer matches the approved USD 129.00 test. No order was created. Stop here and ask the demo operator to review it.",
};
function message(code: string | null) {
  return code
    ? (errorMessages[code] ??
        "We could not confirm the payment. Check its status before starting another checkout.")
    : "";
}

export function BuyButton({
  productId,
  enabled,
  approvedRequestId,
  offerHash,
}: {
  productId: string;
  enabled: boolean;
  approvedRequestId?: string | null;
  offerHash?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(approvedRequestId ?? null);
  const router = useRouter();
  async function buy() {
    if (busy) return;
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/checkout/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          requestId: requestId.current,
          ...(offerHash ? { offerHash } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(message(data.error));
        return;
      }
      router.push(`/checkout/${data.id}`);
    } catch {
      setError(
        "Connection interrupted. Retry this same checkout so its saved order request is reused.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button className="w-full" onClick={buy} disabled={!enabled || busy}>
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <ArrowUpRight aria-hidden="true" />
        )}
        {busy ? "Preparing Sandbox checkout…" : "Start PayPal Sandbox checkout"}
      </Button>
      {error && (
        <p
          role="alert"
          aria-label="Checkout error"
          className="mt-3 text-sm leading-6"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function CheckoutControls({
  id,
  returned,
  cancelled,
}: {
  id: string;
  returned: boolean;
  cancelled: boolean;
}) {
  const [order, setOrder] = useState<CheckoutView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [deadlineReached, setDeadlineReached] = useState(false);
  const initialized = useRef(false);
  const router = useRouter();
  const expired = Boolean(
    order &&
    (order.state === "expired" || deadlineReached || checkoutHasExpired(order)),
  );

  useEffect(() => {
    if (!order) return;
    if (
      order.captureAttempted ||
      ["completed", "cancelled", "failed", "review"].includes(order.state)
    )
      return;
    const remaining = new Date(order.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    // This timer only removes stale controls. It never polls or sends a payment request.
    const timer = setTimeout(() => setDeadlineReached(true), remaining);
    return () => clearTimeout(timer);
  }, [order]);

  async function update(action?: "capture" | "reconcile" | "cancel" | "retry") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/checkout/orders/${id}${action ? `/${action}` : ""}`,
        action
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }
          : { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(message(data.error));
        return;
      }
      setOrder(data);
      setDeadlineReached(checkoutHasExpired(data));
      if (data.state === "completed" && data.twinId)
        router.replace(`/vault/${data.twinId}`);
      else if (data.error) setError(message(data.error));
      return data as CheckoutView;
    } catch {
      setError(
        "Connection interrupted. The payment is not confirmed; check its status again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void Promise.resolve().then(async () => {
      if (cancelled) await update("cancel");
      else {
        const current = await update();
        if (
          returned &&
          current &&
          !checkoutHasExpired(current) &&
          ["created", "capturing", "pending"].includes(current.state)
        )
          await update(current.captureAttempted ? "reconcile" : "capture");
      }
    });
    // Automatic reconciliation is deliberately one-shot, never a polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div
        role="status"
        className="rounded-2xl border bg-secondary p-5 text-sm leading-7 text-secondary-foreground"
      >
        {busy
          ? "Checking this checkout…"
          : expired
            ? "This checkout has expired. No further payment collection will be requested. You can return to Browse products."
            : order?.state === "completed"
              ? "PayPal Sandbox payment verified. Opening your saved purchase…"
              : order?.state === "cancelled"
                ? "Checkout cancelled. Pal Care did not request payment collection for this checkout."
                : order?.state === "created"
                  ? "Ready for approval on PayPal Sandbox. Payment has not been confirmed."
                  : order?.state === "pending" || order?.state === "capturing"
                    ? order.pendingReason === "ECHECK"
                      ? "PayPal says this test payment is waiting for its eCheck to clear. No verified purchase record exists yet. Use Check payment status for an update on this same payment; it will not be collected a second time, even after the checkout deadline."
                      : "Payment confirmation is pending. No verified purchase record exists yet. A status check looks up the original payment without collecting it again."
                    : order?.state === "create_unknown"
                      ? "We could not confirm whether PayPal created the test order. Retry the original order below; the same saved order request will be reused."
                      : order?.state === "failed"
                        ? order.error === "capture_declined"
                          ? "PayPal declined this Sandbox payment. No verified purchase record was created."
                          : "The Sandbox payment failed. No verified purchase record was created."
                        : order?.state === "review"
                          ? "The demo operator needs to review this checkout. It is not a verified purchase."
                          : "This checkout has not been verified."}
      </div>
      {error && (
        <p
          role="alert"
          aria-label="Checkout error"
          className="rounded-xl border bg-danger-surface p-4 text-sm leading-7 text-danger"
        >
          {error}
        </p>
      )}
      {!expired && !busy && order?.state === "created" && order.approvalUrl && (
        <Button asChild className="w-full">
          <a href={order.approvalUrl}>
            Continue to PayPal Sandbox
            <ArrowUpRight aria-hidden="true" />
          </a>
        </Button>
      )}
      {order &&
        !expired &&
        ![
          "completed",
          "cancelled",
          "failed",
          "review",
          "creating",
          "create_unknown",
        ].includes(order.state) && (
          <Button
            className="w-full"
            variant="outline"
            disabled={busy}
            onClick={() =>
              update(order.captureAttempted ? "reconcile" : "capture")
            }
          >
            {order.captureAttempted
              ? "Check payment status"
              : "Check or complete this Sandbox payment"}
          </Button>
        )}
      {!expired && order?.state === "created" && (
        <Button
          className="w-full"
          variant="ghost"
          disabled={busy}
          onClick={() => update("cancel")}
        >
          Cancel this checkout
        </Button>
      )}
      {!expired && order?.state === "create_unknown" && (
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => update("retry")}
        >
          Retry original order
        </Button>
      )}
      {!order && !busy && (
        <Button variant="outline" onClick={() => update()}>
          Check checkout status again
        </Button>
      )}
      <Link
        href="/shop"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
      >
        Back to Browse products
      </Link>
    </div>
  );
}
