import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { createDatabase } from "../../db/connection";
import {
  checkoutOrders,
  checkoutRateLimits,
  products,
  merchants,
  purchaseTwins,
  documents,
  careEvents,
  type CheckoutOrder,
} from "../../db/schema";
import { CUSTOMER_ID, MERCHANT_ID, demoData } from "../demo/fixtures";
import {
  CheckoutError,
  demoMerchantPolicy,
  productSnapshotSchema,
  startCheckoutSchema,
  IMMEDIATE_TEST_PRODUCT_ID,
  IMMEDIATE_TEST_AMOUNT_MINOR,
  type CheckoutView,
} from "./contracts";
import type { CheckoutConfig } from "./config";
import type { PayPalGateway } from "./paypal";
import { checkoutHasExpired } from "./expiry";
import { checkoutPromise, bindPromise } from "../price-guardian/checkout";
import {
  approvalLink,
  inspectCaptureStatus,
  inspectOrderCapture,
  minorToDecimal,
} from "./verification";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function takeRate(
  tx: Transaction,
  scope: string,
  limit: number,
  seconds: number,
) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const rows = await tx
    .insert(checkoutRateLimits)
    .values({ key: `${scope}:${bucket}`, count: 1 })
    .onConflictDoUpdate({
      target: checkoutRateLimits.key,
      set: { count: sql`${checkoutRateLimits.count} + 1` },
      setWhere: sql`${checkoutRateLimits.count} < ${limit}`,
    })
    .returning();
  if (!rows.length) throw new CheckoutError("demo_limit_reached", 429);
}

export class CheckoutService {
  constructor(
    private db: Database,
    private paypal: PayPalGateway,
    private config: Pick<
      CheckoutConfig,
      "origin" | "merchantId" | "immediateTest"
    > & { guardianPolicyEnabled?: boolean },
  ) {}

  async view(id: string, sessionHash: string): Promise<CheckoutView> {
    const [order] = await this.db
      .select()
      .from(checkoutOrders)
      .where(
        and(
          eq(checkoutOrders.id, id),
          eq(checkoutOrders.sessionHash, sessionHash),
        ),
      );
    if (!order) throw new CheckoutError("checkout_not_found", 404);
    const expired = checkoutHasExpired({
      ...order,
      captureAttempted: Boolean(order.captureAttemptedAt),
    });
    const [twin] = await this.db
      .select({ id: purchaseTwins.id })
      .from(purchaseTwins)
      .where(eq(purchaseTwins.checkoutOrderId, id));
    return {
      id,
      state: expired ? "expired" : order.state,
      product: order.product,
      approvalUrl:
        !expired && order.state === "created" ? order.approvalUrl : null,
      twinId: twin?.id ?? null,
      error: expired ? "checkout_expired" : order.lastError,
      expiresAt: new Date(order.expiresAt).toISOString(),
      captureAttempted: Boolean(order.captureAttemptedAt),
      captureStatus: order.captureStatus,
      pendingReason: order.capturePendingReason,
      captureCheckedAt: order.captureCheckedAt
        ? new Date(order.captureCheckedAt).toISOString()
        : null,
    };
  }

  async start(input: unknown, sessionHash: string) {
    const parsed = startCheckoutSchema.safeParse(input);
    if (!parsed.success) throw new CheckoutError("invalid_request", 400);
    const { productId, requestId, offerHash } = parsed.data;
    const id = await this.db.transaction(async (tx) => {
      // Small DB-only transaction. Never hold locks over a provider network call.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('palcare-checkout-create'))`,
      );
      const [existing] = await tx
        .select()
        .from(checkoutOrders)
        .where(
          and(
            eq(checkoutOrders.sessionHash, sessionHash),
            eq(checkoutOrders.requestId, requestId),
          ),
        );
      if (existing) {
        if (existing.productId !== productId)
          throw new CheckoutError("idempotency_conflict");
        return existing.id;
      }
      const [otherSession] = await tx
        .select({ id: checkoutOrders.id })
        .from(checkoutOrders)
        .where(eq(checkoutOrders.requestId, requestId));
      if (otherSession) throw new CheckoutError("checkout_session_lost");
      const immediateTest = this.config.immediateTest;
      if (immediateTest) {
        if (!immediateTest.balanceConfirmed)
          throw new CheckoutError("sandbox_balance_confirmation_required");
        if (
          requestId !== immediateTest.requestId ||
          sessionHash !== immediateTest.sessionHash ||
          productId !== IMMEDIATE_TEST_PRODUCT_ID
        )
          throw new CheckoutError("sandbox_test_not_authorized", 403);
      }
      if (!demoData.products.some((product) => product.id === productId))
        throw new CheckoutError("invalid_product", 400);
      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(eq(products.id, productId), eq(products.merchantId, MERCHANT_ID)),
        );
      const [merchant] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, MERCHANT_ID));
      const snapshot = productSnapshotSchema.safeParse({
        ...product,
        merchantName: merchant?.name,
      });
      if (!snapshot.success) throw new CheckoutError("invalid_product", 400);
      const promise = await checkoutPromise(
        tx,
        snapshot.data,
        this.config.guardianPolicyEnabled === true,
        offerHash,
      );
      if (
        immediateTest &&
        snapshot.data.priceMinor !== IMMEDIATE_TEST_AMOUNT_MINOR
      )
        throw new CheckoutError("sandbox_test_price_changed");
      await takeRate(tx, "create:global-hour", 10, 3600);
      await takeRate(tx, "create:global-day", 30, 86400);
      await takeRate(tx, `create:session:${sessionHash}`, 3, 3600);
      const id = randomUUID();
      await tx.insert(checkoutOrders).values({
        id,
        requestId,
        sessionHash,
        productId,
        product: snapshot.data,
        policy: promise ?? demoMerchantPolicy,
        ...(promise ? { createdAt: sql`clock_timestamp()` } : {}),
        paymentMethodPreference: immediateTest
          ? "IMMEDIATE_PAYMENT_REQUIRED"
          : null,
        returnOrigin: this.config.origin,
        expectedPayeeId: this.config.merchantId,
        amountMinor: snapshot.data.priceMinor,
        currency: "USD",
        createKey: randomUUID(),
        captureKey: randomUUID(),
        expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
      });
      if (promise) await bindPromise(tx, id);
      return id;
    });
    const current = await this.view(id, sessionHash);
    if (!["creating", "create_unknown"].includes(current.state)) return current;
    const lease = await this.claim(id, sessionHash);
    try {
      if (!["creating", "create_unknown"].includes(lease.order.state))
        return await this.view(id, sessionHash);
      if (Date.now() >= new Date(lease.order.expiresAt).getTime())
        throw new CheckoutError("checkout_expired");
      const created = approvalLink(await this.paypal.create(lease.order));
      await this.update(id, lease.token, {
        providerOrderId: created.id,
        approvalUrl: created.url,
        state: "created",
        lastError: null,
      });
    } catch (error) {
      await this.update(id, lease.token, {
        state:
          error instanceof CheckoutError && error.code === "verification_failed"
            ? "review"
            : "create_unknown",
        lastError:
          error instanceof CheckoutError ? error.code : "provider_unavailable",
      });
    } finally {
      await this.release(id, lease.token);
    }
    return this.view(id, sessionHash);
  }

  async retryCreation(id: string, sessionHash: string) {
    await this.view(id, sessionHash);
    const [order] = await this.db
      .select()
      .from(checkoutOrders)
      .where(eq(checkoutOrders.id, id));
    return this.start(
      { productId: order.productId, requestId: order.requestId },
      sessionHash,
    );
  }

  private async claim(id: string, sessionHash: string) {
    return this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(checkoutOrders)
        .where(eq(checkoutOrders.id, id))
        .for("update");
      if (!order || order.sessionHash !== sessionHash)
        throw new CheckoutError("checkout_not_found", 404);
      if (order.leaseUntil && new Date(order.leaseUntil).getTime() > Date.now())
        throw new CheckoutError("operation_in_progress");
      await takeRate(tx, "provider:global-hour", 120, 3600);
      await takeRate(tx, "provider:global-day", 300, 86400);
      await takeRate(tx, `provider:order:${id}`, 20, 3600);
      const token = randomUUID();
      await tx
        .update(checkoutOrders)
        .set({
          leaseToken: token,
          leaseUntil: new Date(Date.now() + 120_000).toISOString(),
        })
        .where(eq(checkoutOrders.id, id));
      return { order, token };
    });
  }
  private async update(
    id: string,
    token: string,
    values: Partial<typeof checkoutOrders.$inferInsert>,
  ) {
    const rows = await this.db
      .update(checkoutOrders)
      .set(values)
      .where(
        and(eq(checkoutOrders.id, id), eq(checkoutOrders.leaseToken, token)),
      )
      .returning({ id: checkoutOrders.id });
    if (!rows.length) throw new CheckoutError("operation_in_progress");
  }
  private async release(id: string, token: string) {
    await this.db
      .update(checkoutOrders)
      .set({ leaseToken: null, leaseUntil: null })
      .where(
        and(eq(checkoutOrders.id, id), eq(checkoutOrders.leaseToken, token)),
      );
  }

  async capture(id: string, sessionHash: string) {
    return this.processPayment(id, sessionHash, true);
  }

  // Read-only at PayPal: this action may persist checked status or finalize a
  // verified Twin locally, but must never create an order or dispatch capture.
  async reconcile(id: string, sessionHash: string) {
    return this.processPayment(id, sessionHash, false);
  }

  private async processPayment(
    id: string,
    sessionHash: string,
    allowFirstCapture: boolean,
  ) {
    const current = await this.view(id, sessionHash);
    if (
      ["completed", "cancelled", "failed", "review", "expired"].includes(
        current.state,
      )
    )
      return current;
    if (!allowFirstCapture && !current.captureAttempted)
      throw new CheckoutError("capture_not_attempted");
    const lease = await this.claim(id, sessionHash);
    const order = lease.order;
    let attempted = Boolean(order.captureAttemptedAt);
    try {
      if (["completed", "cancelled", "failed", "review"].includes(order.state))
        return await this.view(id, sessionHash);
      if (checkoutHasExpired({ ...order, captureAttempted: attempted }))
        return await this.view(id, sessionHash);
      if (!order.providerOrderId) throw new CheckoutError("order_not_created");
      if (!allowFirstCapture && !attempted)
        throw new CheckoutError("capture_not_attempted");
      let result = inspectOrderCapture(
        await this.paypal.retrieve(order.providerOrderId),
        order,
      );
      if (
        allowFirstCapture &&
        result.status === "APPROVED" &&
        !order.captureAttemptedAt &&
        !result.capture
      ) {
        if (Date.now() >= new Date(order.expiresAt).getTime())
          throw new CheckoutError("checkout_expired");
        // Persist BEFORE the money-changing request. If the process dies, future
        // requests only reconcile; they never issue an uncertain second capture.
        await this.update(id, lease.token, {
          state: "capturing",
          captureAttemptedAt: new Date().toISOString(),
        });
        attempted = true;
        await this.paypal.capture(order.providerOrderId, order.captureKey);
        result = inspectOrderCapture(
          await this.paypal.retrieve(order.providerOrderId),
          order,
        );
      }
      if (result.capture) {
        // Pin the Orders-validated identity even while funding is pending.
        // Subsequent checks cannot silently switch to a different capture.
        const captureId =
          order.observedCaptureId ??
          order.providerCaptureId ??
          result.capture.id;
        if (!order.observedCaptureId)
          await this.update(id, lease.token, { observedCaptureId: captureId });
        const observed = inspectCaptureStatus(
          await this.paypal.retrieveCapture(captureId),
          order,
          result.capture,
        );
        await this.update(id, lease.token, {
          captureStatus: observed.status,
          capturePendingReason: observed.pendingReason,
          captureCheckedAt: new Date().toISOString(),
        });
        if (
          result.capture.status === "COMPLETED" &&
          observed.status === "COMPLETED"
        )
          await this.finalize(order, lease.token, observed);
        else
          await this.update(id, lease.token, {
            state: ["FAILED", "DECLINED"].includes(observed.status)
              ? "failed"
              : "pending",
            lastError:
              observed.status === "FAILED"
                ? "capture_failed"
                : observed.status === "DECLINED"
                  ? "capture_declined"
                  : null,
          });
      } else
        await this.update(id, lease.token, {
          state:
            result.status === "VOIDED"
              ? "failed"
              : attempted ||
                  result.status === "PENDING" ||
                  result.status === "APPROVED"
                ? "pending"
                : "created",
          lastError: result.status === "VOIDED" ? "provider_voided" : null,
        });
    } catch (error) {
      const code =
        error instanceof CheckoutError ? error.code : "provider_unavailable";
      await this.update(id, lease.token, {
        state:
          code === "verification_failed"
            ? "review"
            : code === "INSTRUMENT_DECLINED"
              ? "failed"
              : "pending",
        lastError: code,
      });
    } finally {
      await this.release(id, lease.token);
    }
    return this.view(id, sessionHash);
  }

  async cancel(id: string, sessionHash: string) {
    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(checkoutOrders)
        .where(eq(checkoutOrders.id, id))
        .for("update");
      if (!order || order.sessionHash !== sessionHash)
        throw new CheckoutError("checkout_not_found", 404);
      if (
        order.captureAttemptedAt ||
        order.state === "completed" ||
        (order.leaseUntil && new Date(order.leaseUntil).getTime() > Date.now())
      )
        throw new CheckoutError("cannot_cancel_processing");
      if (!["created", "cancelled"].includes(order.state))
        throw new CheckoutError("cannot_cancel_processing");
      await tx
        .update(checkoutOrders)
        .set({ state: "cancelled", lastError: null })
        .where(eq(checkoutOrders.id, id));
    });
    return this.view(id, sessionHash);
  }

  private async finalize(
    order: CheckoutOrder,
    leaseToken: string,
    capture: { id: string; capturedAt: string },
  ) {
    await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(checkoutOrders)
        .where(eq(checkoutOrders.id, order.id))
        .for("update");
      if (locked.leaseToken !== leaseToken)
        throw new CheckoutError("operation_in_progress");
      if (locked.state === "completed") return;
      if (
        locked.observedCaptureId !== capture.id ||
        locked.captureStatus !== "COMPLETED"
      )
        throw new CheckoutError("verification_failed");
      const now = new Date().toISOString();
      await tx
        .update(checkoutOrders)
        .set({
          state: "completed",
          providerCaptureId: capture.id,
          captureStatus: "COMPLETED",
          capturePendingReason: null,
          captureCheckedAt: now,
          verifiedAt: now,
          capturedAt: capture.capturedAt,
          lastError: null,
        })
        .where(eq(checkoutOrders.id, order.id));
      const twinId = randomUUID();
      const date = capture.capturedAt.slice(0, 10);
      await tx.insert(purchaseTwins).values({
        id: twinId,
        customerId: CUSTOMER_ID,
        merchantId: MERCHANT_ID,
        productId: order.productId,
        purchasedOn: date,
        purchasePriceMinor: order.amountMinor,
        currency: "USD",
        origin: "sandbox",
        checkoutOrderId: order.id,
        paypalOrderId: order.providerOrderId,
        paypalCaptureId: capture.id,
        productSnapshot: order.product,
        verifiedAt: now,
      });
      await tx.insert(documents).values([
        {
          id: randomUUID(),
          twinId,
          kind: "receipt",
          origin: "sandbox",
          title: `${order.product.name} · sandbox receipt`.slice(0, 120),
          content: `PAL CARE — VERIFIED PAYPAL SANDBOX RECEIPT\nFictional product: ${order.product.brand} ${order.product.name} (${order.product.model})\nDemo merchant: ${order.product.merchantName}\nSandbox total: USD ${minorToDecimal(order.amountMinor)}\nPayPal Sandbox order: ${order.providerOrderId}\nPayPal Sandbox capture: ${capture.id}\nCapture timestamp: ${capture.capturedAt}\nServer verified: ${now}\n\nGenerated by Pal Care from a retrieved, validated PayPal Sandbox capture. Simulated money only; not a real-money receipt, tax invoice, warranty or insurance. No payer identity is stored.`,
        },
        {
          id: randomUUID(),
          twinId,
          kind: "policy",
          origin: "sample",
          title: order.policy.title,
          content: order.policy.content,
        },
      ]);
      const sampleTwin = demoData.twins.find(
        (twin) => twin.productId === order.productId,
      );
      const suppliedCareCards = demoData.documents.filter(
        (doc) => doc.twinId === sampleTwin?.id && doc.kind === "care-card",
      );
      for (const doc of suppliedCareCards)
        await tx.insert(documents).values({ ...doc, id: randomUUID(), twinId });
      await tx.insert(careEvents).values({
        id: randomUUID(),
        twinId,
        kind: "purchase",
        origin: "sandbox",
        occurredOn: date,
        title: "PayPal Sandbox payment verified",
        description: `A completed USD ${minorToDecimal(order.amountMinor)} sandbox capture was retrieved and validated on the server. Your Purchase Twin was created automatically. No real money or customer identity is stored.`,
      });
    });
  }
}
