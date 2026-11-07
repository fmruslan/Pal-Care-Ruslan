import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CareError } from "./contracts";
import { CAMPAIGN_EXECUTION_LIMIT } from "./campaign-execution";
import type { OwnerState, OwnerProof } from "./standing-owner";
import {
  PilotTransitionPublicationUncertainError,
  type PilotFiles,
} from "./subscription/files";

export const RECOVERY_FILE = "evaluation-recovery.json";
export const RECOVERY_TRANSITION_FILE = "evaluation-recovery-transition.json";
export const RECOVERY_TRANSITION_OWNER_APPROVAL =
  "bf11ce7295579cc8e0f113c32229bf42ce818ab49fa91bf6d850eec305c1d697";
export const RECOVERY_TRANSITION_FROM = {
  commit: "63a877fa2df15affa184bcc1c7ffb8788a14e61a",
  sourceHash:
    "5aafe8283690d28b02f00e8e2dec56b5e27294322ee0b34b33eeb9ab0655010e",
  buildId: "XoS_uZJx7N3KPBKt1NqyC",
} as const;
export const RECOVERY_COOKIE = "__Host-palcare-evaluation-recovery-pending";
export const RECOVERY_ORIGIN = "https://greatbison.tail9e8802.ts.net:8444";
export const RECOVERY_EVALUATION = "feb8831c-702b-476e-91e3-d0034ceb645d";
export const RECOVERY_SESSION = "0dc8c2d0-c3c6-4f94-8e05-679c6d7fdbe1";
export const RECOVERY_DEADLINE = Date.parse("2026-11-07T20:00:26.905Z");
export const RECOVERY_OWNER_APPROVAL =
  "729bd852ab31daa3dffc959cf2c4ba6a32a4d2948b2dc8fa67a881bd77e53b9d";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative();
export const recoveryHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Database JSON object-key order is not an ownership or history change.
export function recoveryHistoryHash(value: unknown): string {
  const normalize = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, item]) => [k, normalize(item)]),
          )
        : v;
  return recoveryHash(normalize(value));
}
const secretHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const denied = (): never => {
  throw new CareError("careos_owner_evaluation_recovery_denied", 403);
};
type RecoveryChronology = {
  audit: { action: string; at: number }[];
  challenge?: { createdAt: number; expiresAt: number };
  approval?: { at: number };
  activation?: { at: number };
  disabled?: { at: number };
};
/** State creation and audit publication intentionally use separate clock reads.
 * Preserve their actual timestamps; require ordered events, not equality. */
export function validRecoveryChronology(doc: RecoveryChronology) {
  const actions = ["prepare", "challenge", "approve", "activate", "disable"];
  const times = [
    ...(doc.challenge
      ? [doc.challenge.createdAt, doc.challenge.expiresAt]
      : []),
    ...(doc.approval ? [doc.approval.at] : []),
    ...(doc.activation ? [doc.activation.at] : []),
    ...(doc.disabled ? [doc.disabled.at] : []),
  ];
  if (
    times.some((at) => !Number.isSafeInteger(at) || at < 0) ||
    !doc.audit.length ||
    new Set(doc.audit.map((e) => e.action)).size !== doc.audit.length ||
    !!doc.challenge !== doc.audit.some((e) => e.action === "challenge") ||
    !!doc.approval !== doc.audit.some((e) => e.action === "approve") ||
    !!doc.activation !== doc.audit.some((e) => e.action === "activate") ||
    !!doc.disabled !== doc.audit.some((e) => e.action === "disable") ||
    doc.audit.some(
      (e, n) =>
        !Number.isSafeInteger(e.at) ||
        e.at < 0 ||
        !actions.includes(e.action) ||
        (e.action === "disable"
          ? n === 0 || n !== doc.audit.length - 1
          : e.action !== actions[n]) ||
        (n > 0 && e.at < doc.audit[n - 1].at),
    )
  )
    return false;
  const at = (action: string) => doc.audit.find((e) => e.action === action)?.at;
  const prepare = at("prepare");
  if (prepare === undefined) return false;
  if (doc.challenge) {
    const recorded = at("challenge");
    if (
      recorded === undefined ||
      doc.challenge.createdAt < prepare ||
      recorded < doc.challenge.createdAt ||
      recorded >= doc.challenge.expiresAt
    )
      return false;
  }
  if (doc.approval) {
    const challenge = at("challenge"),
      recorded = at("approve");
    if (
      !doc.challenge ||
      challenge === undefined ||
      recorded === undefined ||
      doc.approval.at < challenge ||
      recorded < doc.approval.at ||
      recorded >= doc.challenge.expiresAt
    )
      return false;
  }
  if (doc.activation) {
    const approved = at("approve"),
      recorded = at("activate");
    if (
      !doc.challenge ||
      !doc.approval ||
      approved === undefined ||
      recorded === undefined ||
      doc.activation.at < approved ||
      recorded < doc.activation.at ||
      recorded >= doc.challenge.expiresAt
    )
      return false;
  }
  if (doc.disabled) {
    const recorded = at("disable"),
      previous = doc.audit.at(-2)?.at;
    if (
      recorded === undefined ||
      previous === undefined ||
      doc.disabled.at < previous ||
      recorded < doc.disabled.at
    )
      return false;
  }
  return true;
}
export const recoveryReleaseSchema = z.strictObject({
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceHash: digest,
  buildId: z.string().min(1).max(120),
});
export const recoveryGateSchema = z.strictObject({
  release: recoveryReleaseSchema,
  ciReceiptHash: digest,
  securityReviewHash: digest,
  preservationHash: digest,
  preservationOwnerStateHash: digest,
  providerEligibilityHash: digest,
  providerEligibilityCheckedAt: time,
  fallback: z.strictObject({
    release: recoveryReleaseSchema,
    evidenceHash: digest,
    ciReceiptHash: digest,
    ciRunId: z.number().int().positive(),
    recoveryAware: z.literal(true),
    startupHttpsPassed: z.literal(true),
    oldCredentialDenied: z.literal(true),
    injectedRecoveryLogoutPassed: z.literal(true),
  }),
});
export const recoveryTransitionGateSchema = recoveryGateSchema.extend({
  fallbackReadinessHash: digest,
  fallback: recoveryGateSchema.shape.fallback.extend({
    disableBeforeSwitch: z.literal(true),
    managedEntrypointHash: digest,
  }),
});
export const recoveryCheckpointSchema = z.strictObject({
  ownerStateHash: digest,
  eventCount: time,
  eventHash: digest,
  policyHash: digest,
  evaluationHash: digest,
  originalSessionHash: digest,
});
export const POST_STOP_RESTRICTION_EVENT =
  "ac70d904-15a3-4787-8052-4e4a89fb5eb4";
const continuationBounds = {
  historicalLimit: z.literal(300),
  executionLimit: z.literal(150),
  baselineUsed: z.literal(63),
  maxAdditional: z.literal(87),
  questionMaxStages: z.literal(2),
  maxRetries: z.literal(0),
  scope: z.literal("customer-records-including-personal-insights-native-sdk"),
};
/** Before separate consent, live HTTPS is explicitly unverified. Reusing the
 * active gate's true flag here would misrepresent an offline engineering test. */
export const postStopOfflineFallbackSchema =
  recoveryTransitionGateSchema.shape.fallback.extend({
    startupHttpsPassed: z.literal(false),
  });
/** Engineering evidence only. Creating this proposal NEVER enables a credential. */
export const postStopProposalSchema = z
  .strictObject({
    version: z.literal(1),
    kind: z.literal("explicit-post-stop-150"),
    createdAt: time,
    expiresAt: z.literal(RECOVERY_DEADLINE),
    originalDocumentHash: digest,
    originalBindingHash: digest,
    activationTokenHash: digest,
    terminalCheckpoint: recoveryCheckpointSchema,
    terminalRestrictionEventId: z.literal(POST_STOP_RESTRICTION_EVENT),
    fromRelease: recoveryReleaseSchema,
    fromCiReceiptHash: digest,
    release: recoveryReleaseSchema,
    ciReceiptHash: digest,
    securityReviewHash: digest,
    preservationHash: digest,
    offlineQaHash: digest,
    fallbackReadinessHash: digest,
    fallback: postStopOfflineFallbackSchema,
    pendingLiveChecks: z.tuple([
      z.literal("private-production-https-switch"),
      z.literal("same-source-fallback-https-smoke"),
      z.literal(
        "fresh-disabled-cookie-owned-records-get-and-provider-eligibility",
      ),
    ]),
    ...continuationBounds,
  })
  .refine(
    (p) =>
      p.createdAt >= 1794034945391 &&
      p.createdAt < RECOVERY_DEADLINE &&
      p.terminalCheckpoint.eventCount === 785 &&
      recoveryHash(p.fromRelease) === recoveryHash(RECOVERY_TRANSITION_FROM) &&
      p.release.commit !== p.fromRelease.commit &&
      p.release.sourceHash !== p.fromRelease.sourceHash &&
      recoveryHash(p.fallback.release) === recoveryHash(p.release) &&
      p.fallback.ciReceiptHash === p.ciReceiptHash,
  );
export const postStopApprovalSchema = z.strictObject({
  version: z.literal(1),
  decision: z.literal("approve"),
  kind: z.literal("explicit-post-stop-150"),
  proposalHash: digest,
  approvedAt: time,
  sameCredentialOnly: z.literal(true),
  noWindowExtension: z.literal(true),
});
export const postStopWitnessSchema = z.strictObject({
  kind: z.literal("explicit-post-stop-150"),
  proposalHash: digest,
  approvalHash: digest,
  approvedAt: time,
  proposal: postStopProposalSchema,
  approval: postStopApprovalSchema,
  terminalCheckpoint: recoveryCheckpointSchema,
  terminalRestrictionEventId: z.literal(POST_STOP_RESTRICTION_EVENT),
  activationTokenHash: digest,
  liveChecks: z.strictObject({
    release: recoveryReleaseSchema,
    checkedAt: time,
    evidenceHash: digest,
    productionHttpsPassed: z.literal(true),
    sameSourceFallbackHttpsPassed: z.literal(true),
    originalGrantUnchanged: z.literal(true),
  }),
  ...continuationBounds,
});
export type PostStopWitness = z.infer<typeof postStopWitnessSchema>;
/** Canonical proposal/approval hashes are host attestations, not signatures.
 * No future approval digest is baked into source or supplied by HTTP. */
export function createPostStopProposal(value: unknown) {
  const proposal = postStopProposalSchema.parse(value);
  return { proposal, proposalHash: recoveryHash(proposal) };
}
export const recoveryTransitionPreparationSchema = z
  .strictObject({
    ownerApprovalHash: digest,
    postStop: postStopWitnessSchema.optional(),
    originalDocumentHash: digest,
    originalBindingHash: digest,
    ownerStateHash: digest,
    fromRelease: recoveryReleaseSchema,
    fromCiReceiptHash: digest,
    toGate: recoveryTransitionGateSchema,
    history: z.strictObject({
      release: recoveryReleaseSchema,
      ciReceiptHash: digest,
      checkedAt: time,
      evidenceHash: digest,
      ownerStatusHash: digest,
      bindingHash: digest,
      recordsOwnerDigest: digest,
      historyHash: digest,
      existingRecoveryCredentialVerified: z.literal(true),
      serverOwnedRecordsProofVerified: z.literal(true),
      allOriginalPrefixesUnchanged: z.literal(true),
    }),
  })
  .refine((v) =>
    v.postStop
      ? v.ownerApprovalHash === v.postStop.approvalHash &&
        v.ownerApprovalHash !== RECOVERY_TRANSITION_OWNER_APPROVAL
      : v.ownerApprovalHash === RECOVERY_TRANSITION_OWNER_APPROVAL,
  );
export const recoveryTransitionSchema =
  recoveryTransitionPreparationSchema.safeExtend({
    version: z.literal(1),
    sequence: z.literal(1),
    evaluationId: z.literal(RECOVERY_EVALUATION),
    sessionId: z.literal(RECOVERY_SESSION),
    expiresAt: z.literal(RECOVERY_DEADLINE),
    createdAt: time,
  });
export type RecoveryTransitionPreparation = z.infer<
  typeof recoveryTransitionPreparationSchema
>;
export const recoveryHistorySchema = z
  .array(
    z.strictObject({
      conversationId: z.uuid(),
      turnCount: z.number().int().min(0).max(40),
      turnsHash: digest,
    }),
  )
  .length(15)
  .refine(
    (v) =>
      new Set(v.map((x) => x.conversationId)).size === 15 &&
      v.reduce((n, x) => n + x.turnCount, 0) === 58,
  );
export const recoveryPreparationSchema = z.strictObject({
  recordsOwnerDigest: digest,
  history: recoveryHistorySchema,
  /** From the preserved complete63 capture, NOT recaptured after new revocation. */
  checkpoint: recoveryCheckpointSchema,
  gates: recoveryGateSchema,
});
const bindingSchema = recoveryPreparationSchema.extend({
  evaluationId: z.literal(RECOVERY_EVALUATION),
  sessionId: z.literal(RECOVERY_SESSION),
  expiresAt: z.literal(RECOVERY_DEADLINE),
  baselineUsed: z.literal(63),
  maxAdditional: z.literal(237),
  requestLimit: z.literal(300),
  ownerApprovalHash: z.literal(RECOVERY_OWNER_APPROVAL),
  policyHash: digest,
  evaluationHash: digest,
  originalSessionHash: digest,
  agentHash: digest,
  checkpointEventCount: time,
  checkpointEventHash: digest,
});
export const evaluationRecoverySchema = z
  .strictObject({
    version: z.literal(1),
    phase: z.enum(["prepared", "pending", "approved", "active", "disabled"]),
    binding: bindingSchema,
    challenge: z
      .strictObject({
        id: z.uuid(),
        tokenHash: digest,
        createdAt: time,
        expiresAt: time,
      })
      .optional(),
    approval: z
      .strictObject({ at: time, bindingHash: digest, challengeId: z.uuid() })
      .optional(),
    activation: z
      .strictObject({ at: time, tokenHash: digest, sequence: z.literal(1) })
      .optional(),
    disabled: z
      .strictObject({ at: time, reason: z.string().min(1).max(120) })
      .optional(),
    audit: z
      .array(
        z.strictObject({
          sequence: z.number().int().positive(),
          at: time,
          action: z.enum([
            "prepare",
            "challenge",
            "approve",
            "activate",
            "disable",
          ]),
        }),
      )
      .min(1)
      .max(5),
  })
  .refine((doc) => {
    const phase = {
      prepared: 1,
      pending: 2,
      approved: 3,
      active: 4,
      disabled: 5,
    }[doc.phase];
    const actions = ["prepare", "challenge", "approve", "activate"];
    if (
      !validRecoveryChronology(doc) ||
      doc.audit.some(
        (e, n) => e.sequence !== n + 1 || (n > 0 && e.at < doc.audit[n - 1].at),
      )
    )
      return false;
    if (doc.phase === "disabled")
      return !!doc.disabled && doc.audit.at(-1)?.action === "disable";
    return (
      doc.audit.length === phase &&
      doc.audit.every((e, n) => e.action === actions[n]) &&
      !!doc.challenge === phase >= 2 &&
      !!doc.approval === phase >= 3 &&
      !!doc.activation === phase >= 4 &&
      !doc.disabled
    );
  });
export type EvaluationRecoveryDocument = z.infer<
  typeof evaluationRecoverySchema
>;
export type RecoveryPreparation = z.infer<typeof recoveryPreparationSchema>;
export type RecoveryHistoryEvidence = {
  bindingHash: string;
  recordsOwnerDigest: string;
  checkedAt: number;
};
/** Run outside the owner lock. IDs/digest originate ONLY in the host-pinned binding. */
export async function checkRecoveryHistory(
  binding: EvaluationRecoveryDocument["binding"],
  proof: OwnerProof,
  load: (
    id: string,
    owner: string,
  ) => Promise<{ id: string; expiresAt: string; turns: unknown[] }>,
  now = () => Date.now(),
): Promise<RecoveryHistoryEvidence> {
  if (
    proof.origin !== RECOVERY_ORIGIN ||
    proof.recordsOwnerDigest !== binding.recordsOwnerDigest
  )
    return denied();
  for (const original of binding.history) {
    const conversation = await load(
      original.conversationId,
      binding.recordsOwnerDigest,
    );
    const expires = Date.parse(conversation.expiresAt);
    if (
      conversation.id !== original.conversationId ||
      !Number.isFinite(expires) ||
      expires <= now() ||
      conversation.turns.length < original.turnCount ||
      recoveryHistoryHash(conversation.turns.slice(0, original.turnCount)) !==
        original.turnsHash
    )
      return denied();
  }
  return {
    bindingHash: recoveryHash(binding),
    recordsOwnerDigest: binding.recordsOwnerDigest,
    checkedAt: now(),
  };
}
type RuntimeEvidence = {
  release: z.infer<typeof recoveryReleaseSchema>;
  ciReceiptHash: string;
};

/** Local continuity receipt only; host/root control is not cryptographic attestation. */
export async function recoveryRuntimeEvidence(): Promise<RuntimeEvidence> {
  const [build, ci, id] = await Promise.all([
    readFile(join(process.cwd(), ".next/palcare-build.json"), "utf8"),
    readFile(join(process.cwd(), ".next/palcare-ci.json"), "utf8"),
    readFile(join(process.cwd(), ".next/BUILD_ID"), "utf8"),
  ]);
  const raw = JSON.parse(build);
  const release = recoveryReleaseSchema.parse({
    commit: raw.commit,
    sourceHash: raw.sourceHash,
    buildId: raw.buildId,
  });
  const receipt = JSON.parse(ci);
  if (
    release.buildId !== id.trim() ||
    receipt.schema !== 1 ||
    receipt.commit !== release.commit ||
    receipt.sourceHash !== release.sourceHash ||
    receipt.buildId !== release.buildId ||
    receipt.lane !== "full" ||
    receipt.exactChecks !== true ||
    receipt.workflow !== ".github/workflows/repository-checks.yml" ||
    !Number.isSafeInteger(receipt.runId) ||
    receipt.runId <= 0 ||
    !Number.isFinite(Date.parse(receipt.checkedAt))
  )
    return denied();
  return { release, ciReceiptHash: recoveryHash(receipt) };
}

/** All callers hold .owner-access-lock. No DB, provider, lock nesting or network. */
export class EvaluationRecovery {
  constructor(
    private files: PilotFiles,
    private now = () => Date.now(),
    private runtime = recoveryRuntimeEvidence,
  ) {}
  async read(): Promise<EvaluationRecoveryDocument | null> {
    const value = await this.files.read(RECOVERY_FILE);
    return value === null ? null : evaluationRecoverySchema.parse(value);
  }
  private async write(doc: EvaluationRecoveryDocument) {
    await this.files.write(RECOVERY_FILE, evaluationRecoverySchema.parse(doc));
  }
  private audit(
    doc: EvaluationRecoveryDocument,
    action: EvaluationRecoveryDocument["audit"][number]["action"],
    at = this.now(),
  ) {
    doc.audit.push({ sequence: doc.audit.length + 1, at, action });
  }
  private postStopWitness(
    doc: EvaluationRecoveryDocument,
    input: RecoveryTransitionPreparation,
    at: number,
  ) {
    const w = input.postStop;
    if (!w) return;
    const p = w.proposal,
      checkpoint = w.terminalCheckpoint;
    if (
      doc.phase !== "disabled" ||
      !doc.disabled ||
      !doc.activation ||
      doc.audit.length !== 5 ||
      !doc.approval ||
      !doc.challenge ||
      !validRecoveryChronology(doc) ||
      doc.approval.bindingHash !== recoveryHash(doc.binding) ||
      doc.approval.challengeId !== doc.challenge.id ||
      doc.activation.tokenHash === doc.challenge.tokenHash ||
      recoveryHash(p) !== w.proposalHash ||
      recoveryHash(w.approval) !== w.approvalHash ||
      w.approval.proposalHash !== w.proposalHash ||
      w.approval.approvedAt !== w.approvedAt ||
      w.approvedAt <=
        Math.max(doc.disabled.at, doc.audit.at(-1)!.at, p.createdAt) ||
      w.approvedAt >= RECOVERY_DEADLINE ||
      w.approvedAt > at ||
      p.createdAt <
        Math.max(doc.disabled.at, doc.audit.at(-1)!.at, 1794034945391) ||
      p.createdAt >= RECOVERY_DEADLINE ||
      p.originalDocumentHash !== input.originalDocumentHash ||
      p.originalBindingHash !== input.originalBindingHash ||
      p.activationTokenHash !== doc.activation.tokenHash ||
      w.activationTokenHash !== doc.activation.tokenHash ||
      recoveryHash(p.terminalCheckpoint) !== recoveryHash(checkpoint) ||
      checkpoint.eventCount !== 785 ||
      doc.binding.checkpointEventCount !== 784 ||
      checkpoint.ownerStateHash !== input.ownerStateHash ||
      checkpoint.policyHash !== doc.binding.policyHash ||
      checkpoint.evaluationHash !== doc.binding.evaluationHash ||
      checkpoint.originalSessionHash !== doc.binding.originalSessionHash ||
      recoveryHash(p.fromRelease) !== recoveryHash(input.fromRelease) ||
      p.fromCiReceiptHash !== input.fromCiReceiptHash ||
      recoveryHash(p.release) !== recoveryHash(input.toGate.release) ||
      p.ciReceiptHash !== input.toGate.ciReceiptHash ||
      p.securityReviewHash !== input.toGate.securityReviewHash ||
      p.preservationHash !== input.toGate.preservationHash ||
      p.fallbackReadinessHash !== input.toGate.fallbackReadinessHash ||
      recoveryHash({ ...p.fallback, startupHttpsPassed: true }) !==
        recoveryHash(input.toGate.fallback) ||
      recoveryHash(p.fallback.release) !== recoveryHash(p.release) ||
      p.fallback.ciReceiptHash !== p.ciReceiptHash ||
      recoveryHash(w.liveChecks.release) !== recoveryHash(p.release) ||
      w.liveChecks.checkedAt <= w.approvedAt ||
      w.liveChecks.checkedAt > at ||
      at - w.liveChecks.checkedAt > 300000 ||
      input.history.checkedAt <= w.approvedAt ||
      input.toGate.providerEligibilityCheckedAt <= w.approvedAt
    )
      return denied();
  }
  private async gate(doc: EvaluationRecoveryDocument) {
    const runtime = await this.runtime();
    const transition = await this.files.snapshot(RECOVERY_TRANSITION_FILE);
    let expected = doc.binding.gates;
    if (transition !== null) {
      const t = recoveryTransitionSchema.parse(transition.value);
      this.postStopWitness(doc, t, t.createdAt);
      const snapshot = await this.files.snapshot(RECOVERY_FILE);
      if (
        snapshot?.hash !== t.originalDocumentHash ||
        recoveryHash(doc.binding) !== t.originalBindingHash ||
        recoveryHash(t.fromRelease) !==
          recoveryHash(RECOVERY_TRANSITION_FROM) ||
        recoveryHash(t.fromRelease) !==
          recoveryHash(doc.binding.gates.release) ||
        t.fromCiReceiptHash !== doc.binding.gates.ciReceiptHash ||
        t.ownerStateHash !==
          (t.postStop?.terminalCheckpoint.ownerStateHash ??
            doc.binding.checkpoint.ownerStateHash) ||
        t.toGate.preservationOwnerStateHash !== t.ownerStateHash ||
        t.createdAt > this.now() ||
        t.createdAt < (doc.activation?.at ?? Infinity) ||
        t.toGate.release.commit === t.fromRelease.commit ||
        t.toGate.release.sourceHash === t.fromRelease.sourceHash ||
        t.toGate.providerEligibilityCheckedAt > t.createdAt ||
        t.createdAt - t.toGate.providerEligibilityCheckedAt > 300000 ||
        t.history.checkedAt > t.createdAt ||
        t.history.checkedAt < (doc.activation?.at ?? Infinity) ||
        t.createdAt - t.history.checkedAt > 300000 ||
        recoveryHash(t.history.release) !==
          recoveryHash(t.postStop ? t.toGate.release : t.fromRelease) ||
        t.history.ciReceiptHash !==
          (t.postStop ? t.toGate.ciReceiptHash : t.fromCiReceiptHash) ||
        t.history.bindingHash !== t.originalBindingHash ||
        t.history.recordsOwnerDigest !== doc.binding.recordsOwnerDigest ||
        t.history.historyHash !== recoveryHistoryHash(doc.binding.history) ||
        t.toGate.fallback.release.commit ===
          "091dc83d2fd791b06ee181aaf476c393e014c226" ||
        recoveryHash(t.toGate.fallback.release) !==
          recoveryHash(t.postStop ? t.toGate.release : t.fromRelease)
      )
        return denied();
      expected = t.toGate;
    }
    if (
      recoveryHash(runtime.release) !== recoveryHash(expected.release) ||
      runtime.ciReceiptHash !== expected.ciReceiptHash
    )
      return denied();
    return transition === null
      ? undefined
      : recoveryTransitionSchema.parse(transition.value).postStop;
  }
  /** Reused by browser admission AND read-only host inspection; never trusts phase alone. */
  async validate(
    s: OwnerState,
    doc: EvaluationRecoveryDocument,
    requireActive = true,
    admission = true,
  ) {
    const postStop = await this.gate(doc);
    return this.validateState(s, doc, requireActive, admission, postStop);
  }
  /** No runtime bypass is exposed to authentication/admission callers. */
  private validateState(
    s: OwnerState,
    doc: EvaluationRecoveryDocument,
    requireActive = true,
    admission = true,
    postStop?: PostStopWitness,
  ) {
    const b = doc.binding,
      now = this.now();
    const original = s.sessions.find((x) => x.id === RECOVERY_SESSION);
    if (
      (requireActive && doc.phase !== "active" && !postStop) ||
      (doc.phase === "disabled" && !postStop) ||
      b.checkpoint.eventCount !== b.checkpointEventCount ||
      b.checkpoint.eventHash !== b.checkpointEventHash ||
      b.checkpoint.policyHash !== b.policyHash ||
      b.checkpoint.evaluationHash !== b.evaluationHash ||
      b.checkpoint.originalSessionHash !== b.originalSessionHash ||
      b.checkpoint.ownerStateHash !== b.gates.preservationOwnerStateHash ||
      b.gates.fallback.release.commit ===
        "091dc83d2fd791b06ee181aaf476c393e014c226" ||
      doc.audit.some((e) => e.at > now) ||
      (!requireActive &&
        !postStop &&
        (b.gates.providerEligibilityCheckedAt > now ||
          now - b.gates.providerEligibilityCheckedAt > 300000)) ||
      !original ||
      !original.revoked ||
      original.approvedAt === null ||
      recoveryHash(original) !== b.originalSessionHash ||
      original.agentHash !== b.agentHash ||
      original.expiresAt !== RECOVERY_DEADLINE ||
      now < original.createdAt ||
      now >=
        Math.min(
          RECOVERY_DEADLINE,
          original.createdAt + 30 * 86400000,
          original.lastSeen + 7 * 86400000,
        ) ||
      !s.policy ||
      recoveryHash(s.policy) !== b.policyHash ||
      !s.policy.scopes.includes("customer") ||
      !s.evaluation ||
      s.evaluation.id !== RECOVERY_EVALUATION ||
      s.evaluation.sessionId !== RECOVERY_SESSION ||
      s.evaluation.expiresAt !== RECOVERY_DEADLINE ||
      s.evaluation.requestLimit !== 300 ||
      recoveryHash(s.evaluation) !== b.evaluationHash ||
      s.events.length < b.checkpointEventCount ||
      recoveryHash(s.events.slice(0, b.checkpointEventCount)) !==
        b.checkpointEventHash ||
      !s.events
        .slice(0, b.checkpointEventCount)
        .some(
          (e) =>
            e.subject === RECOVERY_SESSION &&
            ["logout", "revoke-session"].includes(e.kind),
        ) ||
      s.events.some((e) => ["provider-block", "revoke-policy"].includes(e.kind))
    )
      return denied();
    if (postStop) {
      const terminal = postStop.terminalCheckpoint;
      const stop = s.events[b.checkpointEventCount];
      if (
        s.events.length < terminal.eventCount ||
        recoveryHash(s.events.slice(0, terminal.eventCount)) !==
          terminal.eventHash ||
        recoveryHash({
          ...s,
          events: s.events.slice(0, terminal.eventCount),
        }) !== terminal.ownerStateHash ||
        recoveryHash({
          ...s,
          events: s.events.slice(0, b.checkpointEventCount),
        }) !== b.checkpoint.ownerStateHash ||
        !stop ||
        stop.id !== postStop.terminalRestrictionEventId ||
        stop.kind !== "revoke-session" ||
        stop.subject !== RECOVERY_SESSION ||
        stop.at !== 1794034945391 ||
        stop.at >= postStop.approvedAt ||
        postStop.approvedAt > now ||
        now >= RECOVERY_DEADLINE ||
        s.events.some((e) => e.at > now) ||
        new Set(s.events.map((e) => e.id)).size !== s.events.length ||
        new Set(s.sessions.map((e) => e.id)).size !== s.sessions.length ||
        new Set(s.sessions.map((e) => e.tokenHash)).size !==
          s.sessions.length ||
        s.sessions.some((e) => e.tokenHash === postStop.activationTokenHash)
      )
        return denied();
    }
    const prefix = s.events.slice(0, b.checkpointEventCount);
    const originalReservations = prefix.filter(
      (e) => e.kind === "reserve" && !e.allocationId,
    );
    if (
      prefix.filter(
        (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
      ).length !== 63 ||
      originalReservations.length !== 274 ||
      prefix.filter((e) => e.kind === "unknown" && !e.allocationId).length !==
        1 ||
      originalReservations.some(
        (e) =>
          prefix.filter(
            (v) =>
              !v.allocationId &&
              v.subject === e.subject &&
              ["completed", "failed", "unknown"].includes(v.kind),
          ).length !== 1,
      )
    )
      return denied();
    const effectiveCheckpointEventCount =
      postStop?.terminalCheckpoint.eventCount ?? b.checkpointEventCount;
    const tail = s.events.slice(effectiveCheckpointEventCount);
    if (
      tail.some(
        (e) =>
          ((postStop || e.subject === RECOVERY_SESSION) &&
            ["revoke-session", "logout"].includes(e.kind)) ||
          (["reserve", "completed", "failed", "unknown"].includes(e.kind) &&
            (e.allocationId !== RECOVERY_EVALUATION ||
              !["reserve", "completed"].includes(e.kind))),
      )
    )
      return denied();
    const reserves = s.events.filter(
      (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
    );
    if (
      reserves.length < 63 ||
      reserves.length > CAMPAIGN_EXECUTION_LIMIT ||
      (admission && reserves.length >= CAMPAIGN_EXECUTION_LIMIT) ||
      new Set(reserves.map((x) => x.subject)).size !== reserves.length
    )
      return denied();
    const outcomes = s.events.filter(
      (e) =>
        e.allocationId === RECOVERY_EVALUATION &&
        ["completed", "failed", "unknown"].includes(e.kind),
    );
    if (
      outcomes.length > reserves.length ||
      (admission && outcomes.length !== reserves.length) ||
      outcomes.some((e) => !reserves.some((v) => v.subject === e.subject)) ||
      reserves.some((e) => {
        const final = outcomes.filter((v) => v.subject === e.subject);
        return (
          (admission && final.length !== 1) ||
          final.length > 1 ||
          (final.length === 1 &&
            (final[0].kind !== "completed" ||
              final[0].at < e.at ||
              final[0].observation?.httpStatus !== 200))
        );
      })
    )
      return denied();
    if (
      requireActive &&
      (!doc.activation ||
        !doc.approval ||
        !doc.challenge ||
        doc.activation.at < doc.approval.at ||
        doc.approval.challengeId !== doc.challenge.id ||
        doc.approval.bindingHash !== recoveryHash(b))
    )
      return denied();
    return {
      original,
      used: reserves.length,
      remaining: CAMPAIGN_EXECUTION_LIMIT - reserves.length,
      effectiveCheckpointEventCount,
      postStop,
    };
  }
  /** Host-only one-way release continuity. Caller holds the SAME owner lock.
   * Never writes the original document, owner state, credentials or accounting.
   * Receipt hashes are host attestations, not signatures against owner/root. */
  async transition(s: OwnerState, value: unknown) {
    const input = recoveryTransitionPreparationSchema.parse(value);
    if (await this.files.snapshot(RECOVERY_TRANSITION_FILE)) return denied();
    const snapshot = await this.files.snapshot(RECOVERY_FILE);
    if (!snapshot) return denied();
    const doc = evaluationRecoverySchema.parse(snapshot.value);
    const runtime = await this.runtime(),
      now = this.now();
    this.postStopWitness(doc, input, now);
    const valid = this.validateState(s, doc, true, true, input.postStop);
    const fresh = (at: number) => at <= now && now - at <= 300000;
    if (
      valid.used !== 63 ||
      doc.activation?.sequence !== 1 ||
      snapshot.hash !== input.originalDocumentHash ||
      recoveryHash(doc.binding) !== input.originalBindingHash ||
      recoveryHash(s) !== input.ownerStateHash ||
      input.ownerStateHash !==
        (input.postStop?.terminalCheckpoint.ownerStateHash ??
          doc.binding.checkpoint.ownerStateHash) ||
      s.events.length !== valid.effectiveCheckpointEventCount ||
      input.toGate.preservationOwnerStateHash !== input.ownerStateHash ||
      recoveryHash(input.fromRelease) !==
        recoveryHash(RECOVERY_TRANSITION_FROM) ||
      recoveryHash(input.fromRelease) !==
        recoveryHash(doc.binding.gates.release) ||
      input.fromCiReceiptHash !== doc.binding.gates.ciReceiptHash ||
      recoveryHash(runtime.release) !== recoveryHash(input.toGate.release) ||
      runtime.ciReceiptHash !== input.toGate.ciReceiptHash ||
      input.toGate.release.commit === input.fromRelease.commit ||
      input.toGate.release.sourceHash === input.fromRelease.sourceHash ||
      !fresh(input.toGate.providerEligibilityCheckedAt) ||
      !fresh(input.history.checkedAt) ||
      input.history.checkedAt < doc.activation.at ||
      recoveryHash(input.history.release) !==
        recoveryHash(
          input.postStop ? input.toGate.release : input.fromRelease,
        ) ||
      input.history.ciReceiptHash !==
        (input.postStop
          ? input.toGate.ciReceiptHash
          : input.fromCiReceiptHash) ||
      input.history.bindingHash !== input.originalBindingHash ||
      input.history.recordsOwnerDigest !== doc.binding.recordsOwnerDigest ||
      input.history.historyHash !== recoveryHistoryHash(doc.binding.history) ||
      input.toGate.fallback.release.commit ===
        "091dc83d2fd791b06ee181aaf476c393e014c226" ||
      recoveryHash(input.toGate.fallback.release) !==
        recoveryHash(
          input.postStop ? input.toGate.release : input.fromRelease,
        ) ||
      s.events.some((e) => e.at > now) ||
      new Set(s.events.map((e) => e.id)).size !== s.events.length ||
      new Set(s.sessions.map((v) => v.id)).size !== s.sessions.length ||
      new Set(s.sessions.map((v) => v.tokenHash)).size !== s.sessions.length ||
      s.sessions.some((v) => v.tokenHash === doc.activation?.tokenHash) ||
      doc.activation.tokenHash === doc.challenge!.tokenHash ||
      !validRecoveryChronology(doc) ||
      doc.approval!.at < doc.challenge!.createdAt ||
      doc.activation.at >= doc.challenge!.expiresAt
    )
      return denied();
    // Recheck immutable inputs immediately before the sole protected write.
    if (
      (await this.files.snapshot(RECOVERY_FILE))?.hash !== snapshot.hash ||
      recoveryHash(await this.files.read("owner-state.json")) !==
        input.ownerStateHash ||
      (await this.files.snapshot(RECOVERY_TRANSITION_FILE))
    )
      return denied();
    const finalRuntime = await this.runtime();
    const committedAt = this.now();
    this.postStopWitness(doc, input, committedAt);
    this.validateState(s, doc, true, true, input.postStop);
    if (
      committedAt < now ||
      committedAt - input.history.checkedAt > 300000 ||
      committedAt - input.toGate.providerEligibilityCheckedAt > 300000 ||
      recoveryHash(finalRuntime) !== recoveryHash(runtime)
    )
      return denied();
    const record = recoveryTransitionSchema.parse({
      ...input,
      version: 1,
      sequence: 1,
      evaluationId: RECOVERY_EVALUATION,
      sessionId: RECOVERY_SESSION,
      expiresAt: RECOVERY_DEADLINE,
      createdAt: committedAt,
    });
    try {
      await this.files.write(RECOVERY_TRANSITION_FILE, record);
    } catch (error) {
      // Even write-then-throw is ambiguous: retain the already-durable owner
      // lock, never delete the record or infer that a thrown write was absent.
      throw new PilotTransitionPublicationUncertainError(error);
    }
    return recoveryHash(record);
  }
  async prepare(s: OwnerState, value: unknown) {
    if (await this.read()) return denied(); // Includes disabled: no automatic reactivation.
    const input = recoveryPreparationSchema.parse(value),
      original = s.sessions.find((x) => x.id === RECOVERY_SESSION);
    if (
      !original ||
      !s.policy ||
      !s.evaluation ||
      input.gates.preservationOwnerStateHash !== recoveryHash(s) ||
      input.checkpoint.ownerStateHash !== recoveryHash(s) ||
      input.checkpoint.eventCount !== s.events.length ||
      input.checkpoint.eventHash !== recoveryHash(s.events) ||
      input.checkpoint.policyHash !== recoveryHash(s.policy) ||
      input.checkpoint.evaluationHash !== recoveryHash(s.evaluation) ||
      input.checkpoint.originalSessionHash !== recoveryHash(original)
    )
      return denied();
    const doc: EvaluationRecoveryDocument = {
      version: 1,
      phase: "prepared",
      binding: {
        ...input,
        evaluationId: RECOVERY_EVALUATION,
        sessionId: RECOVERY_SESSION,
        expiresAt: RECOVERY_DEADLINE,
        baselineUsed: 63,
        maxAdditional: 237,
        requestLimit: 300,
        ownerApprovalHash: RECOVERY_OWNER_APPROVAL,
        policyHash: input.checkpoint.policyHash,
        evaluationHash: input.checkpoint.evaluationHash,
        originalSessionHash: input.checkpoint.originalSessionHash,
        agentHash: original.agentHash,
        checkpointEventCount: input.checkpoint.eventCount,
        checkpointEventHash: input.checkpoint.eventHash,
      },
      audit: [{ sequence: 1, at: this.now(), action: "prepare" }],
    };
    await this.validate(s, doc, false);
    await this.write(doc);
    return recoveryHash(doc.binding);
  }
  private history(
    doc: EvaluationRecoveryDocument,
    proof: OwnerProof,
    evidence: RecoveryHistoryEvidence,
  ) {
    if (
      proof.origin !== RECOVERY_ORIGIN ||
      proof.recordsOwnerDigest !== doc.binding.recordsOwnerDigest ||
      secretHash(proof.agent) !== doc.binding.agentHash ||
      evidence.bindingHash !== recoveryHash(doc.binding) ||
      evidence.recordsOwnerDigest !== doc.binding.recordsOwnerDigest ||
      evidence.checkedAt > this.now() ||
      this.now() - evidence.checkedAt > 10000
    )
      return denied();
  }
  async request(
    s: OwnerState,
    proof: OwnerProof,
    evidence: RecoveryHistoryEvidence,
  ) {
    const doc = await this.read();
    if (!doc || doc.phase !== "prepared") return denied();
    await this.validate(s, doc, false);
    this.history(doc, proof, evidence);
    const token = randomBytes(32).toString("hex"),
      now = this.now();
    if (s.sessions.some((x) => x.tokenHash === secretHash(token)))
      return denied();
    doc.phase = "pending";
    doc.challenge = {
      id: randomUUID(),
      tokenHash: secretHash(token),
      createdAt: now,
      expiresAt: Math.min(now + 300000, RECOVERY_DEADLINE),
    };
    this.audit(doc, "challenge", doc.challenge.createdAt);
    await this.write(doc);
    return { id: doc.challenge.id, token, expiresAt: doc.challenge.expiresAt };
  }
  async approve(s: OwnerState, id: string, expectedBinding: string) {
    const doc = await this.read();
    if (
      !doc ||
      doc.phase !== "pending" ||
      !doc.challenge ||
      doc.challenge.id !== id ||
      expectedBinding !== recoveryHash(doc.binding) ||
      this.now() < doc.challenge.createdAt ||
      this.now() >= doc.challenge.expiresAt
    )
      return denied();
    await this.validate(s, doc, false);
    doc.phase = "approved";
    doc.approval = {
      at: this.now(),
      bindingHash: expectedBinding,
      challengeId: id,
    };
    this.audit(doc, "approve", doc.approval.at);
    await this.write(doc);
  }
  async finish(
    s: OwnerState,
    proof: OwnerProof,
    challenge: string | undefined,
    evidence: RecoveryHistoryEvidence,
  ) {
    const doc = await this.read();
    if (
      !doc ||
      doc.phase !== "approved" ||
      !doc.challenge ||
      !doc.approval ||
      !challenge ||
      !/^[a-f0-9]{64}$/.test(challenge) ||
      secretHash(challenge) !== doc.challenge.tokenHash ||
      this.now() < doc.challenge.createdAt ||
      this.now() >= doc.challenge.expiresAt ||
      doc.approval.bindingHash !== recoveryHash(doc.binding) ||
      doc.approval.challengeId !== doc.challenge.id
    )
      return denied();
    await this.validate(s, doc, false);
    this.history(doc, proof, evidence);
    const token = randomBytes(32).toString("hex");
    if (
      secretHash(token) === doc.challenge.tokenHash ||
      s.sessions.some((x) => x.tokenHash === secretHash(token))
    )
      return denied();
    doc.phase = "active";
    doc.activation = {
      at: this.now(),
      tokenHash: secretHash(token),
      sequence: 1,
    };
    this.audit(doc, "activate", doc.activation.at);
    await this.write(doc); // Consumption/token hash durable BEFORE Set-Cookie. Never reissue.
    return { token, expiresAt: RECOVERY_DEADLINE };
  }
  async resolve(s: OwnerState, proof: OwnerProof, admission = true) {
    const doc = await this.read();
    if (
      !doc ||
      !proof.token ||
      !/^[a-f0-9]{64}$/.test(proof.token) ||
      doc.activation?.tokenHash !== secretHash(proof.token) ||
      proof.origin !== RECOVERY_ORIGIN ||
      proof.recordsOwnerDigest !== doc.binding.recordsOwnerDigest ||
      secretHash(proof.agent) !== doc.binding.agentHash
    )
      return denied();
    const result = await this.validate(s, doc, true, admission);
    return { ...result, doc };
  }
  /** Restriction-only cutoff; deliberately independent of runtime/expiry/usage.
   * Caller must append a NEW durable restriction after this cutoff, under the
   * owner lock. The original disabled grant must never be rewritten. */
  async postStopCheckpoint() {
    const snapshot = await this.files.snapshot(RECOVERY_TRANSITION_FILE);
    if (!snapshot) return null;
    const t = recoveryTransitionSchema.parse(snapshot.value);
    if (!t.postStop) return null;
    const docSnapshot = await this.files.snapshot(RECOVERY_FILE);
    if (!docSnapshot || docSnapshot.hash !== t.originalDocumentHash)
      return denied();
    const doc = evaluationRecoverySchema.parse(docSnapshot.value);
    if (recoveryHash(doc.binding) !== t.originalBindingHash) return denied();
    this.postStopWitness(doc, t, t.createdAt);
    return t.postStop.terminalCheckpoint.eventCount;
  }
  /** Read-only status evidence, never an identity or dispatch bypass. */
  async continuationForStatus(s: OwnerState) {
    try {
      const doc = await this.read();
      if (!doc) return null;
      const result = await this.validate(s, doc, true, false);
      return result.postStop ? result : null;
    } catch {
      return null;
    }
  }
  /** Restriction-only identity proof, NOT an inference principal. Deliberately
   * independent of UA, expiry, provider eligibility and remaining allowance so
   * the same holder can always cancel a pending/approved/expired grant. */
  async cancellationBound(proof: OwnerProof, pendingChallenge?: string) {
    if (proof.origin !== RECOVERY_ORIGIN) return null;
    const doc = await this.read();
    if (!doc) return null;
    const matches = (
      secret: string | undefined,
      expected: string | undefined,
    ) =>
      !!secret &&
      /^[a-f0-9]{64}$/.test(secret) &&
      !!expected &&
      secretHash(secret) === expected;
    const bound =
      matches(pendingChallenge, doc.challenge?.tokenHash) ||
      matches(proof.token, doc.activation?.tokenHash) ||
      (!!proof.recordsOwnerDigest &&
        proof.recordsOwnerDigest === doc.binding.recordsOwnerDigest);
    return bound
      ? {
          checkpointEventCount:
            (await this.postStopCheckpoint()) ??
            doc.binding.checkpointEventCount,
        }
      : null;
  }
  async disable(reason: string) {
    const doc = await this.read();
    if (!doc || doc.phase === "disabled") return;
    doc.phase = "disabled";
    doc.disabled = { at: this.now(), reason };
    this.audit(doc, "disable", doc.disabled.at);
    await this.write(doc);
  }
}
