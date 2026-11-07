import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CareError } from "./contracts";
import type { OwnerState, OwnerProof } from "./standing-owner";
import type { PilotFiles } from "./subscription/files";

export const RECOVERY_FILE = "evaluation-recovery.json";
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
export const recoveryCheckpointSchema = z.strictObject({
  ownerStateHash: digest,
  eventCount: time,
  eventHash: digest,
  policyHash: digest,
  evaluationHash: digest,
  originalSessionHash: digest,
});
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
  ) {
    doc.audit.push({ sequence: doc.audit.length + 1, at: this.now(), action });
  }
  private async gate(doc: EvaluationRecoveryDocument) {
    const runtime = await this.runtime();
    if (
      recoveryHash(runtime.release) !==
        recoveryHash(doc.binding.gates.release) ||
      runtime.ciReceiptHash !== doc.binding.gates.ciReceiptHash
    )
      return denied();
  }
  /** Reused by browser admission AND read-only host inspection; never trusts phase alone. */
  async validate(
    s: OwnerState,
    doc: EvaluationRecoveryDocument,
    requireActive = true,
    admission = true,
  ) {
    const b = doc.binding,
      now = this.now();
    const original = s.sessions.find((x) => x.id === RECOVERY_SESSION);
    if (
      (requireActive && doc.phase !== "active") ||
      doc.phase === "disabled" ||
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
    const tail = s.events.slice(b.checkpointEventCount);
    if (
      tail.some(
        (e) =>
          (e.subject === RECOVERY_SESSION &&
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
      reserves.length > 300 ||
      (admission && reserves.length >= 300) ||
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
    await this.gate(doc);
    return {
      original,
      used: reserves.length,
      remaining: 300 - reserves.length,
    };
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
    this.audit(doc, "challenge");
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
    this.audit(doc, "approve");
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
    this.audit(doc, "activate");
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
      ? { checkpointEventCount: doc.binding.checkpointEventCount }
      : null;
  }
  async disable(reason: string) {
    const doc = await this.read();
    if (!doc || doc.phase === "disabled") return;
    doc.phase = "disabled";
    doc.disabled = { at: this.now(), reason };
    this.audit(doc, "disable");
    await this.write(doc);
  }
}
