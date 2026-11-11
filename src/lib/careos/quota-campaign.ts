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
import {
  providerRecoveryContext,
  providerRecoveryPhase,
} from "./provider-failure-recovery";

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
  executionLimit: z.literal(163),
  maxAdditional: z.literal(100),
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
/** One exact amendment, not a renewable allowance or replacement policy. */
export const quotaCampaignExtensionSchema = z.strictObject({
  version: z.literal(1),
  campaignId: z.literal(RECOVERY_EVALUATION),
  approvedAt: z.number().int().nonnegative(),
  ownerApprovalHash: digest,
  calendarExpiresAt: z.null(),
  baselineUsed: z.literal(163),
  executionLimit: z.literal(263),
  maxAdditional: z.literal(100),
  previousAuthorizationHash: digest,
  checkpointEventCount: z.number().int().positive(),
  checkpointEventHash: digest,
});
export type QuotaCampaignExtension = z.infer<
  typeof quotaCampaignExtensionSchema
>;

/** Owner's separately confirmed 300 NEW attempts, never a reset of 263 spent. */
export const northGuideCampaignSchema = z.strictObject({
  version: z.literal(1),
  campaignId: z.literal(RECOVERY_EVALUATION),
  approvedAt: z.number().int().nonnegative(),
  ownerApprovalHash: digest,
  calendarExpiresAt: z.null(),
  baselineUsed: z.literal(263),
  executionLimit: z.literal(563),
  maxAdditional: z.literal(300),
  purpose: z.literal("north-current-interface-guidance-300"),
  previousAuthorizationHash: digest,
  checkpointEventCount: z.number().int().positive(),
  checkpointEventHash: digest,
});

/** One separately approved empty namespace, never a history/allowance reset. */
export const northGuideRecordsBindingSchema = z.strictObject({
  version: z.literal(1),
  campaignId: z.literal(RECOVERY_EVALUATION),
  ownerApprovalHash: digest,
  approvedAt: z.number().int().nonnegative(),
  purpose: z.literal("north-guide-fresh-empty-records-session"),
  guideAuthorizationHash: digest,
  previousRecordsOwnerDigest: digest,
  recordsOwnerDigest: digest,
  agentHash: digest,
  providerIdentityHash: digest,
  emptyConversationId: z.uuid(),
  checkpointEventCount: z.number().int().positive(),
  checkpointEventHash: digest,
  checkpointCampaignSessionsHash: digest,
});

export function campaignSessionsAtCheckpoint(
  state: OwnerState,
  prefix: OwnerState["events"],
) {
  return state.sessions.filter(
    (entry) =>
      entry.id === state.evaluation?.sessionId ||
      (entry.allocationId === RECOVERY_EVALUATION &&
        prefix.some((e) => e.kind === "pair" && e.subject === entry.id)),
  );
}

export function assertNorthGuideRecordsBindingIntegrity(
  state: OwnerState,
  now: number,
  installing = false,
) {
  const x = state.northGuideRecordsBinding;
  const approvals = state.events.filter(
    (e) => e.kind === "approve-north-guide-records-binding",
  );
  if (!x && !approvals.length) return undefined;
  const q = state.quotaCampaign,
    guide = state.northGuideCampaign;
  const prefix = state.events.slice(0, x?.checkpointEventCount ?? 0);
  const budget = campaignBudget(prefix);
  const prior = campaignSessionsAtCheckpoint(state, prefix);
  if (
    !x ||
    !q ||
    !guide ||
    x.guideAuthorizationHash !== recoveryHash(guide) ||
    x.previousRecordsOwnerDigest !== q.recordsOwnerDigest ||
    x.recordsOwnerDigest === q.recordsOwnerDigest ||
    x.agentHash !== q.agentHash ||
    x.providerIdentityHash !== q.providerIdentityHash ||
    [
      q.ownerApprovalHash,
      state.quotaCampaignExtension?.ownerApprovalHash,
      guide.ownerApprovalHash,
    ].includes(x.ownerApprovalHash) ||
    x.approvedAt < guide.approvedAt ||
    x.approvedAt > now ||
    prefix.length !== x.checkpointEventCount ||
    recoveryHash(prefix) !== x.checkpointEventHash ||
    prefix.some((e) => e.at > x.approvedAt) ||
    budget.executionLimit !== 563 ||
    budget.used !== 263 ||
    budget.remaining !== 300 ||
    budget.activeQuestion ||
    prior.some((entry) => !entry.revoked) ||
    recoveryHash(prior) !== x.checkpointCampaignSessionsHash ||
    (installing
      ? approvals.length !== 0 ||
        prefix.length !== state.events.length ||
        state.sessions.some(
          (entry) =>
            entry.allocationId === RECOVERY_EVALUATION && !entry.revoked,
        )
      : approvals.length !== 1 ||
        state.events[x.checkpointEventCount] !== approvals[0] ||
        approvals[0].subject !== recoveryHash(x) ||
        approvals[0].allocationId !== RECOVERY_EVALUATION ||
        approvals[0].executionLimit !== undefined ||
        approvals[0].at < x.approvedAt ||
        approvals[0].at > now)
  )
    throw new CareError("careos_owner_north_guide_records_binding_denied", 403);
  return x;
}

export function assertNorthGuideCampaignIntegrity(
  state: OwnerState,
  now: number,
  installing = false,
) {
  const x = state.northGuideCampaign;
  const previous = state.quotaCampaignExtension;
  const prefix = state.events.slice(0, x?.checkpointEventCount ?? 0);
  const approvals = state.events.filter(
    (e) => e.kind === "approve-north-guide-campaign",
  );
  const checkpoint = campaignBudget(prefix);
  const reserves = prefix.filter(
    (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
  );
  if (
    !x ||
    !previous ||
    x.previousAuthorizationHash !== recoveryHash(previous) ||
    [
      previous.ownerApprovalHash,
      state.quotaCampaign?.ownerApprovalHash,
    ].includes(x.ownerApprovalHash) ||
    x.approvedAt < previous.approvedAt ||
    x.approvedAt > now ||
    prefix.length !== x.checkpointEventCount ||
    recoveryHash(prefix) !== x.checkpointEventHash ||
    prefix.some((e) => e.at > x.approvedAt) ||
    checkpoint.executionLimit !== 263 ||
    checkpoint.used !== 263 ||
    checkpoint.activeQuestion ||
    new Set(reserves.map((e) => e.subject)).size !== 263 ||
    reserves.some(
      (e) =>
        prefix.filter(
          (v) =>
            v.subject === e.subject &&
            ["completed", "failed", "unknown"].includes(v.kind),
        ).length !== 1,
    ) ||
    state.sessions.some(
      (s) =>
        s.allocationId === RECOVERY_EVALUATION &&
        prefix.some((e) => e.kind === "pair" && e.subject === s.id) &&
        !s.revoked,
    ) ||
    (installing
      ? approvals.length !== 0 || prefix.length !== state.events.length
      : approvals.length !== 1 ||
        state.events[x.checkpointEventCount] !== approvals[0] ||
        approvals[0].subject !== recoveryHash(x) ||
        approvals[0].allocationId !== RECOVERY_EVALUATION ||
        approvals[0].executionLimit !== 563 ||
        approvals[0].at < x.approvedAt ||
        approvals[0].at > now)
  )
    throw new CareError("careos_owner_north_guide_campaign_denied", 403);
  return x;
}

export function assertQuotaCampaignExtensionIntegrity(
  state: OwnerState,
  now: number,
  installing = false,
) {
  const x = state.quotaCampaignExtension;
  const q = state.quotaCampaign;
  const prefix = state.events.slice(0, x?.checkpointEventCount ?? 0);
  const approvals = state.events.filter(
    (e) => e.kind === "approve-quota-campaign-extension",
  );
  const checkpoint = campaignBudget(prefix);
  const reserves = prefix.filter(
    (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
  );
  if (
    !x ||
    !q ||
    x.previousAuthorizationHash !== recoveryHash(q) ||
    x.ownerApprovalHash === q.ownerApprovalHash ||
    x.approvedAt < q.approvedAt ||
    x.approvedAt > now ||
    prefix.length !== x.checkpointEventCount ||
    recoveryHash(prefix) !== x.checkpointEventHash ||
    prefix.some((e) => e.at > x.approvedAt) ||
    checkpoint.executionLimit !== 163 ||
    checkpoint.used !== 163 ||
    checkpoint.activeQuestion ||
    new Set(reserves.map((e) => e.subject)).size !== 163 ||
    reserves.some(
      (e) =>
        prefix.filter(
          (v) =>
            v.subject === e.subject &&
            ["completed", "failed", "unknown"].includes(v.kind),
        ).length !== 1,
    ) ||
    state.sessions.some(
      (s) =>
        s.allocationId === RECOVERY_EVALUATION &&
        prefix.some((e) => e.kind === "pair" && e.subject === s.id) &&
        !s.revoked,
    ) ||
    (installing
      ? approvals.length !== 0 || prefix.length !== state.events.length
      : approvals.length !== 1 ||
        state.events[x.checkpointEventCount] !== approvals[0] ||
        approvals[0].subject !== recoveryHash(x) ||
        approvals[0].allocationId !== RECOVERY_EVALUATION ||
        approvals[0].executionLimit !== 263 ||
        approvals[0].at < x.approvedAt ||
        approvals[0].at > now)
  )
    throw new CareError("careos_owner_quota_campaign_extension_denied", 403);
  return x;
}
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
  const recovery = providerRecoveryContext(state, now);
  const phase = recovery ? providerRecoveryPhase(state, now) : undefined;
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
    state.events.some(
      (e) =>
        ["revoke-policy", "provider-block"].includes(e.kind) ||
        (e.kind === "revoke-quota-campaign" &&
          (!recovery ||
            e.id !==
              state.providerFailureRecovery!.failedQuestion
                .campaignRevocationEventId)),
    ) ||
    (phase && ["disabled", "expired"].includes(phase.phase))
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
        approvals[0].executionLimit !== q.executionLimit ||
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
  const extensionEvents = state.events.some(
    (e) => e.kind === "approve-quota-campaign-extension",
  );
  const extension = state.quotaCampaignExtension
    ? assertQuotaCampaignExtensionIntegrity(state, now)
    : undefined;
  if (extensionEvents && !extension)
    throw new CareError("careos_owner_quota_campaign_extension_denied", 403);
  const guide = state.northGuideCampaign
    ? assertNorthGuideCampaignIntegrity(state, now)
    : undefined;
  if (
    !guide &&
    state.events.some((e) => e.kind === "approve-north-guide-campaign")
  )
    throw new CareError("careos_owner_north_guide_campaign_denied", 403);
  const budget = campaignBudget(state.events, recovery);
  if (
    budget.used >
      (guide?.executionLimit ??
        extension?.executionLimit ??
        q.executionLimit) ||
    (installing && (budget.used !== 63 || budget.activeQuestion))
  )
    throw new CareError("careos_owner_quota_campaign_accounting_denied", 403);
  return guide ? { ...q, ...guide } : extension ? { ...q, ...extension } : q;
}
