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
    "The displayed price promise or price changed. Reload the shop and review the current terms before buying. No new order was created.",
  guardian_policy_unavailable:
    "The new merchant policy is not active. No covered checkout was created.",
  checkout_unavailable:
    "Sandbox checkout is unavailable. No payment is marked complete.",
  operation_in_progress:
    "This checkout is already processing. Wait a moment, then check its status.",
  demo_limit_reached:
    "The demo's safety limit has been reached. Please try again later.",
  checkout_not_found:
    "This checkout is not available in this browser. Return to the catalog.",
  checkout_session_lost:
    "This request belongs to a different or lost browser session. No new order was created. Investigate the original checkout before starting another.",
  INSTRUMENT_DECLINED:
    "PayPal declined the sandbox funding source. Stop and review this checkout; do not start another purchase without operator approval.",
  verification_failed:
    "The PayPal response did not match the saved purchase. This checkout needs operator review; no verified Purchase Twin was created.",
  checkout_expired:
    "This checkout has expired. No additional capture will be requested.",
  capture_not_attempted:
    "No capture has been requested for this checkout. Status reconciliation cannot start a payment.",
  capture_failed:
    "PayPal reports that the existing capture failed. No verified Purchase Twin was created. Do not repeat capture.",
  capture_declined:
    "PayPal reports that the existing capture was declined. No verified Purchase Twin was created. Do not repeat capture.",
  sandbox_balance_confirmation_required:
    "This test is paused until sufficient available Sandbox USD balance is confirmed. No new order was created.",
  sandbox_test_not_authorized:
    "Only the single approved test in its originating browser is allowed. No additional order was created.",
  sandbox_test_price_changed:
    "The catalog price no longer matches the approved USD 129.00 test. No order was created; stop for operator review.",
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
        "Connection interrupted. Retry this same checkout; its request identifier is retained.",
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
        {busy ? "Preparing sandbox checkout…" : "Buy with PayPal Sandbox"}
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
            ? "This checkout has expired. No additional capture will be requested. Return to the catalog when you are ready for a new checkout."
            : order?.state === "completed"
              ? "PayPal Sandbox capture verified. Opening your Purchase Twin…"
              : order?.state === "cancelled"
                ? "Checkout cancelled. Pal Care did not request a capture for this checkout."
                : order?.state === "created"
                  ? "Ready for buyer approval. No completed payment has been verified."
                  : order?.state === "pending" || order?.state === "capturing"
                    ? order.pendingReason === "ECHECK"
                      ? "PayPal reports the existing capture is pending eCheck clearance (ECHECK). No verified Purchase Twin exists yet. Check payment status to retrieve this same capture; no second capture will be sent, even after the original checkout deadline."
                      : "Payment confirmation is pending. No verified Purchase Twin exists yet. A status check will reconcile the original capture, not send a second one."
                    : order?.state === "create_unknown"
                      ? "PayPal order creation could not be confirmed. Retry the original order creation below; its saved request identifier will be reused."
                      : order?.state === "failed"
                        ? order.error === "capture_declined"
                          ? "PayPal declined the existing sandbox capture. No verified Purchase Twin was created."
                          : "The sandbox payment failed. No verified Purchase Twin was created."
                        : order?.state === "review"
                          ? "This checkout needs operator review. It is not a verified purchase."
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
              : "Check / complete this sandbox payment"}
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
          Retry original order creation
        </Button>
      )}
      {!order && !busy && (
        <Button variant="outline" onClick={() => update()}>
          Retry status lookup
        </Button>
      )}
      <Link
        href="/shop"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
      >
        Back to demo catalog
      </Link>
    </div>
  );
}
