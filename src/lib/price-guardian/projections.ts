import type { Pool } from "pg";
import {
  caseStateSchema,
  type GuardianOverview,
  type GuardianView,
} from "./contracts";
import { CUSTOMER_ID, MERCHANT_ID } from "./policy";

export function emptyOverview(): GuardianOverview {
  return {
    cases: [],
    monitoring: { lastCheck: null, scheduled: false },
    analytics: {
      opportunities: 0,
      proposedMinor: 0,
      approvedMinor: 0,
      pendingMinor: 0,
      unresolvedMinor: 0,
      verifiedMinor: 0,
      verifiedCount: 0,
      failedCount: 0,
    },
  };
}
export function summarize(cases: GuardianView[]) {
  const total = emptyOverview().analytics;
  total.opportunities = cases.length;
  for (const c of cases) {
    if (c.state === "awaiting_approval") total.proposedMinor += c.amountMinor;
    if (c.state === "approved") total.approvedMinor += c.amountMinor;
    if (c.state === "pending" && c.providerStatus === "PENDING")
      total.pendingMinor += c.amountMinor;
    if (["submitting", "unknown", "review"].includes(c.state))
      total.unresolvedMinor += c.amountMinor;
    if (
      c.state === "completed" &&
      c.providerStatus === "COMPLETED" &&
      c.verifiedAt &&
      c.refundId
    ) {
      total.verifiedMinor += c.amountMinor;
      total.verifiedCount++;
    }
    if (["failed", "cancelled"].includes(c.state)) total.failedCount++;
  }
  return total;
}
export async function readGuardian(
  pool: Pool,
  scheduled = false,
  scope: { twinId?: string; caseId?: string } = {},
): Promise<GuardianOverview> {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const rows = await client.query(
      "select c.*,t.product_snapshot,p.version,p.terms,e.origin as price_origin,e.observed_at,r.refund_id,r.provider_status,r.verified_at,r.state as refund_state,r.attempted_at,r.checked_at,(select max(a.approved_at) from guardian_approvals a where a.case_id=c.id and a.revision=c.revision) as approved_at,(select max(a.expires_at) from guardian_approvals a where a.case_id=c.id and a.revision=c.revision) as approval_expires_at from guardian_cases c join purchase_twins t on t.id=c.twin_id join guardian_policies p on p.id=c.policy_id join guardian_prices e on e.id=c.price_event_id left join guardian_refunds r on r.case_id=c.id where t.customer_id=$1 and t.merchant_id=$2 and t.origin='sandbox' and ($3::uuid is null or t.id=$3) and ($4::uuid is null or c.id=$4) order by c.created_at desc,c.id limit 500",
      [CUSTOMER_ID, MERCHANT_ID, scope.twinId ?? null, scope.caseId ?? null],
    );
    const events = rows.rows.length
      ? await client.query(
          "select id,case_id,kind,detail,created_at from guardian_events where case_id=any($1::uuid[]) order by created_at,id",
          [rows.rows.map((r) => r.id)],
        )
      : { rows: [] };
    const check = (
      await client.query(
        "select last_check from guardian_checks where key='catalog'",
      )
    ).rows[0];
    const cases = rows.rows.map((row): GuardianView => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      approvedAt: row.approved_at?.toISOString() ?? null,
      approvalExpiresAt: row.approval_expires_at?.toISOString() ?? null,
      attemptedAt: row.attempted_at?.toISOString() ?? null,
      checkedAt: row.checked_at?.toISOString() ?? null,
      twinId: row.twin_id,
      productName: row.product_snapshot.name,
      state:
        row.state === "completed" &&
        !(
          row.refund_state === "completed" &&
          row.provider_status === "COMPLETED" &&
          row.verified_at &&
          row.refund_id
        )
          ? "review"
          : ["awaiting_approval", "approved"].includes(row.state) &&
              row.expires_at.getTime() <= Date.now()
            ? "expired"
            : row.state === "approved" &&
                (!row.approval_expires_at ||
                  row.approval_expires_at.getTime() <= Date.now())
              ? "awaiting_approval"
              : caseStateSchema.parse(row.state),
      revision: row.revision,
      originalMinor: row.original_minor,
      comparedMinor: row.compared_minor,
      amountMinor: row.amount_minor,
      policyVersion: row.version,
      policyHash: row.policy_hash,
      policyTerms: row.terms,
      priceOrigin: row.price_origin,
      priceObservedAt: row.observed_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      reason:
        row.state === "approved" &&
        (!row.approval_expires_at ||
          row.approval_expires_at.getTime() <= Date.now())
          ? "approval_expired"
          : row.reason,
      refundId: row.refund_id ?? null,
      providerStatus: row.provider_status ?? null,
      verifiedAt: row.verified_at?.toISOString() ?? null,
      history: events.rows
        .filter((e) => e.case_id === row.id)
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          at: e.created_at.toISOString(),
          detail: e.detail,
        })),
    }));
    // Aggregate all scoped cases, not the bounded public detail window or event rows.
    const totals = (
      await client.query(
        `select count(*)::int as opportunities,
      coalesce(sum(c.amount_minor) filter(where (c.state='awaiting_approval' or (c.state='approved' and not exists(select 1 from guardian_approvals a where a.case_id=c.id and a.revision=c.revision and a.expires_at>now()))) and c.expires_at>now()),0)::int as "proposedMinor",
      coalesce(sum(c.amount_minor) filter(where c.state='approved' and c.expires_at>now() and exists(select 1 from guardian_approvals a where a.case_id=c.id and a.revision=c.revision and a.expires_at>now())),0)::int as "approvedMinor",
      coalesce(sum(c.amount_minor) filter(where c.state='pending' and r.provider_status='PENDING'),0)::int as "pendingMinor",
      coalesce(sum(c.amount_minor) filter(where c.state in ('submitting','unknown','review') or (c.state='completed' and (r.verified_at is null or r.state<>'completed' or r.provider_status<>'COMPLETED'))),0)::int as "unresolvedMinor",
      coalesce(sum(r.amount_minor) filter(where c.state='completed' and r.state='completed' and r.provider_status='COMPLETED' and r.verified_at is not null and r.refund_id is not null),0)::int as "verifiedMinor",
      count(*) filter(where c.state='completed' and r.state='completed' and r.provider_status='COMPLETED' and r.verified_at is not null and r.refund_id is not null)::int as "verifiedCount",
      count(*) filter(where c.state in ('failed','cancelled'))::int as "failedCount"
      from guardian_cases c join purchase_twins t on t.id=c.twin_id left join guardian_refunds r on r.case_id=c.id where t.origin='sandbox' and t.customer_id=$1 and t.merchant_id=$2`,
        [CUSTOMER_ID, MERCHANT_ID],
      )
    ).rows[0];
    await client.query("commit");
    return {
      cases,
      monitoring: {
        lastCheck: check?.last_check?.toISOString() ?? null,
        scheduled,
      },
      analytics: totals,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
