import { afterEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  StandingOwner,
  evaluationRecoveryCheckpoint,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import {
  EvaluationRecovery,
  RECOVERY_FILE,
  RECOVERY_TRANSITION_FILE,
  RECOVERY_TRANSITION_FROM,
  RECOVERY_TRANSITION_OWNER_APPROVAL,
  RECOVERY_OWNER_APPROVAL,
  RECOVERY_SESSION,
  RECOVERY_EVALUATION,
  RECOVERY_DEADLINE,
  RECOVERY_ORIGIN,
  POST_STOP_RESTRICTION_EVENT,
  evaluationRecoverySchema,
  recoveryHash,
  recoveryHistoryHash,
  createPostStopProposal,
  postStopApprovalSchema,
} from "../../src/lib/careos/evaluation-recovery";
import {
  preparePostStopContinuation,
  postStopEngineeringReceiptSchema,
} from "../../scripts/transition-north-recovery";

// Entirely synthetic secrets/history/state. Only the nonsecret terminal event
// identity/time/count mirror the fixed incident metadata; no private copies.
const terminalAt = 1794034945391;
const roots: string[] = [];
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
class Files extends PilotFiles {
  uncertain = false;
  override async write(
    name: Parameters<PilotFiles["write"]>[0],
    value: unknown,
  ) {
    await super.write(name, value);
    if (this.uncertain && name === RECOVERY_TRANSITION_FILE)
      throw Error("write_then_throw");
  }
}
async function fixture() {
  await mkdir("/tmp/opencode", { recursive: true });
  const root = await mkdtemp("/tmp/opencode/post-stop-unit-");
  roots.push(root);
  const files = new Files(root);
  await files.prepare();
  let clock = terminalAt + 10000;
  const now = () => clock++;
  const base = terminalAt - 100000;
  const token = "e".repeat(64),
    oldToken = "d".repeat(64),
    agent = "synthetic-browser";
  const policy: NonNullable<OwnerState["policy"]> = {
    id: randomUUID(),
    approvedAt: base - 3600000,
    provider: "chatgpt-subscription" as const,
    model: "gpt-6.1-sol" as const,
    reasoning: "medium" as const,
    origin: RECOVERY_ORIGIN,
    scopes: ["customer", "customer-studio"] as (
      "customer" | "customer-studio"
    )[],
    requestLimit: 300,
    concurrency: 4,
    requestsPerMinute: 30,
    maxRetries: 1,
    creditsDisabledConfirmed: true as const,
    providerPermissionConfirmed: true as const,
    historicalJournalHash: sha("untouched historical unknown"),
  };
  const events: OwnerState["events"] = [];
  for (let n = 0; n < 337; n++) {
    const subject = `customer:${randomUUID()}:north_conversation_v1`;
    const allocation = n >= 274 ? { allocationId: RECOVERY_EVALUATION } : {};
    const at = base - (338 - n) * 5000;
    events.push(
      { id: randomUUID(), at, kind: "reserve", subject, ...allocation },
      {
        id: randomUUID(),
        at: at + 1,
        kind: n === 0 ? "unknown" : "completed",
        subject,
        ...allocation,
        observation: { httpStatus: 200 },
      },
    );
  }
  events.push({
    id: randomUUID(),
    at: base - 2000,
    kind: "revoke-session",
    subject: RECOVERY_SESSION,
  });
  for (let n = 0; n < 109; n++)
    events.push({
      id: randomUUID(),
      at: base - 1000 + n,
      kind: "touch",
      subject: RECOVERY_SESSION,
    });
  const state: OwnerState = {
    version: 1,
    policy,
    evaluation: {
      id: RECOVERY_EVALUATION,
      policyId: policy.id,
      policyHash: recoveryHash(policy),
      approvedAt: base - 600000,
      expiresAt: RECOVERY_DEADLINE,
      sessionId: RECOVERY_SESSION,
      requestLimit: 300,
      purpose: "north-language-300",
      fastApplicationQuotaApproved: true,
      baselineEventCount: 548,
      baselineEventHash: recoveryHash(events.slice(0, 548)),
    },
    sessions: [
      {
        id: RECOVERY_SESSION,
        tokenHash: sha(oldToken),
        agentHash: sha(agent),
        createdAt: base - 12 * 3600000,
        lastSeen: base - 1000,
        approvedAt: base - 600000,
        finishedAt: base - 599000,
        expiresAt: RECOVERY_DEADLINE,
        revoked: true,
      },
    ],
    events,
  };
  const checkpoint = evaluationRecoveryCheckpoint(state);
  const oldGate = {
    release: { ...RECOVERY_TRANSITION_FROM },
    ciReceiptHash: sha("old-ci"),
    securityReviewHash: sha("old-security"),
    preservationHash: sha("old-preservation"),
    preservationOwnerStateHash: checkpoint.ownerStateHash,
    providerEligibilityHash: sha("old-provider"),
    providerEligibilityCheckedAt: base,
    fallback: {
      release: { ...RECOVERY_TRANSITION_FROM },
      evidenceHash: sha("old-fallback"),
      ciReceiptHash: sha("old-fallback-ci"),
      ciRunId: 1,
      recoveryAware: true as const,
      startupHttpsPassed: true as const,
      oldCredentialDenied: true as const,
      injectedRecoveryLogoutPassed: true as const,
    },
  };
  const history = Array.from({ length: 15 }, (_, n) => ({
    conversationId: randomUUID(),
    turnCount: n === 14 ? 2 : 4,
    turnsHash: sha(`synthetic-history-${n}`),
  }));
  const binding = {
    recordsOwnerDigest: sha("synthetic records secret"),
    history,
    checkpoint,
    gates: oldGate,
    evaluationId: RECOVERY_EVALUATION,
    sessionId: RECOVERY_SESSION,
    expiresAt: RECOVERY_DEADLINE,
    baselineUsed: 63,
    maxAdditional: 237,
    requestLimit: 300,
    ownerApprovalHash: RECOVERY_OWNER_APPROVAL,
    policyHash: checkpoint.policyHash,
    evaluationHash: checkpoint.evaluationHash,
    originalSessionHash: checkpoint.originalSessionHash,
    agentHash: sha(agent),
    checkpointEventCount: 784,
    checkpointEventHash: checkpoint.eventHash,
  };
  const challengeId = randomUUID();
  const doc = evaluationRecoverySchema.parse({
    version: 1,
    phase: "disabled",
    binding,
    challenge: {
      id: challengeId,
      tokenHash: sha("spent synthetic challenge"),
      createdAt: base + 100,
      expiresAt: base + 300000,
    },
    approval: {
      at: base + 200,
      bindingHash: recoveryHash(binding),
      challengeId,
    },
    activation: { at: base + 300, tokenHash: sha(token), sequence: 1 },
    disabled: { at: terminalAt - 1, reason: "original-terminal-stop" },
    audit: ["prepare", "challenge", "approve", "activate", "disable"].map(
      (action, n) => ({
        action,
        sequence: n + 1,
        at: n === 4 ? terminalAt : base + n * 100 + 1,
      }),
    ),
  });
  state.events.push({
    id: POST_STOP_RESTRICTION_EVENT,
    at: terminalAt,
    kind: "revoke-session",
    subject: RECOVERY_SESSION,
  });
  const terminalCheckpoint = evaluationRecoveryCheckpoint(state);
  await files.write("owner-state.json", state);
  await files.write(RECOVERY_FILE, doc);
  const runtime = {
    release: {
      commit: "a".repeat(40),
      sourceHash: "b".repeat(64),
      buildId: "new-cap-aware-source",
    },
    ciReceiptHash: sha("new-ci"),
  };
  const { proposal, proposalHash } = createPostStopProposal({
    version: 1,
    kind: "explicit-post-stop-150",
    createdAt: now() - 1000,
    expiresAt: RECOVERY_DEADLINE,
    originalDocumentHash: (await files.snapshot(RECOVERY_FILE))!.hash,
    originalBindingHash: recoveryHash(binding),
    activationTokenHash: sha(token),
    terminalCheckpoint,
    terminalRestrictionEventId: POST_STOP_RESTRICTION_EVENT,
    fromRelease: oldGate.release,
    fromCiReceiptHash: oldGate.ciReceiptHash,
    release: runtime.release,
    ciReceiptHash: runtime.ciReceiptHash,
    securityReviewHash: sha("new-security"),
    preservationHash: sha("new-preservation"),
    offlineQaHash: sha("offline-actual-app-qa"),
    fallbackReadinessHash: sha("offline-fallback"),
    fallback: {
      ...oldGate.fallback,
      startupHttpsPassed: false,
      release: runtime.release,
      ciReceiptHash: runtime.ciReceiptHash,
      disableBeforeSwitch: true,
      managedEntrypointHash: sha("cap-aware-fallback-entry"),
    },
    pendingLiveChecks: [
      "private-production-https-switch",
      "same-source-fallback-https-smoke",
      "fresh-disabled-cookie-owned-records-get-and-provider-eligibility",
    ],
    historicalLimit: 300,
    executionLimit: 150,
    baselineUsed: 63,
    maxAdditional: 87,
    questionMaxStages: 2,
    maxRetries: 0,
    scope: "customer-records-including-personal-insights-native-sdk",
  });
  const approval = {
    version: 1,
    decision: "approve",
    kind: "explicit-post-stop-150",
    proposalHash,
    approvedAt: now() - 500,
    sameCredentialOnly: true,
    noWindowExtension: true,
  };
  const receipt = {
    version: 1,
    release: runtime.release,
    checkedAt: now(),
    originalDocumentHash: proposal.originalDocumentHash,
    originalBindingHash: proposal.originalBindingHash,
    ownerStateHash: terminalCheckpoint.ownerStateHash,
  };
  const historyReceipt = {
    ...receipt,
    ciReceiptHash: runtime.ciReceiptHash,
    recordsOwnerDigest: binding.recordsOwnerDigest,
    historyHash: recoveryHistoryHash(history),
    history,
    existingRecoveryCredentialVerified: true,
    serverOwnedRecordsProofVerified: true,
    allOriginalPrefixesUnchanged: true,
    ownerStatus: {
      browserAccess: "cookie-rejected",
      recoveryActive: false,
      originalBrowserRevoked: true,
      credentialRecognizedButDisabled: true,
      originalCredentialDenied: true,
      used: 63,
      historicalLimit: 300,
      effectiveLimit: 150,
      remaining: 87,
      unknown: 1,
      standingUsed: 274,
      standingRemaining: 26,
    },
  };
  const provider = {
    ...receipt,
    eligible: true,
    provider: "chatgpt-subscription",
    model: "gpt-6.1-sol",
    reasoning: "medium",
    creditsDisabledConfirmed: true,
    paidFallbackDisabled: true,
  };
  const live = {
    ...receipt,
    productionHttpsPassed: true,
    sameSourceFallbackHttpsPassed: true,
    originalGrantUnchanged: true,
  };
  const input = preparePostStopContinuation({
    proposal,
    approval,
    history: historyReceipt,
    provider,
    live,
  });
  const recovery = new EvaluationRecovery(files, now, async () => runtime);
  const proof = {
    token,
    agent,
    origin: RECOVERY_ORIGIN,
    recordsOwnerDigest: binding.recordsOwnerDigest,
    channel: "records" as const,
  };
  return {
    files,
    state,
    doc,
    input,
    proposal,
    approval,
    historyReceipt,
    provider,
    live,
    proof,
    oldToken,
    runtime,
    recovery,
    now,
    advance: (ms: number) => {
      clock += ms;
    },
    apply: () =>
      files.lockedRecoveryTransition(() => recovery.transition(state, input)),
    grant: () => readFile(`${root}/${RECOVERY_FILE}`, "utf8"),
    ledger: () => readFile(`${root}/owner-state.json`, "utf8"),
  };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("explicit future post-stop continuation (synthetic offline only)", () => {
  it("keeps live HTTPS unverified in the engineering proposal; only fresh post-approval live receipts can promote the gate", async () => {
    const c = await fixture();
    expect(c.proposal.fallback.startupHttpsPassed).toBe(false);
    expect(c.input.toGate.fallback.startupHttpsPassed).toBe(true);
    expect(() =>
      createPostStopProposal({
        ...c.proposal,
        fallback: { ...c.proposal.fallback, startupHttpsPassed: true },
      }),
    ).toThrow();
    for (const live of [
      { ...c.live, productionHttpsPassed: false },
      { ...c.live, sameSourceFallbackHttpsPassed: false },
      { ...c.live, checkedAt: c.approval.approvedAt },
    ])
      expect(() =>
        preparePostStopContinuation({
          proposal: c.proposal,
          approval: c.approval,
          history: c.historyReceipt,
          provider: c.provider,
          live,
        }),
      ).toThrow();
    expect(await c.files.snapshot(RECOVERY_TRANSITION_FILE)).toBeNull();
  });
  it("requires fresh explicit mock approval; preserves disabled bytes, all histories/accounting and same token across restart", async () => {
    const c = await fixture(),
      grant = await c.grant(),
      ledger = await c.ledger();
    await expect(c.recovery.resolve(c.state, c.proof)).rejects.toThrow();
    await c.apply();
    const restarted = new EvaluationRecovery(
      c.files,
      c.now,
      async () => c.runtime,
    );
    expect(await restarted.resolve(c.state, c.proof)).toMatchObject({
      used: 63,
      remaining: 87,
      effectiveCheckpointEventCount: 785,
      postStop: { executionLimit: 150, historicalLimit: 300 },
      doc: {
        phase: "disabled",
        audit: { length: 5 },
        binding: { requestLimit: 300, maxAdditional: 237 },
      },
    });
    expect(await restarted.postStopCheckpoint()).toBe(785);
    expect(await restarted.cancellationBound(c.proof)).toEqual({
      checkpointEventCount: 785,
    });
    expect(await restarted.continuationForStatus(c.state)).toMatchObject({
      remaining: 87,
    });
    await restarted.disable("never-rewrite-original");
    expect(await c.grant()).toBe(grant);
    expect(await c.ledger()).toBe(ledger);
    await expect(
      restarted.resolve(c.state, { ...c.proof, token: c.oldToken }),
    ).rejects.toThrow();
    expect(
      await restarted.resolve(c.state, { ...c.proof, channel: undefined }),
    ).toMatchObject({ used: 63, remaining: 87 });
    const owner = new StandingOwner(c.files, c.now, restarted);
    await expect(
      owner.assertDispatch(c.proof, "customer-studio", true),
    ).rejects.toThrow();
    await expect(
      owner.assertDispatch(
        { ...c.proof, channel: undefined },
        "customer",
        true,
      ),
    ).rejects.toThrow();
  });
  it.each([
    "missing",
    "old-approval",
    "wrong-approval",
    "stale-approval",
    "future-approval",
    "wrong-proposal",
    "wrong-token",
    "wrong-source",
    "old-fallback",
    "wrong-terminal",
    "extra-stop",
    "changed-prefix",
    "policy",
    "session",
    "history-before-approval",
    "provider-before-approval",
    "stale-live",
    "bad-budget",
    "malformed-approval",
    "clock",
    "expiry",
  ])("denies %s with zero authority writes", async (which) => {
    const c = await fixture(),
      p = c.input,
      w = p.postStop!;
    if (which === "missing") {
      delete p.postStop;
      p.ownerApprovalHash = RECOVERY_TRANSITION_OWNER_APPROVAL;
    }
    if (which === "old-approval")
      p.ownerApprovalHash = RECOVERY_TRANSITION_OWNER_APPROVAL;
    if (which === "wrong-approval") w.approvalHash = "0".repeat(64);
    if (which === "stale-approval")
      w.approval.approvedAt = w.approvedAt = terminalAt;
    if (which === "future-approval")
      w.approval.approvedAt = w.approvedAt = c.now() + 10000;
    if (["stale-approval", "future-approval"].includes(which)) {
      w.approvalHash = recoveryHash(w.approval);
      p.ownerApprovalHash = w.approvalHash;
    }
    if (which === "wrong-proposal") w.proposalHash = "0".repeat(64);
    if (which === "wrong-token") w.activationTokenHash = "0".repeat(64);
    if (which === "wrong-source") p.toGate.release.commit = "0".repeat(40);
    if (which === "old-fallback")
      p.toGate.fallback.release = { ...RECOVERY_TRANSITION_FROM };
    if (which === "wrong-terminal")
      w.terminalCheckpoint.eventHash = "0".repeat(64);
    if (which === "extra-stop")
      c.state.events.push({
        id: randomUUID(),
        at: c.now(),
        kind: "logout",
        subject: RECOVERY_SESSION,
      });
    if (which === "changed-prefix") c.state.events[0].subject = "changed";
    if (which === "policy") c.state.policy!.maxRetries = 0;
    if (which === "session") c.state.sessions[0].revoked = false;
    if (which === "history-before-approval") p.history.checkedAt = w.approvedAt;
    if (which === "provider-before-approval")
      p.toGate.providerEligibilityCheckedAt = w.approvedAt;
    if (which === "stale-live") w.liveChecks.checkedAt = c.now() - 300001;
    if (which === "bad-budget")
      (w as { executionLimit: number }).executionLimit = 151;
    if (which === "malformed-approval")
      Object.assign(w.approval, { extraAuthority: true });
    if (which === "clock") c.advance(-1000000);
    if (which === "expiry") c.advance(RECOVERY_DEADLINE - c.now());
    await c.files.write("owner-state.json", c.state);
    const grant = await c.grant(),
      ledger = await c.ledger();
    await expect(c.apply()).rejects.toThrow();
    expect(await c.files.snapshot(RECOVERY_TRANSITION_FILE)).toBeNull();
    expect(await c.grant()).toBe(grant);
    expect(await c.ledger()).toBe(ledger);
  });
  it("consumes only the unused one-shot transition, never a second approval or source", async () => {
    const c = await fixture();
    await c.apply();
    const record = await c.files.snapshot(RECOVERY_TRANSITION_FILE);
    await expect(c.apply()).rejects.toThrow();
    expect(await c.files.snapshot(RECOVERY_TRANSITION_FILE)).toEqual(record);
    c.runtime.release.commit = "0".repeat(40);
    await expect(c.recovery.resolve(c.state, c.proof)).rejects.toThrow();
  });
  it("keeps the restriction-only cutoff available after expiry, runtime mismatch and provider failure", async () => {
    const c = await fixture();
    await c.apply();
    c.advance(RECOVERY_DEADLINE - c.now());
    c.runtime.release.commit = "0".repeat(40);
    c.state.events.push({
      id: randomUUID(),
      at: c.now(),
      kind: "provider-block",
      subject: RECOVERY_SESSION,
    });
    expect(await c.recovery.postStopCheckpoint()).toBe(785);
    expect(await c.recovery.cancellationBound(c.proof)).toEqual({
      checkpointEventCount: 785,
    });
    await expect(c.recovery.resolve(c.state, c.proof)).rejects.toThrow();
  });
  it.each([
    "missing-token",
    "wrong-token",
    "agent",
    "records",
    "origin",
    "legacy-care",
  ])(
    "never treats the continuation witness as browser identity: %s",
    async (which) => {
      const c = await fixture();
      await c.apply();
      const proof: Parameters<EvaluationRecovery["resolve"]>[1] = {
        ...c.proof,
      };
      if (which === "missing-token") delete proof.token;
      if (which === "wrong-token") proof.token = "0".repeat(64);
      if (which === "agent") proof.agent = "different-browser";
      if (which === "records") proof.recordsOwnerDigest = "0".repeat(64);
      if (which === "origin") proof.origin = "https://example.invalid";
      if (which === "legacy-care") {
        delete proof.channel;
        await expect(
          new StandingOwner(c.files, c.now, c.recovery).assertDispatch(
            proof,
            "customer",
            true,
          ),
        ).rejects.toThrow();
      } else await expect(c.recovery.resolve(c.state, proof)).rejects.toThrow();
    },
  );
  it.each([
    "logout",
    "revoke-session",
    "provider-block",
    "revoke-policy",
    "failed",
    "unknown",
  ] as const)(
    "a FRESH %s after effective cutoff denies across restart, retaining original document",
    async (kind) => {
      const c = await fixture();
      await c.apply();
      const grant = await c.grant();
      c.state.events.push({
        id: randomUUID(),
        at: c.now(),
        kind,
        subject: RECOVERY_SESSION,
        ...(["failed", "unknown"].includes(kind)
          ? { allocationId: RECOVERY_EVALUATION }
          : {}),
      });
      const restarted = new EvaluationRecovery(
        c.files,
        c.now,
        async () => c.runtime,
      );
      await expect(restarted.resolve(c.state, c.proof)).rejects.toThrow();
      expect(await restarted.continuationForStatus(c.state)).toBeNull();
      expect(await restarted.cancellationBound(c.proof)).toEqual({
        checkpointEventCount: 785,
      });
      expect(await c.grant()).toBe(grant);
    },
  );
  it("allows at most 87 additional stages, counts 150 as exhausted without resetting historical300 or owner274/26/unknown1", async () => {
    const c = await fixture();
    await c.apply();
    for (let n = 0; n < 87; n++) {
      const subject = `customer:${randomUUID()}:north_conversation_v1`;
      c.state.events.push(
        {
          id: randomUUID(),
          at: c.now(),
          kind: "reserve",
          subject,
          allocationId: RECOVERY_EVALUATION,
        },
        {
          id: randomUUID(),
          at: c.now(),
          kind: "completed",
          subject,
          allocationId: RECOVERY_EVALUATION,
          observation: { httpStatus: 200 },
        },
      );
    }
    expect(await c.recovery.resolve(c.state, c.proof, false)).toMatchObject({
      used: 150,
      remaining: 0,
    });
    await expect(c.recovery.resolve(c.state, c.proof)).rejects.toThrow();
    expect(c.state.evaluation!.requestLimit).toBe(300);
    expect(
      c.state.events.filter((e) => e.kind === "reserve" && !e.allocationId),
    ).toHaveLength(274);
    expect(
      c.state.events.filter((e) => e.kind === "unknown" && !e.allocationId),
    ).toHaveLength(1);
  });
  it("accepts append-only question markers after the effective cutoff without changing the original prefix", async () => {
    const c = await fixture();
    await c.apply();
    const prefix = recoveryHash(c.state.events.slice(0, 785));
    const requestId = randomUUID(),
      conversationId = randomUUID();
    const marker = `customer:${requestId}:question:${conversationId}`;
    const stage = `customer:${requestId}:north_conversation_v1`;
    const append = (
      kind: OwnerState["events"][number]["kind"],
      subject: string,
    ) =>
      c.state.events.push({
        id: randomUUID(),
        at: c.now(),
        kind,
        subject,
        allocationId: RECOVERY_EVALUATION,
        ...(kind === "completed" ? { observation: { httpStatus: 200 } } : {}),
      });
    append("question-open", marker);
    expect(await c.recovery.resolve(c.state, c.proof)).toMatchObject({
      used: 63,
      remaining: 87,
    });
    append("reserve", stage);
    append("completed", stage);
    append("question-close", marker);
    expect(await c.recovery.resolve(c.state, c.proof)).toMatchObject({
      used: 64,
      remaining: 86,
    });
    expect(recoveryHash(c.state.events.slice(0, 785))).toBe(prefix);
  });
  it("retains the durable owner lock after write-then-throw, preventing authentication after restart", async () => {
    const c = await fixture(),
      grant = await c.grant(),
      ledger = await c.ledger();
    c.files.uncertain = true;
    await expect(c.apply()).rejects.toMatchObject({
      code: "pilot_transition_publication_uncertain_inspect_owner_lock",
    });
    expect(
      await readFile(`${c.files.directory}/.owner-access-lock`, "utf8"),
    ).toBe("");
    const restartedFiles = new PilotFiles(c.files.directory);
    const owner = new StandingOwner(
      restartedFiles,
      c.now,
      new EvaluationRecovery(restartedFiles, c.now, async () => c.runtime),
    );
    await expect(owner.authenticate(c.proof)).rejects.toThrow(
      "pilot_locked_inspect_before_recovery",
    );
    expect(await c.grant()).toBe(grant);
    expect(await c.ledger()).toBe(ledger);
  });
  it("proposal/approval and engineering schemas reject unknown fields, automatic approval and invented live read-back", async () => {
    const c = await fixture();
    expect(
      postStopApprovalSchema.safeParse({
        ...c.approval,
        decision: "engineering-approved",
      }).success,
    ).toBe(false);
    expect(
      postStopApprovalSchema.safeParse({ ...c.approval, extendWindow: true })
        .success,
    ).toBe(false);
    expect(
      postStopEngineeringReceiptSchema.safeParse({
        ...c.proposal,
        offlineActualApplicationQaPassed: false,
      }).success,
    ).toBe(false);
    expect(() =>
      preparePostStopContinuation({
        proposal: c.proposal,
        approval: c.approval,
        history: {
          ...c.historyReceipt,
          ownerStatus: {
            ...c.historyReceipt.ownerStatus,
            recoveryActive: true,
          },
        },
        provider: c.provider,
        live: c.live,
      }),
    ).toThrow();
    expect(() =>
      preparePostStopContinuation({
        proposal: c.proposal,
        approval: { ...c.approval, proposalHash: "0".repeat(64) },
        history: c.historyReceipt,
        provider: c.provider,
        live: c.live,
      }),
    ).toThrow();
  });
});
