import { createHash } from "node:crypto";
import { z } from "zod";
import { CareError } from "./contracts";
import { campaignBudget } from "./campaign-execution";
import {
  RECOVERY_EVALUATION,
  RECOVERY_SESSION,
  recoveryHash,
} from "./evaluation-recovery";
import type { OwnerState } from "./standing-owner";
import type { Registration } from "./subscription/files";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
/** An additive owner policy, not another allowance or browser credential.
 * Historical grant/deadline/recovery bytes remain separate and unchanged. */
export const quotaCampaignSchema = z.strictObject({
  version: z.literal(1),
  campaignId: z.literal(RECOVERY_EVALUATION),
  ownerApprovalHash: digest,
  approvedAt: z.number().int().nonnegative(),
  calendarExpiresAt: z.null(),
  baselineUsed: z.literal(63),
  executionLimit: z.literal(150),
  maxAdditional: z.literal(87),
  scope: z.literal("customer-records-care-native-insights"),
  concurrency: z.literal(1),
  maxRetries: z.literal(0),
  policyHash: digest,
  historicalEvaluationHash: digest,
  historicalRecoveryRawHash: digest,
  historicalEventCount: z.literal(785),
  historicalEventHash: digest,
  originalSessionHash: digest,
  recordsOwnerDigest: digest,
  agentHash: digest,
  providerIdentityHash: digest,
});
export type QuotaCampaign = z.infer<typeof quotaCampaignSchema>;
export function subscriptionIdentityHash(registration: Registration | null) {
  if (!registration)
    throw new CareError("careos_owner_provider_identity_denied", 403);
  return createHash("sha256")
    .update(
      JSON.stringify({
        clientId: registration.clientId,
        subject: registration.subject ?? null,
      }),
    )
    .digest("hex");
}
export function assertQuotaCampaignIntegrity(
  state: OwnerState,
  recoveryRawHash: string | undefined,
  now: number,
  installing = false,
) {
  const q = state.quotaCampaign;
  const original = state.sessions.find((s) => s.id === RECOVERY_SESSION);
  const prefix = state.events.slice(0, q?.historicalEventCount ?? 0);
  if (
    !q ||
    !original?.revoked ||
    q.approvedAt > now ||
    prefix.length !== q.historicalEventCount ||
    prefix.some((e) => e.at > q.approvedAt) ||
    recoveryHash(prefix) !== q.historicalEventHash ||
    recoveryHash(state.policy) !== q.policyHash ||
    recoveryHash(state.evaluation) !== q.historicalEvaluationHash ||
    recoveryHash(original) !== q.originalSessionHash ||
    recoveryRawHash !== q.historicalRecoveryRawHash ||
    state.evaluation?.id !== RECOVERY_EVALUATION ||
    state.events
      .slice(q.historicalEventCount)
      .some(
        (e) =>
          e.allocationId === RECOVERY_EVALUATION &&
          (e.at < q.approvedAt || e.at > now),
      ) ||
    state.events.some((e) =>
      ["revoke-policy", "provider-block", "revoke-quota-campaign"].includes(
        e.kind,
      ),
    )
  )
    throw new CareError("careos_owner_quota_campaign_denied", 403);
  const approvals = state.events.filter(
    (e) => e.kind === "approve-quota-campaign",
  );
  if (
    installing
      ? approvals.length !== 0
      : approvals.length !== 1 ||
        approvals[0].subject !== recoveryHash(q) ||
        approvals[0].allocationId !== RECOVERY_EVALUATION ||
        approvals[0].at < q.approvedAt
  )
    throw new CareError("careos_owner_quota_campaign_denied", 403);
  const historical = prefix.filter(
    (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
  );
  if (
    historical.length !== 63 ||
    new Set(historical.map((e) => e.subject)).size !== 63 ||
    historical.some((e) => {
      const ends = prefix.filter(
        (v) =>
          v.subject === e.subject &&
          ["completed", "failed", "unknown"].includes(v.kind),
      );
      return (
        ends.length !== 1 ||
        ends[0].kind !== "completed" ||
        ends[0].observation?.httpStatus !== 200
      );
    })
  )
    throw new CareError("careos_owner_quota_campaign_accounting_denied", 403);
  const budget = campaignBudget(state.events);
  if (
    budget.used > 150 ||
    (installing && (budget.used !== 63 || budget.activeQuestion))
  )
    throw new CareError("careos_owner_quota_campaign_accounting_denied", 403);
  return q;
}
