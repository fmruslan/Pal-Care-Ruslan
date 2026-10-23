import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { assertDatabaseAuthority } from "../../db/authority";
import type { createDatabase } from "../../db/connection";
import { checkoutOrders, type CheckoutOrder } from "../../db/schema";
import { GuardianError, type GuardianCase } from "../price-guardian/contracts";
import { transaction, counter, event } from "../price-guardian/database";
import { authorize } from "../operator/service";
import {
  GUARDIAN_PRODUCT,
  MERCHANT_ID,
  CUSTOMER_ID,
  guardianPolicyHash,
  hash,
} from "../price-guardian/policy";
import { inspectPaymentLifecycle } from "./verification";
import {
  discoverRefund,
  inspectRefund,
  returnedRefundId,
} from "./refund-verification";
import {
  refundBody,
  type RefundGateway,
  type RefundScope,
} from "./refund-contracts";

type Database = ReturnType<typeof createDatabase>["db"];
type Operation = {
  id: string;
  case_id: string;
  capture_id: string;
  request_key: string;
  payload_hash: string;
  amount_minor: number;
  attempted_at: Date;
  refund_id: string | null;
  state: string;
};
export class RefundService {
  constructor(
    private db: Database,
    private pool: Pool,
    private gateway: RefundGateway,
    private scope: RefundScope,
  ) {}
  private async context(caseId: string) {
    if (this.scope.restrictedWriter) {
      try {
        await assertDatabaseAuthority(this.pool, "guardian");
      } catch {
        throw new GuardianError("guardian_writer_not_restricted", 503);
      }
    }
    const result = await this.pool.query(
      "select c.*,t.checkout_order_id from guardian_cases c join purchase_twins t on t.id=c.twin_id join guardian_bindings b on b.checkout_order_id=t.checkout_order_id where c.id=$1 and t.origin='sandbox' and t.customer_id=$2 and t.merchant_id=$3 and t.product_id=$4 and t.paypal_capture_id=c.capture_id and b.policy_hash=c.policy_hash",
      [caseId, CUSTOMER_ID, MERCHANT_ID, GUARDIAN_PRODUCT],
    );
    const row = result.rows[0] as
      (GuardianCase & { checkout_order_id: string }) | undefined;
    if (!row) throw new GuardianError("guardian_not_found", 404);
    const [order] = await this.db
      .select()
      .from(checkoutOrders)
      .where(eq(checkoutOrders.id, row.checkout_order_id));
    if (
      !order ||
      order.state !== "completed" ||
      order.policy.version !== "demo-price-v2" ||
      row.policy_hash !== guardianPolicyHash ||
      order.providerCaptureId !== row.capture_id ||
      row.original_minor !== order.amountMinor
    )
      throw new GuardianError("guardian_purchase_evidence_invalid");
    if (
      !this.scope.readsEnabled ||
      this.scope.caseId !== row.id ||
      this.scope.captureId !== row.capture_id ||
      this.scope.merchantId !== order.expectedPayeeId
    )
      throw new GuardianError("guardian_provider_scope_disabled", 503);
    return { row, order };
  }
  private async claim(
    session: string | null,
    row: GuardianCase,
    action: "refund:execute" | "refund:reconcile",
  ) {
    return transaction(this.pool, async (client) => {
      if (session) await authorize(client, session, action, row.id);
      const c = (
        await client.query(
          "select * from guardian_cases where id=$1 for update",
          [row.id],
        )
      ).rows[0] as GuardianCase;
      if (c.lease_until && c.lease_until.getTime() > Date.now())
        throw new GuardianError("guardian_operation_in_progress");
      await counter(
        client,
        `provider:case:${c.id}:${Math.floor(Date.now() / 3600000)}`,
        1,
        20,
      );
      await counter(
        client,
        `provider:hour:${Math.floor(Date.now() / 3600000)}`,
        1,
        120,
      );
      await counter(
        client,
        `provider:day:${Math.floor(Date.now() / 86400000)}`,
        1,
        300,
      );
      const token = randomUUID();
      await client.query(
        "update guardian_cases set lease_token=$2,lease_until=now()+interval '3 minutes' where id=$1",
        [c.id, token],
      );
      return token;
    });
  }
  private async release(caseId: string, token: string) {
    await this.pool.query(
      "update guardian_cases set lease_token=null,lease_until=null where id=$1 and lease_token=$2",
      [caseId, token],
    );
  }
  private async lifecycle(order: CheckoutOrder) {
    const orderEvidence = await this.gateway.retrieve(order.providerOrderId!);
    const captureEvidence = await this.gateway.retrieveCapture(
      order.providerCaptureId!,
    );
    return inspectPaymentLifecycle(orderEvidence, captureEvidence, order);
  }
  async execute(session: string, caseId: string, revision: number) {
    // This guard precedes all provider access, including preflight reads.
    if (
      !this.scope.enabled ||
      !this.scope.readsEnabled ||
      !this.scope.experimentId
    )
      throw new GuardianError("guardian_refunds_disabled", 503);
    const { row, order } = await this.context(caseId);
    const token = await this.claim(session, row, "refund:execute");
    let operation: Operation | null = null;
    let dispatchDeadline = 0;
    try {
      const existing = (
        await this.pool.query(
          "select * from guardian_refunds where case_id=$1",
          [caseId],
        )
      ).rows[0];
      if (existing)
        return {
          operationId: existing.id as string,
          state: existing.state as string,
        };
      const life = await this.lifecycle(order);
      // First-release scope is an isolated new capture with no prior refunds.
      // Absent optional refund arrays do NOT establish an external pending balance;
      // PayPal remains the final amount-limit authority. Any observed prior refund blocks.
      if (life.captureStatus !== "COMPLETED" || (life.refunds?.length ?? 0) > 0)
        throw new GuardianError("guardian_prior_refund_or_uncertain_balance");
      operation = await transaction(this.pool, async (client) => {
        const actor = await authorize(
          client,
          session,
          "refund:execute",
          caseId,
        );
        const c = (
          await client.query(
            "select * from guardian_cases where id=$1 for update",
            [caseId],
          )
        ).rows[0] as GuardianCase;
        const approval = (
          await client.query(
            "select * from guardian_approvals where case_id=$1 and revision=$2 and expires_at>now() order by approved_at desc limit 1",
            [caseId, revision],
          )
        ).rows[0];
        const currentPrice = (
          await client.query(
            "select p.price_minor,e.id from products p join lateral (select id from guardian_prices where product_id=p.id order by sequence desc limit 1) e on true where p.id=$1 for share of p",
            [GUARDIAN_PRODUCT],
          )
        ).rows[0];
        if (
          c.lease_token !== token ||
          c.revision !== revision ||
          c.state !== "approved" ||
          c.expires_at.getTime() <= Date.now() ||
          !approval ||
          approval.amount_minor !== c.amount_minor ||
          approval.policy_hash !== c.policy_hash ||
          approval.price_event_id !== c.price_event_id ||
          currentPrice?.id !== c.price_event_id ||
          currentPrice.price_minor !== c.compared_minor
        )
          throw new GuardianError("guardian_approval_stale");
        dispatchDeadline = Math.min(
          c.expires_at.getTime(),
          approval.expires_at.getTime(),
          c.lease_until!.getTime(),
        );
        await counter(
          client,
          `refund:experiment:${this.scope.experimentId}`,
          c.amount_minor,
          2000,
        );
        await counter(
          client,
          `refund:dispatch:${Math.floor(Date.now() / 86400000)}`,
          1,
          1,
        );
        const id = randomUUID(),
          key = randomUUID();
        const created = await client.query(
          "insert into guardian_refunds(id,case_id,capture_id,approval_id,request_key,payload_hash,amount_minor,experiment_id,attempted_at,state) values($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),'submitting') returning *",
          [
            id,
            caseId,
            c.capture_id,
            approval.id,
            key,
            hash(refundBody(key, c.amount_minor)),
            c.amount_minor,
            this.scope.experimentId,
          ],
        );
        await client.query(
          "update guardian_cases set state='submitting',updated_at=clock_timestamp() where id=$1",
          [caseId],
        );
        await event(
          client,
          `refund:${id}:attempt`,
          caseId,
          "refund.attempted",
          actor,
          "Refund intent and permanent idempotency key persisted before dispatch. Outcome not yet verified.",
          id,
        );
        return created.rows[0] as Operation;
      });
      if (Date.now() >= dispatchDeadline)
        throw new GuardianError("guardian_dispatch_deadline_passed");
      const payload = await this.gateway.refund(
        operation.capture_id,
        operation.request_key,
        operation.amount_minor,
      );
      const id = returnedRefundId(payload);
      await this.pool.query(
        "update guardian_refunds set refund_id=$2 where id=$1 and refund_id is null",
        [operation.id, id],
      );
      operation.refund_id = id;
      await this.verify(row, order, operation, token);
      return {
        operationId: operation.id,
        state: "submitted_check_saved_status",
      };
    } catch (error) {
      if (operation) {
        await transaction(this.pool, async (client) => {
          const lease = (
            await client.query(
              "select lease_token from guardian_cases where id=$1 for update",
              [caseId],
            )
          ).rows[0];
          if (lease?.lease_token !== token) return;
          await client.query(
            "update guardian_refunds set state='unknown',checked_at=clock_timestamp() where id=$1 and state<>'completed'",
            [operation!.id],
          );
          await client.query(
            "update guardian_cases set state='unknown',reason='provider_result_unconfirmed',updated_at=clock_timestamp() where id=$1 and state<>'completed'",
            [caseId],
          );
          await event(
            client,
            `refund:${operation!.id}:unknown`,
            caseId,
            "refund.unresolved",
            "refund-service",
            "No independently verified outcome. Amount remains reserved; another refund is blocked.",
            operation!.id,
          );
        });
        return { operationId: operation.id, state: "unknown" };
      }
      throw error;
    } finally {
      await this.release(caseId, token);
    }
  }
  private async verify(
    row: GuardianCase,
    order: CheckoutOrder,
    operation: Operation,
    token: string,
  ) {
    const life = await this.lifecycle(order);
    let refundId = operation.refund_id;
    let recovery = "known_refund_id";
    if (!refundId) {
      const discovered = discoverRefund(life.refunds, operation.request_key);
      refundId = discovered.id;
      recovery = discovered.observation;
      if (!refundId) {
        await transaction(this.pool, async (client) => {
          const locked = (
            await client.query(
              "select lease_token from guardian_cases where id=$1 for update",
              [row.id],
            )
          ).rows[0];
          if (locked?.lease_token !== token)
            throw new GuardianError("guardian_operation_in_progress");
          await client.query(
            "update guardian_refunds set state='unknown',recovery_observation=$2,checked_at=clock_timestamp() where id=$1 and state<>'completed'",
            [operation.id, recovery],
          );
          await client.query(
            "update guardian_cases set state='unknown',reason=$2,updated_at=clock_timestamp() where id=$1 and state<>'completed'",
            [row.id, recovery],
          );
          await event(
            client,
            `refund:${operation.id}:recovery:${recovery}`,
            row.id,
            "refund.recovery_blocked",
            "provider-retrieval",
            `Retrieval-only recovery blocked: ${recovery}. Reservation and original request key remain unchanged.`,
            operation.id,
          );
        });
        return;
      }
    }
    const result = inspectRefund(await this.gateway.retrieveRefund(refundId), {
      refundId,
      captureId: operation.capture_id,
      requestKey: operation.request_key,
      amountMinor: operation.amount_minor,
      attemptedAt: operation.attempted_at,
      merchantId: order.expectedPayeeId,
    });
    const state =
      result.status === "COMPLETED"
        ? life.captureStatus === "PARTIALLY_REFUNDED"
          ? "completed"
          : "review"
        : result.status.toLowerCase();
    await transaction(this.pool, async (client) => {
      const locked = (
        await client.query(
          "select lease_token from guardian_cases where id=$1 for update",
          [row.id],
        )
      ).rows[0];
      if (locked?.lease_token !== token)
        throw new GuardianError("guardian_operation_in_progress");
      const previous = (
        await client.query(
          "select * from guardian_refunds where id=$1 for update",
          [operation.id],
        )
      ).rows[0];
      if (previous.state === "completed") return;
      if (previous.refund_id && previous.refund_id !== result.id)
        throw new GuardianError("guardian_refund_identity_changed");
      if (
        previous.payload_hash !==
        hash(refundBody(previous.request_key, previous.amount_minor))
      )
        throw new GuardianError("guardian_refund_payload_changed");
      await client.query(
        "update guardian_refunds set refund_id=$2,provider_status=$3,state=$4,checked_at=clock_timestamp(),verified_at=case when $4='completed' then clock_timestamp() else null end,recovery_observation=$5 where id=$1",
        [operation.id, result.id, result.status, state, recovery],
      );
      await client.query(
        "update guardian_cases set state=$2,reason=$3,updated_at=clock_timestamp() where id=$1",
        [
          row.id,
          state,
          state === "review"
            ? "capture_refund_status_inconsistent"
            : `refund_${state}`,
        ],
      );
      await event(
        client,
        `refund:${operation.id}:${state}`,
        row.id,
        `refund.${state}`,
        "provider-retrieval",
        state === "completed"
          ? `USD ${(operation.amount_minor / 100).toFixed(2)} refund independently verified from PayPal Sandbox; original receipt unchanged.`
          : `PayPal refund status ${result.status}; ${state === "review" ? "capture evidence requires review" : "not a completed refund"}.`,
        operation.id,
      );
    });
  }
  async reconcile(session: string | null, caseId: string) {
    const { row, order } = await this.context(caseId);
    const token = await this.claim(session, row, "refund:reconcile");
    try {
      const operation = (
        await this.pool.query(
          "select * from guardian_refunds where case_id=$1",
          [caseId],
        )
      ).rows[0] as Operation | undefined;
      if (!operation) throw new GuardianError("guardian_refund_not_attempted");
      if (["completed", "failed", "cancelled"].includes(operation.state))
        return { state: operation.state };
      await this.verify(row, order, operation, token);
      return { state: "checked_saved_status" };
    } finally {
      await this.release(caseId, token);
    }
  }
}
