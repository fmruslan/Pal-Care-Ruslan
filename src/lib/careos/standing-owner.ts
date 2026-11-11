import { createHash, randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CareError } from "./contracts";
import { PilotFiles } from "./subscription/files";
import { northReviewOrigin } from "../private-preview-origin";
import {
  quotaCampaignSchema,
  quotaCampaignExtensionSchema,
  assertQuotaCampaignExtensionIntegrity,
  assertQuotaCampaignIntegrity,
  northGuideCampaignSchema,
  assertNorthGuideCampaignIntegrity,
} from "./quota-campaign";
import {
  CAMPAIGN_EXECUTION_LIMIT,
  QUESTION_MAX_STAGES,
  campaignBudget,
  assertCampaignQuestionOpen,
  assertCampaignStage,
  assertCampaignQuestionClose,
} from "./campaign-execution";
import {
  EvaluationRecovery,
  RECOVERY_EVALUATION,
  RECOVERY_SESSION,
  RECOVERY_DEADLINE,
  recoveryHash,
  type RecoveryHistoryEvidence,
} from "./evaluation-recovery";

export const OWNER_COOKIE = "__Host-palcare-owner";
export const OWNER_ORIGIN = "https://greatbison.tail9e8802.ts.net:8444";
export const OWNER_MAX_AGE = 30 * 86400000;
export const OWNER_IDLE = 7 * 86400000;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z.enum(["customer", "customer-studio"]);
const time = z.number().int().nonnegative();
export const standingPolicySchema = z.strictObject({
  id: z.uuid(),
  approvedAt: time,
  provider: z.literal("chatgpt-subscription"),
  model: z.literal("gpt-6.1-sol"),
  reasoning: z.literal("medium"),
  origin: z.literal(OWNER_ORIGIN),
  scopes: z
    .array(scope)
    .min(1)
    .max(2)
    .refine((v) => new Set(v).size === v.length),
  requestLimit: z.number().int().min(1).max(500),
  concurrency: z.number().int().min(1).max(4),
  requestsPerMinute: z.number().int().min(1).max(30),
  maxRetries: z.number().int().min(0).max(1).default(0),
  creditsDisabledConfirmed: z.literal(true),
  providerPermissionConfirmed: z.literal(true),
  historicalJournalHash: digest,
});
/** One separately approved campaign, never a replacement/rollover of the policy. */
export const evaluationApprovalSchema = z.strictObject({
  id: z.uuid(),
  policyId: z.uuid(),
  policyHash: digest,
  approvedAt: time,
  expiresAt: time,
  sessionId: z.uuid(),
  requestLimit: z.literal(300),
  purpose: z.literal("north-language-300"),
  fastApplicationQuotaApproved: z.literal(true),
});
const evaluationSchema = evaluationApprovalSchema.extend({
  baselineEventCount: time,
  baselineEventHash: digest,
});
const eventSchema = z.strictObject({
  executionLimit: z
    .union([z.literal(163), z.literal(263), z.literal(563)])
    .optional(),
  id: z.uuid(),
  at: time,
  kind: z.enum([
    "pair",
    "approve",
    "finish-browser",
    "approve-policy",
    "approve-evaluation",
    "provider-block",
    "logout",
    "touch",
    "revoke-session",
    "revoke-policy",
    "reserve",
    "completed",
    "unknown",
    "failed",
    "question-open",
    "question-close",
    "approve-quota-campaign",
    "approve-quota-campaign-extension",
    "approve-north-guide-campaign",
    "revoke-quota-campaign",
  ]),
  subject: z.string().min(1).max(200),
  allocationId: z.uuid().optional(),
  observation: z
    .object({
      httpStatus: z.number().int().min(100).max(599).optional(),
      requestId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .optional(),
      usage: z
        .object({
          inputTokens: time,
          outputTokens: time,
          totalTokens: time,
          cachedTokens: time,
          cacheWriteTokens: time.nullable(),
          reasoningTokens: time,
        })
        .optional(),
    })
    .optional(),
});
const stateSchema = z.strictObject({
  version: z.literal(1),
  policy: standingPolicySchema.nullable(),
  evaluation: evaluationSchema.optional(),
  quotaCampaign: quotaCampaignSchema.optional(),
  quotaCampaignExtension: quotaCampaignExtensionSchema.optional(),
  northGuideCampaign: northGuideCampaignSchema.optional(),
  sessions: z
    .array(
      z.strictObject({
        id: z.uuid(),
        tokenHash: digest,
        agentHash: digest,
        createdAt: time,
        lastSeen: time,
        approvedAt: time.nullable(),
        finishedAt: time.optional(),
        expiresAt: time.optional(),
        revoked: z.boolean(),
        allocationId: z.literal(RECOVERY_EVALUATION).optional(),
      }),
    )
    .max(128),
  events: z.array(eventSchema).max(5000),
});
export type OwnerState = z.infer<typeof stateSchema>;
type State = OwnerState;
export type OwnerProof = {
  token?: string;
  agent: string;
  origin?: string;
  /** Server-derived from the independent, unchanged records cookie. */
  recordsOwnerDigest?: string;
  /** Only records runtime callers set this, never an HTTP body/header flag. */
  channel?: "records";
};
export const reviewOriginApprovalSchema = z.strictObject({
  version: z.literal(1),
  origin: z.literal(northReviewOrigin),
  policyId: z.uuid(),
  policyHash: digest,
  approvedAt: time,
});
export function ownerCookieName(origin: string) {
  return origin === northReviewOrigin
    ? "__Host-palcare-north-owner"
    : OWNER_COOKIE;
}
export const ownerFiles = () =>
  new PilotFiles(join(homedir(), ".config/palcare-standing-owner"));
const deny = (code: string): never => {
  throw new CareError(`careos_owner_${code}`, 403);
};
/** Pure host engineering helper for the PRESERVED capture, not current authority. */
export function evaluationRecoveryCheckpoint(value: unknown) {
  const s = stateSchema.parse(value);
  const original = s.sessions.find((x) => x.id === RECOVERY_SESSION);
  if (!original || !s.policy || !s.evaluation)
    return deny("evaluation_recovery_denied");
  return {
    ownerStateHash: recoveryHash(s),
    eventCount: s.events.length,
    eventHash: recoveryHash(s.events),
    policyHash: recoveryHash(s.policy),
    evaluationHash: recoveryHash(s.evaluation),
    originalSessionHash: recoveryHash(original),
  };
}

/** Host-private logical append-only journal. Never pruned, reset or auto-recovered.
 * Atomic/fsynced snapshots retain every event. Host/root can alter files: this is
 * not tamper-proof storage. A crashed active reservation blocks new dispatch. */
export class StandingOwner {
  private recovery: EvaluationRecovery;
  constructor(
    public files = ownerFiles(),
    private now = () => Date.now(),
    recovery?: EvaluationRecovery,
  ) {
    this.recovery = recovery ?? new EvaluationRecovery(files, now);
  }
  private async state(): Promise<State> {
    return stateSchema.parse(
      (await this.files.read("owner-state.json")) ?? {
        version: 1,
        policy: null,
        sessions: [],
        events: [],
      },
    );
  }
  private async change<T>(work: (s: State) => T) {
    return this.files.lockedWaiting(async () => {
      const s = await this.state();
      const before = JSON.stringify(s);
      const result = await work(s);
      if (JSON.stringify(s) !== before)
        await this.files.write("owner-state.json", stateSchema.parse(s));
      return result;
    }, ".owner-access-lock");
  }
  private async additionalOrigin(s: State, origin = OWNER_ORIGIN) {
    if (origin === OWNER_ORIGIN) return;
    const approval = reviewOriginApprovalSchema.safeParse(
      await this.files.read("north-review-origin-approval.json"),
    );
    if (
      origin !== northReviewOrigin ||
      !approval.success ||
      !s.policy ||
      approval.data.policyId !== s.policy.id ||
      approval.data.policyHash !== hash(JSON.stringify(s.policy)) ||
      approval.data.approvedAt < s.policy.approvedAt ||
      approval.data.approvedAt > this.now()
    )
      return deny("origin_not_approved");
  }
  async assertOriginApproval(origin: string) {
    await this.additionalOrigin(await this.state(), origin);
  }
  /** Exact owner-approved additive origin, not policy replacement or allowance. */
  async installReviewOriginApproval(value: unknown) {
    const approval = reviewOriginApprovalSchema.parse(value);
    await this.files.lockedWaiting(async () => {
      const s = await this.state();
      if (
        (await this.files.read("north-review-origin-approval.json")) ||
        !s.policy ||
        approval.policyId !== s.policy.id ||
        approval.policyHash !== hash(JSON.stringify(s.policy)) ||
        approval.approvedAt < s.policy.approvedAt ||
        approval.approvedAt > this.now() ||
        s.events.some((e) => e.kind === "revoke-policy")
      )
        return deny("origin_not_approved");
      await this.files.write("north-review-origin-approval.json", approval);
    }, ".owner-access-lock");
  }
  private event(
    s: State,
    kind: z.infer<typeof eventSchema>["kind"],
    subject: string,
  ) {
    s.events.push({ id: randomUUID(), at: this.now(), kind, subject });
  }
  private campaignEntry(s: State, entry: State["sessions"][number]) {
    return (
      entry.allocationId === RECOVERY_EVALUATION ||
      (s.evaluation?.id === RECOVERY_EVALUATION &&
        s.evaluation.sessionId === entry.id)
    );
  }
  private async quotaPolicy(s: State) {
    return assertQuotaCampaignIntegrity(
      s,
      (await this.files.snapshot("evaluation-recovery.json"))?.hash,
      this.now(),
    );
  }
  private async quotaProof(s: State, proof: OwnerProof) {
    const q = await this.quotaPolicy(s);
    if (
      (proof.origin ?? OWNER_ORIGIN) !== OWNER_ORIGIN ||
      proof.recordsOwnerDigest !== q.recordsOwnerDigest ||
      hash(proof.agent) !== q.agentHash
    )
      return deny("scope_denied");
    return q;
  }
  /** Host-only additive policy. No historical edit, credential issue or network. */
  async installQuotaCampaign(value: unknown) {
    const q = quotaCampaignSchema.parse(value);
    return this.change(async (s) => {
      if (
        s.quotaCampaign ||
        s.events.some((e) => e.kind === "approve-quota-campaign")
      )
        return deny("quota_campaign_already_set");
      const original = await this.files.snapshot("evaluation-recovery.json");
      const doc = await this.recovery.read();
      if (
        !doc ||
        doc.phase !== "disabled" ||
        !doc.activation ||
        q.recordsOwnerDigest !== doc.binding.recordsOwnerDigest ||
        q.agentHash !== doc.binding.agentHash
      )
        return deny("quota_campaign_denied");
      s.quotaCampaign = q;
      assertQuotaCampaignIntegrity(s, original?.hash, this.now(), true);
      this.event(s, "approve-quota-campaign", recoveryHash(q));
      s.events.at(-1)!.allocationId = RECOVERY_EVALUATION;
      s.events.at(-1)!.executionLimit = q.executionLimit;
    });
  }
  /** Host-only, once-only exact amendment; browser approval remains separate. */
  async installQuotaCampaignExtension(value: unknown) {
    const x = quotaCampaignExtensionSchema.parse(value);
    return this.change(async (s) => {
      if (
        s.quotaCampaignExtension ||
        s.events.some((e) => e.kind === "approve-quota-campaign-extension")
      )
        return deny("quota_campaign_extension_already_set");
      await this.quotaPolicy(s);
      if (
        !s.policy ||
        s.sessions.some(
          (entry) =>
            entry.allocationId === RECOVERY_EVALUATION && !entry.revoked,
        )
      )
        return deny("quota_campaign_extension_denied");
      s.quotaCampaignExtension = x;
      assertQuotaCampaignExtensionIntegrity(s, this.now(), true);
      this.event(s, "approve-quota-campaign-extension", recoveryHash(x));
      s.events.at(-1)!.allocationId = RECOVERY_EVALUATION;
      s.events.at(-1)!.executionLimit = x.executionLimit;
      await this.quotaPolicy(s);
    });
  }
  /** Fixed host-only additive grant. No browser, provider or standing-policy renewal. */
  async installNorthGuideCampaign(value: unknown) {
    const x = northGuideCampaignSchema.parse(value);
    return this.change(async (s) => {
      if (
        s.northGuideCampaign ||
        s.events.some((e) => e.kind === "approve-north-guide-campaign")
      )
        return deny("north_guide_campaign_already_set");
      await this.quotaPolicy(s);
      if (
        !s.policy ||
        s.sessions.some(
          (entry) =>
            entry.allocationId === RECOVERY_EVALUATION && !entry.revoked,
        )
      )
        return deny("north_guide_campaign_denied");
      s.northGuideCampaign = x;
      assertNorthGuideCampaignIntegrity(s, this.now(), true);
      this.event(s, "approve-north-guide-campaign", recoveryHash(x));
      s.events.at(-1)!.allocationId = RECOVERY_EVALUATION;
      s.events.at(-1)!.executionLimit = x.executionLimit;
      await this.quotaPolicy(s);
    });
  }
  private async principal(s: State, proof: OwnerProof, admission = false) {
    if (!proof.token || !/^[a-f0-9]{64}$/.test(proof.token))
      return deny("signin_required");
    const entry = s.sessions.find((v) => v.tokenHash === hash(proof.token!));
    if (!entry) {
      try {
        const recovered = await this.recovery.resolve(s, proof, admission);
        return { entry: recovered.original, recovered: true };
      } catch {
        return deny("signin_required");
      }
    }
    if (
      !entry ||
      entry.revoked ||
      entry.agentHash !== hash(proof.agent) ||
      entry.approvedAt === null ||
      this.now() < entry.createdAt ||
      this.now() >= entry.createdAt + OWNER_MAX_AGE ||
      (entry.expiresAt !== undefined && this.now() >= entry.expiresAt) ||
      this.now() >= entry.lastSeen + OWNER_IDLE
    )
      return deny("signin_required");
    return { entry, recovered: false };
  }
  private async session(s: State, proof: OwnerProof) {
    return (await this.principal(s, proof)).entry;
  }
  private async inspectBrowser(s: State, proof: OwnerProof) {
    if (!proof.token)
      return { state: "missing-cookie" as const, reason: "missing-cookie" };
    const entry = /^[a-f0-9]{64}$/.test(proof.token)
      ? s.sessions.find((v) => v.tokenHash === hash(proof.token!))
      : undefined;
    if (!entry) {
      try {
        await this.principal(s, proof);
        return { state: "recovery-active" as const, reason: "accepted" };
      } catch {
        return {
          state: "cookie-rejected" as const,
          reason: "unknown-or-malformed-cookie",
        };
      }
    }
    if (entry.agentHash !== hash(proof.agent))
      return {
        state: "cookie-rejected" as const,
        reason: "browser-agent-mismatch",
      };
    if (entry.revoked) return { state: "revoked" as const, reason: "revoked" };
    const now = this.now();
    if (now < entry.createdAt)
      return {
        state: "cookie-rejected" as const,
        reason: "clock-before-creation",
      };
    if (
      now >= entry.createdAt + OWNER_MAX_AGE ||
      (entry.expiresAt !== undefined && now >= entry.expiresAt) ||
      now >= entry.lastSeen + OWNER_IDLE
    )
      return {
        state: "session-expired" as const,
        reason: "absolute-or-idle-expiry",
      };
    if (entry.approvedAt === null) {
      if (now >= entry.createdAt + 300000)
        return {
          state: "request-expired" as const,
          reason: "approval-window-expired",
        };
      return {
        state: "pending-approval" as const,
        reason: "pending-approval",
        pairing: { id: entry.id, expiresAt: entry.createdAt + 300000 },
      };
    }
    return {
      state:
        entry.finishedAt === undefined
          ? ("finish-needed" as const)
          : ("remembered" as const),
      reason: "accepted",
    };
  }
  private async allowed(
    s: State,
    proof: OwnerProof,
    selected: z.infer<typeof scope>,
    enabled: boolean,
  ): Promise<
    z.infer<typeof standingPolicySchema> & { providerIdentityHash?: string }
  > {
    const principal = await this.principal(s, proof, true);
    const entry = principal.entry;
    const p = s.policy;
    if (!enabled || !p || s.events.some((e) => e.kind === "revoke-policy"))
      return deny("ai_disabled");
    if (s.events.some((e) => e.kind === "provider-block"))
      return deny("provider_unavailable");
    if (!p.scopes.includes(selected)) return deny("scope_denied");
    const fixedCampaign = this.campaignEntry(s, entry);
    const quota = entry.allocationId
      ? await this.quotaProof(s, proof)
      : undefined;
    if (
      !entry.allocationId &&
      s.quotaCampaign &&
      proof.recordsOwnerDigest === s.quotaCampaign.recordsOwnerDigest
    )
      return deny("quota_campaign_browser_approval_required");
    if (
      (principal.recovered || fixedCampaign) &&
      (selected !== "customer" || proof.channel !== "records")
    )
      return deny("scope_denied");
    const reservations = s.events.filter((e) => e.kind === "reserve");
    const evaluation = quota
      ? s.evaluation!
      : s.evaluation?.sessionId === entry.id
        ? s.evaluation
        : null;
    if (evaluation && (proof.origin ?? OWNER_ORIGIN) !== OWNER_ORIGIN)
      return deny("scope_denied");
    const used = reservations.filter((e) =>
      evaluation ? e.allocationId === evaluation.id : !e.allocationId,
    ).length;
    const limit =
      evaluation?.id === RECOVERY_EVALUATION
        ? quota && s.northGuideCampaign
          ? // Only the independently validated NEW grant can exceed the immutable
            // historical 300 ceiling. Legacy/standing allocations keep their caps.
            quota.executionLimit
          : Math.min(
              evaluation.requestLimit,
              quota?.executionLimit ?? CAMPAIGN_EXECUTION_LIMIT,
            )
        : (evaluation?.requestLimit ?? p.requestLimit);
    if (used >= limit) return deny("quota_exhausted");
    if (
      reservations.filter(
        (e) =>
          !s.events.some(
            (v) =>
              v.subject === e.subject &&
              ["completed", "failed", "unknown"].includes(v.kind),
          ),
      ).length >= p.concurrency
    )
      return deny("busy");
    if (
      reservations.filter((e) => e.at > this.now() - 60000).length >=
      p.requestsPerMinute
    )
      return deny("rate_limited");
    return principal.recovered || fixedCampaign
      ? {
          ...p,
          requestLimit: limit,
          maxRetries: 0,
          concurrency: 1,
          scopes: ["customer"] as ("customer" | "customer-studio")[],
          ...(quota
            ? { providerIdentityHash: quota.providerIdentityHash }
            : {}),
        }
      : p;
  }
  async pair(
    agent: string,
    existingToken?: string,
    recordsOwnerDigest?: string,
  ) {
    const token = randomBytes(32).toString("hex");
    return this.change(async (s) => {
      // A second tab/reload must not replace a valid or pending browser secret.
      // Returning the existing public request ID does not renew its cookie.
      let campaignBrowser = false;
      if (existingToken) {
        const prior = s.sessions.find(
          (v) => v.tokenHash === hash(existingToken),
        );
        const recoverySecret =
          (await this.recovery.read())?.activation?.tokenHash ===
          hash(existingToken);
        if (
          s.quotaCampaign &&
          (prior?.allocationId === RECOVERY_EVALUATION || recoverySecret)
        ) {
          await this.quotaProof(s, {
            agent,
            recordsOwnerDigest,
            origin: OWNER_ORIGIN,
          });
          if (campaignBudget(s.events).activeQuestion) return deny("busy");
          campaignBrowser = true;
        } else if (
          (prior?.id === RECOVERY_SESSION && prior.revoked) ||
          recoverySecret
        )
          return deny("evaluation_recovery_pairing_denied");
      }
      if (
        s.quotaCampaign &&
        recordsOwnerDigest === s.quotaCampaign.recordsOwnerDigest
      ) {
        await this.quotaProof(s, {
          agent,
          recordsOwnerDigest,
          origin: OWNER_ORIGIN,
        });
        if (campaignBudget(s.events).activeQuestion) return deny("busy");
        campaignBrowser = true;
      }
      const existing = await this.inspectBrowser(s, {
        token: existingToken,
        agent,
      });
      const priorAllocation = s.sessions.find(
        (v) => v.tokenHash === hash(existingToken ?? ""),
      )?.allocationId;
      if (
        existing.state === "pending-approval" &&
        (!campaignBrowser || priorAllocation)
      )
        return {
          id: existing.pairing!.id,
          token: existingToken!,
          reused: true,
        };
      if (
        (existing.state === "remembered" ||
          existing.state === "finish-needed") &&
        (!campaignBrowser || priorAllocation)
      )
        return {
          id: s.sessions.find((v) => v.tokenHash === hash(existingToken!))!.id,
          token: existingToken!,
          reused: true,
        };
      if (
        s.events.filter((e) => e.kind === "pair" && e.at > this.now() - 3600000)
          .length >= 10
      )
        return deny("pair_rate_limited");
      const id = randomUUID();
      s.sessions.push({
        id,
        tokenHash: hash(token),
        agentHash: hash(agent),
        createdAt: this.now(),
        lastSeen: this.now(),
        approvedAt: null,
        revoked: false,
        ...(campaignBrowser ? { allocationId: RECOVERY_EVALUATION } : {}),
      });
      this.event(s, "pair", id);
      if (campaignBrowser) s.events.at(-1)!.allocationId = RECOVERY_EVALUATION;
      return { id, token, reused: false };
    });
  }
  /** Only the local owner CLI calls this. No web approval endpoint. */
  async approve(id: string) {
    z.uuid().parse(id);
    return this.change(async (s) => {
      const entry = s.sessions.find((v) => v.id === id);
      if (
        !entry ||
        entry.revoked ||
        entry.approvedAt !== null ||
        this.now() >= entry.createdAt + 300000 ||
        this.now() < entry.createdAt
      )
        return deny("pair_expired");
      if (entry.allocationId) {
        const q = await this.quotaPolicy(s);
        if (entry.agentHash !== q.agentHash) return deny("scope_denied");
        if (
          s.sessions.some(
            (other) =>
              other.id !== entry.id &&
              other.allocationId === RECOVERY_EVALUATION &&
              !other.revoked &&
              other.approvedAt !== null &&
              this.now() < other.createdAt + OWNER_MAX_AGE &&
              this.now() < other.lastSeen + OWNER_IDLE,
          )
        )
          return deny("quota_campaign_browser_already_approved");
      }
      entry.approvedAt = this.now();
      this.event(s, "approve", id);
    });
  }
  /** Exact separate owner approval required; never called by HTTP/startup. */
  async installPolicy(value: unknown) {
    const policy = standingPolicySchema.parse(value);
    return this.change((s) => {
      if (
        s.policy ||
        s.events.some((e) => e.kind === "reserve") ||
        policy.approvedAt > this.now()
      )
        return deny("policy_already_set_or_invalid");
      s.policy = policy;
      this.event(s, "approve-policy", hash(JSON.stringify(policy)));
    });
  }
  /** Host-only exact approval. Approves ONE pending browser and its independent
   * allocation atomically. No replacement, renewal, paid scope or old-slot use. */
  async approveEvaluation(value: unknown) {
    const approval = evaluationApprovalSchema.parse(value);
    return this.change((s) => {
      const entry = s.sessions.find((v) => v.id === approval.sessionId);
      if (
        s.evaluation ||
        !s.policy ||
        approval.policyId !== s.policy.id ||
        approval.policyHash !== hash(JSON.stringify(s.policy)) ||
        approval.approvedAt < s.policy.approvedAt ||
        approval.approvedAt > this.now() ||
        approval.expiresAt <= this.now() ||
        approval.expiresAt > approval.approvedAt + 86400000 ||
        !entry ||
        entry.revoked ||
        entry.approvedAt !== null ||
        entry.expiresAt !== undefined ||
        this.now() < entry.createdAt ||
        this.now() >= entry.createdAt + 300000 ||
        approval.expiresAt > entry.createdAt + 86400000 ||
        s.events.some((e) =>
          ["revoke-policy", "provider-block"].includes(e.kind),
        ) ||
        s.events.some(
          (e) =>
            e.kind === "reserve" &&
            !s.events.some(
              (v) =>
                v.subject === e.subject &&
                ["completed", "failed", "unknown"].includes(v.kind),
            ),
        )
      )
        return deny("evaluation_not_approved");
      s.evaluation = {
        ...approval,
        baselineEventCount: s.events.length,
        baselineEventHash: hash(JSON.stringify(s.events)),
      };
      entry.approvedAt = this.now();
      entry.expiresAt = approval.expiresAt;
      this.event(s, "approve-evaluation", approval.id);
    });
  }
  async authenticate(
    proof: OwnerProof,
    requiredScope?: "customer" | "customer-studio",
  ) {
    return this.change(async (s) => {
      await this.additionalOrigin(s, proof.origin);
      const principal = await this.principal(s, proof);
      if (
        (principal.recovered || this.campaignEntry(s, principal.entry)) &&
        (proof.channel !== "records" || requiredScope === "customer-studio")
      )
        return deny("scope_denied");
      const entry = principal.entry;
      if (entry.allocationId) await this.quotaProof(s, proof);
      // Bound write volume; absolute lifetime never slides.
      if (!principal.recovered && this.now() - entry.lastSeen >= 3600000) {
        entry.lastSeen = this.now();
        this.event(s, "touch", entry.id);
      }
      return entry.id;
    });
  }
  async finishBrowser(proof: OwnerProof) {
    return this.change(async (s) => {
      const browser = await this.inspectBrowser(s, proof);
      if (browser.state !== "finish-needed" && browser.state !== "remembered")
        return deny(browser.state.replaceAll("-", "_"));
      const entry = await this.session(s, proof);
      if (entry.finishedAt === undefined) {
        entry.finishedAt = this.now();
        this.event(s, "finish-browser", entry.id);
      }
      // Finishing never extends the original absolute lifetime or grants AI.
      return Math.min(
        entry.createdAt + OWNER_MAX_AGE,
        entry.expiresAt ?? Infinity,
      );
    });
  }
  async revokeSession(id: string) {
    await this.change((s) => {
      const entry = s.sessions.find((v) => v.id === id);
      if (!entry) return deny("signin_required");
      entry.revoked = true;
      this.event(s, "revoke-session", id);
    });
    if (id === RECOVERY_SESSION)
      await this.disableEvaluationRecovery("session-revoked");
  }
  async logout(proof: OwnerProof, pendingChallenge?: string): Promise<void> {
    const ids = await this.change(async (s) => {
      // A cancellation is not an authentication upgrade. Never require a live
      // inference principal to kill a grant the caller cryptographically owns.
      const normalCampaign = s.sessions.some(
        (entry) =>
          entry.allocationId && entry.tokenHash === hash(proof.token ?? ""),
      );
      const bound = normalCampaign
        ? null
        : await this.recovery.cancellationBound(proof, pendingChallenge);
      const entry = bound
        ? s.sessions.find((x) => x.id === RECOVERY_SESSION)
        : await this.session(s, proof);
      if (!entry) return deny("evaluation_recovery_cancel_failed");
      const alreadyCancelled =
        !!bound &&
        s.events
          .slice(bound.checkpointEventCount)
          .some(
            (e) =>
              e.subject === RECOVERY_SESSION &&
              ["logout", "revoke-session"].includes(e.kind),
          );
      const entries = [entry];
      // Preserve ordinary logout if this same browser also presents a separate
      // valid normal credential. Cancellation must not leave that login live.
      if (
        bound &&
        proof.token &&
        s.sessions.some(
          (x) =>
            x.id !== RECOVERY_SESSION && x.tokenHash === hash(proof.token!),
        )
      ) {
        try {
          entries.push(await this.session(s, proof));
        } catch (error) {
          if (
            !(error instanceof CareError) ||
            error.code !== "careos_owner_signin_required"
          )
            throw error;
        }
      }
      for (const selected of entries) {
        // A holder of the same records cookie may cancel repeatedly, but must
        // not fill the shared owner journal with redundant revocation events.
        if (selected.id === RECOVERY_SESSION && alreadyCancelled) continue;
        selected.revoked = true;
        this.event(s, "logout", selected.id);
      }
      return entries.map((x) => x.id);
    });
    if (ids.includes(RECOVERY_SESSION))
      await this.disableEvaluationRecovery("logout");
  }
  async revokePolicy(proof: OwnerProof) {
    await this.change(async (s) => {
      const entry = await this.session(s, proof);
      this.event(
        s,
        entry.allocationId ? "revoke-quota-campaign" : "revoke-policy",
        entry.allocationId ?? s.policy?.id ?? "disabled",
      );
    });
    await this.disableEvaluationRecovery("policy-revoked");
  }
  async assertDispatch(
    proof: OwnerProof,
    selected: z.infer<typeof scope>,
    enabled: boolean,
    stageKey?: string,
  ) {
    // Same cross-process lock as logout/revocation/accounting, not the provider lock.
    return this.files.lockedWaiting(async () => {
      const state = await this.state();
      await this.additionalOrigin(state, proof.origin);
      const policy = await this.allowed(state, proof, selected, enabled);
      const principal = await this.principal(state, proof, true);
      if (this.campaignEntry(state, principal.entry))
        assertCampaignStage(state.events, stageKey ?? "");
      return policy;
    }, ".owner-access-lock");
  }
  /** Server-only quota selection, not inference authority or a visitor flag.
   * Missing/expired/ordinary browsers keep the original application limits. */
  async evaluationQuotaAccess(proof: OwnerProof, enabled: boolean) {
    return this.files.lockedWaiting(async () => {
      const s = await this.state();
      if (!s.evaluation) return false;
      try {
        const session = await this.session(s, proof);
        if (
          !this.campaignEntry(s, session) &&
          session.id !== s.evaluation.sessionId
        )
          return false;
        await this.additionalOrigin(s, proof.origin);
        await this.allowed(s, proof, "customer", enabled);
        return s.evaluation.fastApplicationQuotaApproved;
      } catch (error) {
        if (error instanceof CareError) return false;
        throw error;
      }
    }, ".owner-access-lock");
  }
  /** Holds worst-case whole-question capacity before any provider refresh/call.
   * Only append markers; never rewrite attempts or the historical grant. */
  async beginCampaignQuestion(
    proof: OwnerProof,
    requestId: string,
    conversationId: string,
    enabled: boolean,
  ) {
    return this.change(async (s) => {
      await this.additionalOrigin(s, proof.origin);
      await this.allowed(s, proof, "customer", enabled);
      const principal = await this.principal(s, proof, true);
      if (!this.campaignEntry(s, principal.entry)) return false;
      if (proof.channel !== "records") return deny("scope_denied");
      const subject = assertCampaignQuestionOpen(
        s.events,
        requestId,
        conversationId,
      );
      this.event(s, "question-open", subject);
      s.events.at(-1)!.allocationId = RECOVERY_EVALUATION;
      return true;
    });
  }
  /** Releases only demonstrably unstarted held slots, never charged attempts. */
  async finishCampaignQuestion(
    proof: OwnerProof,
    requestId: string,
    conversationId: string,
  ) {
    return this.change(async (s) => {
      await this.additionalOrigin(s, proof.origin);
      const principal = await this.principal(s, proof, false);
      if (
        !this.campaignEntry(s, principal.entry) ||
        proof.channel !== "records"
      )
        return deny("scope_denied");
      const subject = assertCampaignQuestionClose(
        s.events,
        requestId,
        conversationId,
      );
      this.event(s, "question-close", subject);
      s.events.at(-1)!.allocationId = RECOVERY_EVALUATION;
    });
  }
  async reserve(
    proof: OwnerProof,
    selected: z.infer<typeof scope>,
    key: string,
    enabled: boolean,
  ) {
    z.string().min(1).max(200).parse(key);
    return this.change(async (s) => {
      await this.additionalOrigin(s, proof.origin);
      await this.allowed(s, proof, selected, enabled);
      const principal = await this.principal(s, proof, true);
      if (
        principal.recovered &&
        !/^customer:[a-f0-9-]{36}:(north_conversation_v1|careos_care)$/.test(
          key,
        )
      )
        return deny("scope_denied");
      if (s.events.some((e) => e.kind === "reserve" && e.subject === key))
        return deny("already_dispatched");
      if (this.campaignEntry(s, principal.entry))
        assertCampaignStage(s.events, key);
      this.event(s, "reserve", key);
      if (this.campaignEntry(s, principal.entry))
        s.events.at(-1)!.allocationId = RECOVERY_EVALUATION;
      else if (s.evaluation?.sessionId === principal.entry.id)
        s.events.at(-1)!.allocationId = s.evaluation.id;
    });
  }
  async settle(
    key: string,
    outcome: "completed" | "failed" | "unknown",
    observation?: unknown,
  ) {
    const allocation = await this.change((s) => {
      if (
        !s.events.some((e) => e.kind === "reserve" && e.subject === key) ||
        s.events.some(
          (e) =>
            ["completed", "failed", "unknown"].includes(e.kind) &&
            e.subject === key,
        )
      )
        return deny("settlement_conflict");
      this.event(s, outcome, key); // All outcomes retain one charged request.
      const allocationId = s.events.find(
        (e) => e.kind === "reserve" && e.subject === key,
      )?.allocationId;
      if (allocationId) s.events.at(-1)!.allocationId = allocationId;
      if (observation)
        s.events.at(-1)!.observation =
          eventSchema.shape.observation.parse(observation);
      return allocationId;
    });
    // Journal outcome is durable first. Even failed recovery-file I/O cannot
    // resurrect admission: the central validator rejects this journal tail.
    if (allocation === RECOVERY_EVALUATION && outcome !== "completed")
      await this.disableEvaluationRecovery(`provider-${outcome}`);
  }
  async assertHistoricalJournal(value: unknown) {
    const s = await this.state();
    if (
      !s.policy ||
      s.policy.historicalJournalHash !== hash(JSON.stringify(value))
    )
      return deny("history_mismatch");
  }
  async blockProvider() {
    await this.change((s) => {
      this.event(s, "provider-block", "permission-or-usage-denied");
    });
    await this.disableEvaluationRecovery("provider-blocked");
  }
  /** Host-only preparation; the CLI verifies actual owner answer/release receipts. */
  async prepareEvaluationRecovery(value: unknown) {
    return this.files.lockedWaiting(
      async () => this.recovery.prepare(await this.state(), value),
      ".owner-access-lock",
    );
  }
  /** Exact host-only release transition; no web endpoint or token issuance. */
  async transitionEvaluationRecovery(value: unknown) {
    return this.files.lockedRecoveryTransition(async () =>
      this.recovery.transition(await this.state(), value),
    );
  }
  /** Server-private fixed manifest. Never return this from an HTTP endpoint. */
  async evaluationRecoveryBinding() {
    return this.files.lockedWaiting(async () => {
      const doc = await this.recovery.read();
      if (!doc) return deny("evaluation_recovery_denied");
      await this.recovery.validate(await this.state(), doc, false);
      return { binding: doc.binding, bindingHash: recoveryHash(doc.binding) };
    }, ".owner-access-lock");
  }
  async requestEvaluationRecovery(
    proof: OwnerProof,
    evidence: RecoveryHistoryEvidence,
  ) {
    return this.files.lockedWaiting(
      async () => this.recovery.request(await this.state(), proof, evidence),
      ".owner-access-lock",
    );
  }
  async approveEvaluationRecovery(id: string, bindingHash: string) {
    z.uuid().parse(id);
    digest.parse(bindingHash);
    return this.files.lockedWaiting(
      async () => this.recovery.approve(await this.state(), id, bindingHash),
      ".owner-access-lock",
    );
  }
  async finishEvaluationRecovery(
    proof: OwnerProof,
    challenge: string | undefined,
    evidence: RecoveryHistoryEvidence,
  ) {
    return this.files.lockedWaiting(
      async () =>
        this.recovery.finish(await this.state(), proof, challenge, evidence),
      ".owner-access-lock",
    );
  }
  /** Must succeed durably BEFORE a controlled fallback. No swallowing failure. */
  async disableEvaluationRecovery(reason = "controlled-fallback") {
    z.string().min(1).max(120).parse(reason);
    return this.files.lockedWaiting(async () => {
      const cutoff = await this.recovery.postStopCheckpoint();
      const current = await this.state();
      if (
        current.quotaCampaign &&
        !["logout", "session-revoked"].includes(reason) &&
        !current.events.some((e) => e.kind === "revoke-quota-campaign")
      ) {
        this.event(
          current,
          "revoke-quota-campaign",
          recoveryHash(current.quotaCampaign),
        );
        current.events.at(-1)!.allocationId = RECOVERY_EVALUATION;
        await this.files.write("owner-state.json", stateSchema.parse(current));
      }
      if (cutoff !== null) {
        const s = await this.state();
        if (
          !s.events
            .slice(cutoff)
            .some(
              (e) =>
                e.subject === RECOVERY_SESSION &&
                ["logout", "revoke-session"].includes(e.kind),
            )
        ) {
          // The original grant is already terminal and remains byte-exact.
          // A fresh restriction after the approved cutoff stops continuation.
          this.event(s, "revoke-session", RECOVERY_SESSION);
          await this.files.write("owner-state.json", stateSchema.parse(s));
        }
      }
      return this.recovery.disable(reason);
    }, ".owner-access-lock");
  }
  /** No bearer token or issuance: engineering queue inspection, not dispatch authority. */
  async evaluationRecoveryStatus() {
    return this.files.lockedWaiting(async () => {
      const s = await this.state();
      const budget = campaignBudget(s.events);
      const base = {
        active: false,
        evaluationId: RECOVERY_EVALUATION,
        sessionId: RECOVERY_SESSION,
        originalBrowserRevoked:
          s.sessions.find((x) => x.id === RECOVERY_SESSION)?.revoked === true,
        expiresAt: RECOVERY_DEADLINE,
        baselineUsed: 63,
        historicalLimit: budget.historicalLimit,
        executionLimit: budget.executionLimit,
        maxAdditional: CAMPAIGN_EXECUTION_LIMIT - 63,
        used: budget.used,
        remaining: budget.remaining,
        held: budget.held,
        availableForNewQuestion: budget.availableForNewQuestion,
        questionActive: !!budget.activeQuestion,
      };
      try {
        const doc = await this.recovery.read();
        if (!doc) return { ...base, phase: "absent" };
        const audit = {
          phase: doc.phase,
          activationSequence: doc.activation?.sequence ?? null,
          revocationCutoff: {
            eventCount: doc.binding.checkpointEventCount,
            eventHash: doc.binding.checkpointEventHash,
          },
        };
        const cutoff = await this.recovery.postStopCheckpoint();
        if (doc.phase !== "active" && cutoff === null)
          return { ...base, ...audit };
        const valid = await this.recovery.validate(s, doc);
        return {
          ...base,
          ...audit,
          active: true,
          phase: cutoff === null ? doc.phase : "continued",
          revocationCutoff:
            cutoff === null
              ? audit.revocationCutoff
              : {
                  eventCount: cutoff,
                  eventHash: recoveryHash(s.events.slice(0, cutoff)),
                },
          remaining: Math.min(valid.remaining, budget.remaining),
        };
      } catch {
        return { ...base, phase: "invalid-or-ineligible" };
      }
    }, ".owner-access-lock");
  }
  /** Read-only host inspection of policy, not browser/provider authority. */
  async quotaCampaignStatus() {
    return this.files.lockedWaiting(async () => {
      const s = await this.state();
      if (!s.quotaCampaign) return { active: false as const };
      const budget = campaignBudget(s.events);
      try {
        const q = await this.quotaPolicy(s);
        return {
          active: true as const,
          campaignId: q.campaignId,
          ownerApprovalHash: q.ownerApprovalHash,
          authorizationHash: recoveryHash(
            s.northGuideCampaign ?? s.quotaCampaignExtension ?? s.quotaCampaign,
          ),
          executionLimit: q.executionLimit,
          baselineUsed: q.baselineUsed,
          maxAdditional: q.maxAdditional,
          approvedAt: q.approvedAt,
          browserSessionId:
            s.sessions.find(
              (entry) =>
                entry.allocationId === RECOVERY_EVALUATION &&
                !entry.revoked &&
                entry.approvedAt !== null &&
                this.now() < entry.createdAt + OWNER_MAX_AGE &&
                this.now() < entry.lastSeen + OWNER_IDLE,
            )?.id ?? null,
          calendarExpiresAt: null,
          used: budget.used,
          remaining: budget.remaining,
          held: budget.held,
        };
      } catch {
        return {
          active: false as const,
          used: budget.used,
          remaining: budget.remaining,
        };
      }
    }, ".owner-access-lock");
  }
  async status(proof: OwnerProof, diagnostic?: (reason: string) => void) {
    await this.files.prepare();
    const s = await this.state();
    const browser = await this.inspectBrowser(s, proof);
    diagnostic?.(browser.reason);
    let remembered = false;
    let currentEntry: State["sessions"][number] | undefined;
    let browserCompletion: "not-verified" | "finish-needed" | "complete" =
      "not-verified";
    try {
      const entry = await this.session(s, proof);
      remembered = true;
      currentEntry = entry;
      browserCompletion =
        entry.finishedAt === undefined ? "finish-needed" : "complete";
    } catch {
      /* No authority from status. */
    }
    const originalUsed = s.events.filter(
      (e) => e.kind === "reserve" && !e.allocationId,
    ).length;
    const evaluation = s.evaluation;
    const evaluationUsed = evaluation
      ? s.events.filter(
          (e) => e.kind === "reserve" && e.allocationId === evaluation.id,
        ).length
      : 0;
    // Identification for rejected-credential status is NOT authorization. A
    // disabled recovery credential must never advertise the original 26 slots.
    let recoveryCredential = false;
    try {
      const doc = await this.recovery.read();
      recoveryCredential =
        !!doc?.activation &&
        doc.activation.tokenHash === hash(proof.token ?? "") &&
        doc.binding.evaluationId === evaluation?.id &&
        doc.binding.sessionId === evaluation?.sessionId;
    } catch {
      /* Malformed recovery cannot grant browser recognition. */
    }
    const identifiedQuota = s.sessions.find(
      (entry) =>
        entry.allocationId && entry.tokenHash === hash(proof.token ?? ""),
    );
    const evaluationBrowser =
      !!identifiedQuota ||
      recoveryCredential ||
      (!!evaluation &&
        s.sessions.some(
          (v) =>
            v.id === evaluation.sessionId &&
            v.tokenHash === hash(proof.token ?? ""),
        ));
    const used = evaluationBrowser ? evaluationUsed : originalUsed;
    const budget =
      evaluation?.id === RECOVERY_EVALUATION ? campaignBudget(s.events) : null;
    const limit = evaluationBrowser
      ? (budget?.executionLimit ?? evaluation!.requestLimit)
      : (s.policy?.requestLimit ?? 0);
    let quotaAuthorized = false;
    if (currentEntry?.allocationId) {
      try {
        await this.quotaProof(s, proof);
        quotaAuthorized = true;
      } catch {
        /* No authority from status. */
      }
    }
    return {
      remembered,
      browserCompletion,
      browserAccess: browser.state,
      originalBrowserRevoked:
        (recoveryCredential &&
          s.sessions.find((x) => x.id === RECOVERY_SESSION)?.revoked ===
            true) ||
        browser.state === "revoked",
      recoveryActive: browser.state === "recovery-active",
      pairing: browser.pairing ?? null,
      policyId: s.policy?.id ?? null,
      requestLimit: limit,
      concurrency:
        browser.state === "recovery-active" || identifiedQuota
          ? 1
          : (s.policy?.concurrency ?? 0),
      requestsPerMinute: s.policy?.requestsPerMinute ?? 0,
      maxRetries:
        browser.state === "recovery-active" || identifiedQuota
          ? 0
          : (s.policy?.maxRetries ?? 0),
      providerBlocked: s.events.some((e) => e.kind === "provider-block"),
      policy: s.policy ? "approved" : "disabled",
      revoked: s.events.some(
        (e) =>
          e.kind === "revoke-policy" ||
          (evaluationBrowser && e.kind === "revoke-quota-campaign"),
      ),
      used,
      remaining: s.policy ? Math.max(0, limit - used) : 0,
      campaign:
        evaluationBrowser && budget
          ? {
              historicalLimit: budget.historicalLimit,
              executionLimit: budget.executionLimit,
              historicalRemaining: Math.max(
                0,
                budget.historicalLimit - budget.used,
              ),
              baselineUsed:
                s.northGuideCampaign?.baselineUsed ??
                s.quotaCampaignExtension?.baselineUsed ??
                63,
              maxAdditional:
                identifiedQuota && s.quotaCampaign
                  ? (s.northGuideCampaign?.maxAdditional ??
                    s.quotaCampaignExtension?.maxAdditional ??
                    s.quotaCampaign.maxAdditional)
                  : CAMPAIGN_EXECUTION_LIMIT - 63,
              used: budget.used,
              remaining: budget.remaining,
              held: budget.held,
              availableForNewQuestion: budget.availableForNewQuestion,
              questionActive: !!budget.activeQuestion,
              maxQuestionStages: QUESTION_MAX_STAGES,
              ...(identifiedQuota
                ? {
                    authorization: "quota-bounded" as const,
                    authorized: quotaAuthorized,
                    calendarExpiresAt: null,
                    browserExpiresAt: Math.min(
                      identifiedQuota.createdAt + OWNER_MAX_AGE,
                      identifiedQuota.lastSeen + OWNER_IDLE,
                    ),
                  }
                : {}),
            }
          : null,
      standingAllocation: {
        used: originalUsed,
        remaining: s.policy
          ? Math.max(0, s.policy.requestLimit - originalUsed)
          : 0,
      },
      unknown: s.events.filter(
        (e) =>
          e.kind === "reserve" &&
          !s.events.some(
            (v) =>
              ["completed", "failed"].includes(v.kind) &&
              v.subject === e.subject,
          ),
      ).length,
      evaluation: s.evaluation
        ? {
            id: s.evaluation.id,
            limit: budget?.executionLimit ?? s.evaluation.requestLimit,
            historicalLimit: s.evaluation.requestLimit,
            expiresAt: identifiedQuota ? null : s.evaluation.expiresAt,
            originalExpiresAt: s.evaluation.expiresAt,
            used: s.events.filter(
              (e) =>
                e.kind === "reserve" && e.allocationId === s.evaluation!.id,
            ).length,
            remaining: Math.max(
              0,
              (budget?.executionLimit ?? s.evaluation.requestLimit) -
                s.events.filter(
                  (e) =>
                    e.kind === "reserve" && e.allocationId === s.evaluation!.id,
                ).length,
            ),
            browserBound:
              (!!identifiedQuota ||
                recoveryCredential ||
                s.sessions.some(
                  (v) =>
                    v.id === s.evaluation!.sessionId &&
                    v.tokenHash === hash(proof.token ?? ""),
                )) &&
              remembered,
          }
        : null,
    };
  }
}

export function assertOwnerRequest(
  request: Request,
  mutation: boolean,
  origin: string = OWNER_ORIGIN,
) {
  if (
    ![OWNER_ORIGIN, northReviewOrigin].includes(origin) ||
    request.headers.get("host") !== new URL(origin).host ||
    ((mutation || request.headers.has("origin")) &&
      request.headers.get("origin") !== origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return deny("origin_rejected");
}
