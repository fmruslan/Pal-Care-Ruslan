import { afterEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import {
  StandingOwner,
  evaluationRecoveryCheckpoint,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  EvaluationRecovery,
  RECOVERY_FILE,
  RECOVERY_TRANSITION_FILE,
  RECOVERY_TRANSITION_FROM,
  RECOVERY_TRANSITION_OWNER_APPROVAL,
  RECOVERY_DEADLINE,
  RECOVERY_SESSION,
  RECOVERY_EVALUATION,
  RECOVERY_ORIGIN,
  recoveryHash,
  recoveryHistoryHash,
  evaluationRecoverySchema,
  type RecoveryTransitionPreparation,
} from "../../src/lib/careos/evaluation-recovery";
import {
  transitionHistoryReceiptSchema,
  transitionSecurityReceiptSchema,
  transitionPreservationReceiptSchema,
  transitionProviderReceiptSchema,
  transitionFallbackReceiptSchema,
  applyNorthRecoveryTransition,
} from "../../scripts/transition-north-recovery";
import { verifyNorthRecoveryInventory } from "../../scripts/north-recovery-fallback";

// Independent synthetic complete63 fixture. No private files/browser/DB/provider.
const roots: string[] = [];
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const key = () => `customer:${randomUUID()}:north_conversation_v1`;
class TransitionFiles extends PilotFiles {
  failTransition = false;
  publicationFailure?:
    | "write-then-throw"
    | "rename-then-throw"
    | "directory-open"
    | "directory-sync"
    | "directory-close";
  override async write(
    name: Parameters<PilotFiles["write"]>[0],
    value: unknown,
  ) {
    if (name === RECOVERY_TRANSITION_FILE && this.failTransition)
      throw Error("injected_transition_write_failure");
    await super.write(name, value);
    if (
      name === RECOVERY_TRANSITION_FILE &&
      this.publicationFailure === "write-then-throw"
    )
      throw Error("injected_write_acknowledgement_failure");
  }
  protected override async publishSnapshot(
    temp: string,
    name: Parameters<PilotFiles["write"]>[0],
  ) {
    await super.publishSnapshot(temp, name);
    if (
      name === RECOVERY_TRANSITION_FILE &&
      this.publicationFailure === "rename-then-throw"
    )
      throw Error("injected_rename_acknowledgement_failure");
  }
  protected override async openDirectory() {
    const published =
      this.publicationFailure &&
      (await this.snapshot(RECOVERY_TRANSITION_FILE));
    if (published && this.publicationFailure === "directory-open")
      throw Error("injected_directory_open_failure");
    const handle = await super.openDirectory();
    if (published && this.publicationFailure === "directory-sync")
      handle.sync = async () => {
        throw Error("injected_directory_sync_failure");
      };
    if (published && this.publicationFailure === "directory-close") {
      const close = handle.close.bind(handle);
      handle.close = async () => {
        await close();
        throw Error("injected_directory_close_failure");
      };
    }
    return handle;
  }
}
async function fixture() {
  await mkdir("/tmp/opencode", { recursive: true });
  const root = await mkdtemp("/tmp/opencode/recovery-transition-unit-");
  roots.push(root);
  const files = new TransitionFiles(root);
  await files.prepare();
  let now = RECOVERY_DEADLINE - 10 * 3600000;
  const agent = "synthetic-existing-browser",
    token = "e".repeat(64),
    oldToken = "d".repeat(64);
  let state: OwnerState = {
    version: 1,
    policy: {
      id: randomUUID(),
      approvedAt: now - 3600000,
      provider: "chatgpt-subscription",
      model: "gpt-6.1-sol",
      reasoning: "medium",
      origin: RECOVERY_ORIGIN,
      scopes: ["customer", "customer-studio"],
      requestLimit: 300,
      concurrency: 4,
      requestsPerMinute: 30,
      maxRetries: 1,
      creditsDisabledConfirmed: true,
      providerPermissionConfirmed: true,
      historicalJournalHash: sha("historical-unknown-retained"),
    },
    sessions: [
      {
        id: RECOVERY_SESSION,
        tokenHash: sha(oldToken),
        agentHash: sha(agent),
        createdAt: now - 12 * 3600000,
        lastSeen: now - 1000,
        approvedAt: now - 600000,
        finishedAt: now - 599000,
        expiresAt: RECOVERY_DEADLINE,
        revoked: true,
      },
    ],
    events: [],
  };
  for (let n = 0; n < 337; n++) {
    const allocation = n >= 274 ? { allocationId: RECOVERY_EVALUATION } : {};
    const subject = key(),
      at = now - (338 - n) * 5000 - 60000;
    state.events.push(
      { id: randomUUID(), at, kind: "reserve", subject, ...allocation },
      {
        id: randomUUID(),
        at: at + 1000,
        kind: n === 0 ? "unknown" : "completed",
        subject,
        ...allocation,
        observation: { httpStatus: 200 },
      },
    );
  }
  state.events.push({
    id: randomUUID(),
    at: now - 2000,
    kind: "revoke-session",
    subject: RECOVERY_SESSION,
  });
  state.evaluation = {
    id: RECOVERY_EVALUATION,
    policyId: state.policy!.id,
    policyHash: recoveryHash(state.policy),
    approvedAt: now - 600000,
    expiresAt: RECOVERY_DEADLINE,
    sessionId: RECOVERY_SESSION,
    requestLimit: 300,
    purpose: "north-language-300",
    fastApplicationQuotaApproved: true,
    baselineEventCount: 548,
    baselineEventHash: recoveryHash(state.events.slice(0, 548)),
  };
  state = {
    version: state.version,
    policy: state.policy,
    evaluation: state.evaluation,
    sessions: state.sessions,
    events: state.events,
  };
  const checkpoint = evaluationRecoveryCheckpoint(state);
  const history = Array.from({ length: 15 }, (_, n) => ({
    conversationId: randomUUID(),
    turnCount: n === 14 ? 2 : 4,
    turnsHash: sha(`preserved-history-${n}`),
  }));
  const oldGate = {
    release: { ...RECOVERY_TRANSITION_FROM },
    ciReceiptHash: "c".repeat(64),
    securityReviewHash: "1".repeat(64),
    preservationHash: "2".repeat(64),
    preservationOwnerStateHash: checkpoint.ownerStateHash,
    providerEligibilityHash: "3".repeat(64),
    providerEligibilityCheckedAt: now - 1000,
    fallback: {
      release: { ...RECOVERY_TRANSITION_FROM },
      evidenceHash: "4".repeat(64),
      ciReceiptHash: "5".repeat(64),
      ciRunId: 1,
      recoveryAware: true as const,
      startupHttpsPassed: true as const,
      oldCredentialDenied: true as const,
      injectedRecoveryLogoutPassed: true as const,
    },
  };
  const binding = {
    recordsOwnerDigest: sha("unchanged-existing-records-cookie"),
    history,
    checkpoint,
    gates: oldGate,
    evaluationId: RECOVERY_EVALUATION,
    sessionId: RECOVERY_SESSION,
    expiresAt: RECOVERY_DEADLINE,
    baselineUsed: 63,
    maxAdditional: 237,
    requestLimit: 300,
    ownerApprovalHash:
      "729bd852ab31daa3dffc959cf2c4ba6a32a4d2948b2dc8fa67a881bd77e53b9d",
    policyHash: checkpoint.policyHash,
    evaluationHash: checkpoint.evaluationHash,
    originalSessionHash: checkpoint.originalSessionHash,
    agentHash: sha(agent),
    checkpointEventCount: checkpoint.eventCount,
    checkpointEventHash: checkpoint.eventHash,
  };
  const challengeId = randomUUID();
  const doc = evaluationRecoverySchema.parse({
    version: 1,
    phase: "active",
    binding,
    challenge: {
      id: challengeId,
      tokenHash: sha("spent-challenge"),
      createdAt: now - 900,
      expiresAt: now + 300000,
    },
    approval: {
      at: now - 800,
      challengeId,
      bindingHash: recoveryHash(binding),
    },
    activation: { at: now - 700, tokenHash: sha(token), sequence: 1 },
    audit: ["prepare", "challenge", "approve", "activate"].map((action, n) => ({
      sequence: n + 1,
      at: now - 1000 + n * 100,
      action,
    })),
  });
  await files.write("owner-state.json", state);
  await files.write(RECOVERY_FILE, doc);
  const runtime = {
    release: {
      commit: "a".repeat(40),
      sourceHash: "b".repeat(64),
      buildId: "corrected-exact-build",
    },
    ciReceiptHash: "f".repeat(64),
  };
  const recovery = new EvaluationRecovery(
    files,
    () => now,
    async () => runtime,
  );
  const owner = new StandingOwner(files, () => now, recovery);
  const input: RecoveryTransitionPreparation = {
    ownerApprovalHash: RECOVERY_TRANSITION_OWNER_APPROVAL,
    originalDocumentHash: (await files.snapshot(RECOVERY_FILE))!.hash,
    originalBindingHash: recoveryHash(doc.binding),
    ownerStateHash: recoveryHash(state),
    fromRelease: { ...RECOVERY_TRANSITION_FROM },
    fromCiReceiptHash: oldGate.ciReceiptHash,
    toGate: {
      ...oldGate,
      fallbackReadinessHash: sha("new-source-fallback-readiness-receipt"),
      release: { ...runtime.release },
      ciReceiptHash: runtime.ciReceiptHash,
      providerEligibilityCheckedAt: now,
      fallback: {
        ...oldGate.fallback,
        disableBeforeSwitch: true,
        managedEntrypointHash: sha("managed-disable-before-switch"),
      },
    },
    history: {
      release: { ...RECOVERY_TRANSITION_FROM },
      ciReceiptHash: oldGate.ciReceiptHash,
      checkedAt: now,
      evidenceHash: sha("actual-browser-receipt-double"),
      ownerStatusHash: sha("actual-get-readback-double"),
      bindingHash: recoveryHash(doc.binding),
      recordsOwnerDigest: doc.binding.recordsOwnerDigest,
      historyHash: recoveryHistoryHash(doc.binding.history),
      existingRecoveryCredentialVerified: true,
      serverOwnedRecordsProofVerified: true,
      allOriginalPrefixesUnchanged: true,
    },
  };
  const proof = {
    token,
    agent,
    origin: RECOVERY_ORIGIN,
    recordsOwnerDigest: binding.recordsOwnerDigest,
    channel: "records" as const,
  };
  return {
    files,
    owner,
    recovery,
    input,
    state,
    doc,
    runtime,
    proof,
    oldToken,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    apply: () => owner.transitionEvaluationRecovery(input),
    bytes: () => readFile(`${root}/${RECOVERY_FILE}`, "utf8"),
    ledger: () => readFile(`${root}/owner-state.json`, "utf8"),
  };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("one-shot exact-release transition (isolated synthetic evidence only)", () => {
  it("accepts distinct creation/audit samples with an advancing clock, preserving exact grant bytes through restart", async () => {
    const c = await fixture();
    c.doc.audit[1].at += 1;
    c.doc.audit[2].at += 2;
    c.doc.audit[3].at += 3;
    await c.files.write(RECOVERY_FILE, c.doc);
    c.input.originalDocumentHash = (await c.files.snapshot(
      RECOVERY_FILE,
    ))!.hash;
    const grant = await c.bytes(),
      ledger = await c.ledger();
    const now = () => {
      c.advance(1);
      return c.now();
    };
    const recovery = new EvaluationRecovery(
      c.files,
      now,
      async () => c.runtime,
    );
    const owner = new StandingOwner(c.files, now, recovery);
    await owner.transitionEvaluationRecovery(c.input);
    const restarted = new StandingOwner(
      c.files,
      now,
      new EvaluationRecovery(c.files, now, async () => c.runtime),
    );
    expect(await restarted.authenticate(c.proof)).toBe(RECOVERY_SESSION);
    await expect(
      restarted.authenticate({ ...c.proof, token: c.oldToken }),
    ).rejects.toThrow();
    expect(await c.bytes()).toBe(grant);
    expect(await c.ledger()).toBe(ledger);
  });
  it("changes only the release-selection record, retaining SAME secret/binding/audit/activation/ledger/identity and limits", async () => {
    const c = await fixture(),
      before = await c.bytes(),
      ledger = await c.ledger();
    await expect(c.owner.authenticate(c.proof)).rejects.toThrow(); // New source without transition is NOT authority.
    await c.apply();
    expect(await c.bytes()).toBe(before);
    expect(await c.ledger()).toBe(ledger);
    expect(await c.owner.authenticate(c.proof)).toBe(RECOVERY_SESSION);
    expect(await c.owner.status(c.proof)).toMatchObject({
      browserAccess: "recovery-active",
      originalBrowserRevoked: true,
      used: 63,
      remaining: 87,
      maxRetries: 0,
      concurrency: 1,
      standingAllocation: { used: 274, remaining: 26 },
      unknown: 1,
      evaluation: { id: RECOVERY_EVALUATION, expiresAt: RECOVERY_DEADLINE },
    });
    expect(await c.bytes()).toBe(before);
    expect(await c.ledger()).toBe(ledger);
    const requestId = randomUUID(),
      conversationId = randomUUID();
    const subject = `customer:${requestId}:north_conversation_v1`;
    await c.owner.beginCampaignQuestion(
      c.proof,
      requestId,
      conversationId,
      true,
    );
    await c.owner.reserve(c.proof, "customer", subject, true);
    await c.owner.settle(subject, "completed", { httpStatus: 200 });
    await c.owner.finishCampaignQuestion(c.proof, requestId, conversationId);
    expect(await c.owner.status(c.proof)).toMatchObject({
      used: 64,
      remaining: 86,
      standingAllocation: { used: 274, remaining: 26 },
      unknown: 1,
    });
    expect(await c.bytes()).toBe(before);
  });
  it.each(["old", "unknown", "wrong-ci"])(
    "rejects %s runtime under NEW code after transition, including restart",
    async (which) => {
      const c = await fixture();
      await c.apply();
      if (which === "old") {
        c.runtime.release = { ...RECOVERY_TRANSITION_FROM };
        c.runtime.ciReceiptHash = c.input.fromCiReceiptHash;
      }
      if (which === "unknown") c.runtime.release.commit = "9".repeat(40);
      if (which === "wrong-ci") c.runtime.ciReceiptHash = "9".repeat(64);
      const restarted = new StandingOwner(
        c.files,
        c.now,
        new EvaluationRecovery(c.files, c.now, async () => c.runtime),
      );
      await expect(restarted.authenticate(c.proof)).rejects.toThrow();
      await expect(
        restarted.assertDispatch(c.proof, "customer", true),
      ).rejects.toThrow();
    },
  );
  it("serializes competing transitions and never permits a second/third source", async () => {
    const c = await fixture();
    const results = await Promise.allSettled([c.apply(), c.apply()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const record = await c.files.snapshot(RECOVERY_TRANSITION_FILE);
    c.runtime.release.commit = "9".repeat(40);
    c.input.toGate.release = { ...c.runtime.release };
    await expect(c.apply()).rejects.toThrow();
    expect(await c.files.snapshot(RECOVERY_TRANSITION_FILE)).toEqual(record);
  });
  it.each([
    "old-token",
    "wrong-token",
    "agent",
    "records",
    "channel",
    "studio",
    "disabled-ai",
  ])("retains admission boundary: %s", async (which) => {
    const c = await fixture();
    await c.apply();
    const proof = { ...c.proof };
    if (which === "old-token") proof.token = c.oldToken;
    if (which === "wrong-token") proof.token = "a".repeat(64);
    if (which === "agent") proof.agent = "changed";
    if (which === "records") proof.recordsOwnerDigest = "0".repeat(64);
    if (which === "channel") delete (proof as { channel?: string }).channel;
    await expect(
      c.owner.assertDispatch(
        proof,
        which === "studio" ? "customer-studio" : "customer",
        which !== "disabled-ai",
      ),
    ).rejects.toThrow();
  });
  it.each([
    "approval",
    "from-release",
    "from-ci",
    "document",
    "binding",
    "state",
    "destination",
    "destination-ci",
    "same-source",
    "provider-stale",
    "provider-future",
    "history-stale",
    "history-future",
    "history-release",
    "history-binding",
    "history-records",
    "history-prefix",
    "history-credential",
    "history-server-proof",
    "fallback",
  ])("rejects invalid %s receipt with zero authority writes", async (which) => {
    const c = await fixture(),
      before = await c.bytes(),
      ledger = await c.ledger(),
      p = c.input;
    if (which === "approval")
      (p as { ownerApprovalHash: string }).ownerApprovalHash = "0".repeat(64);
    if (which === "from-release") p.fromRelease.commit = "0".repeat(40);
    if (which === "from-ci") p.fromCiReceiptHash = "0".repeat(64);
    if (which === "document") p.originalDocumentHash = "0".repeat(64);
    if (which === "binding") p.originalBindingHash = "0".repeat(64);
    if (which === "state") p.ownerStateHash = "0".repeat(64);
    if (which === "destination") p.toGate.release.commit = "0".repeat(40);
    if (which === "destination-ci") p.toGate.ciReceiptHash = "0".repeat(64);
    if (which === "same-source") {
      p.toGate.release = { ...RECOVERY_TRANSITION_FROM };
      c.runtime.release = { ...RECOVERY_TRANSITION_FROM };
    }
    if (which === "provider-stale")
      p.toGate.providerEligibilityCheckedAt = c.now() - 300001;
    if (which === "provider-future")
      p.toGate.providerEligibilityCheckedAt = c.now() + 1;
    if (which === "history-stale") p.history.checkedAt = c.now() - 300001;
    if (which === "history-future") p.history.checkedAt = c.now() + 1;
    if (which === "history-release") p.history.release.commit = "0".repeat(40);
    if (which === "history-binding") p.history.bindingHash = "0".repeat(64);
    if (which === "history-records")
      p.history.recordsOwnerDigest = "0".repeat(64);
    if (which === "history-prefix") p.history.historyHash = "0".repeat(64);
    if (which === "history-credential")
      (
        p.history as { existingRecoveryCredentialVerified: boolean }
      ).existingRecoveryCredentialVerified = false;
    if (which === "history-server-proof")
      (
        p.history as { serverOwnedRecordsProofVerified: boolean }
      ).serverOwnedRecordsProofVerified = false;
    if (which === "fallback")
      (
        p.toGate.fallback as { disableBeforeSwitch: boolean }
      ).disableBeforeSwitch = false;
    await expect(c.apply()).rejects.toThrow();
    expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toBeNull();
    expect(await c.bytes()).toBe(before);
    expect(await c.ledger()).toBe(ledger);
  });
  it.each([
    "expired",
    "clock-before",
    "provider-block",
    "policy-revoked",
    "pending",
    "failed",
    "changed-prefix",
    "changed-policy",
    "changed-session",
    "extra-settled",
    "duplicate-event",
    "logout",
  ])("denies %s current state without rewriting it", async (which) => {
    const c = await fixture(),
      s = structuredClone(c.state);
    if (which === "expired") c.advance(RECOVERY_DEADLINE - c.now());
    if (which === "clock-before") c.advance(-86400000);
    if (
      which === "provider-block" ||
      which === "policy-revoked" ||
      which === "logout"
    )
      s.events.push({
        id: randomUUID(),
        at: c.now(),
        kind:
          which === "provider-block"
            ? "provider-block"
            : which === "policy-revoked"
              ? "revoke-policy"
              : "logout",
        subject: RECOVERY_SESSION,
      });
    if (which === "pending") s.events.pop();
    if (which === "failed") s.events[s.events.length - 2].kind = "failed";
    if (which === "changed-prefix") s.events[0].subject = "changed";
    if (which === "changed-policy") s.policy!.maxRetries = 0;
    if (which === "changed-session") s.sessions[0].revoked = false;
    if (which === "duplicate-event") s.events[1].id = s.events[0].id;
    if (which === "extra-settled") {
      const subject = key();
      s.events.push(
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
    await c.files.write("owner-state.json", s);
    const ledger = await c.ledger();
    await expect(c.apply()).rejects.toThrow();
    expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toBeNull();
    expect(await c.ledger()).toBe(ledger);
  });
  it("does not reinterpret disabled/pending/duplicated/malformed or reformatted original documents", async () => {
    for (const which of [
      "disabled",
      "pending",
      "duplicate",
      "malformed",
      "reformatted",
    ]) {
      const c = await fixture(),
        d = structuredClone(c.doc);
      if (which === "disabled") {
        d.phase = "disabled";
        d.disabled = { at: c.now(), reason: "terminal" };
        d.audit.push({ sequence: 5, at: c.now(), action: "disable" });
      }
      if (which === "pending") {
        d.phase = "pending";
        delete d.approval;
        delete d.activation;
        d.audit.splice(2);
      }
      if (which === "duplicate") d.audit.push(d.audit[3]);
      await writeFile(
        `${c.files.directory}/${RECOVERY_FILE}`,
        which === "malformed"
          ? "{}"
          : which === "reformatted"
            ? JSON.stringify(d)
            : JSON.stringify(d, null, 2) + "\n",
        { mode: 0o600 },
      );
      await expect(c.apply()).rejects.toThrow();
      expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toBeNull();
    }
  });
  it("propagates persistence failure without issuing anything or falling back to the old release", async () => {
    const c = await fixture();
    c.files.failTransition = true;
    await expect(c.apply()).rejects.toMatchObject({
      code: "pilot_transition_publication_uncertain_inspect_owner_lock",
      cause: { message: "injected_transition_write_failure" },
    });
    expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toBeNull();
    await expect(c.owner.authenticate(c.proof)).rejects.toThrow();
  });
  it.each([
    "write-then-throw",
    "rename-then-throw",
    "directory-open",
    "directory-sync",
    "directory-close",
  ] as const)(
    "retains the durable owner lock after visible publication failure: %s; actual auth/reserve stay denied across restart",
    async (phase) => {
      const c = await fixture(),
        before = await c.bytes(),
        ledger = await c.ledger();
      c.files.publicationFailure = phase;
      await expect(c.apply()).rejects.toMatchObject({
        code: "pilot_transition_publication_uncertain_inspect_owner_lock",
      });
      expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toMatchObject({
        version: 1,
        sequence: 1,
      });
      expect(
        await readFile(`${c.files.directory}/.owner-access-lock`, "utf8"),
      ).toBe("");
      await expect(c.owner.authenticate(c.proof)).rejects.toThrow(
        "pilot_locked_inspect_before_recovery",
      );
      // A new instance has no in-memory error/sentinel knowledge. The original
      // durable filesystem lock alone must still stop real admission.
      const restartedFiles = new PilotFiles(c.files.directory);
      const restarted = new StandingOwner(
        restartedFiles,
        c.now,
        new EvaluationRecovery(restartedFiles, c.now, async () => c.runtime),
      );
      await expect(
        restarted.reserve(c.proof, "customer", key(), true),
      ).rejects.toThrow("pilot_locked_inspect_before_recovery");
      expect(await c.bytes()).toBe(before);
      expect(await c.ledger()).toBe(ledger);
      expect(
        await readFile(`${c.files.directory}/.owner-access-lock`, "utf8"),
      ).toBe("");
    },
    15000,
  );
  it("does not retain ordinary locks or pre-publication validation failures", async () => {
    const c = await fixture();
    await expect(
      c.files.locked(async () => {
        throw Error("ordinary_failure");
      }),
    ).rejects.toThrow("ordinary_failure");
    await expect(readFile(`${c.files.directory}/.lock`)).rejects.toMatchObject({
      code: "ENOENT",
    });
    c.input.ownerStateHash = "0".repeat(64);
    await expect(c.apply()).rejects.toThrow();
    await expect(
      readFile(`${c.files.directory}/.owner-access-lock`),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.each(["commit", "source", "build-id", "dirty", "inventory"])(
    "actual CLI ordering gate rejects retained fallback %s before any transition write",
    async (which) => {
      const c = await fixture();
      let transitionCalls = 0,
        inventoryCalls = 0;
      const build = { ...RECOVERY_TRANSITION_FROM, dirty: "" };
      if (which === "commit")
        build.commit = "0".repeat(40) as typeof build.commit;
      if (which === "source")
        build.sourceHash = "0".repeat(64) as typeof build.sourceHash;
      if (which === "dirty") build.dirty = "modified";
      await expect(
        applyNorthRecoveryTransition({
          readFallbackBuild: async () => build,
          readFallbackBuildId: async () =>
            which === "build-id" ? "wrong" : build.buildId,
          verifyFallbackInventory: async () => {
            inventoryCalls++;
            throw Error("actual_fallback_inventory_mismatch");
          },
          transition: async () => {
            transitionCalls++;
            return c.apply();
          },
        }),
      ).rejects.toThrow();
      expect(transitionCalls).toBe(0);
      expect(inventoryCalls).toBe(which === "inventory" ? 1 : 0);
      expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toBeNull();
    },
  );
  it("the shared CLI gate verifies actual fallback identity then inventory before the real locked transition", async () => {
    const c = await fixture(),
      order: string[] = [];
    await applyNorthRecoveryTransition({
      readFallbackBuild: async () => {
        order.push("build");
        return { ...RECOVERY_TRANSITION_FROM, dirty: "" };
      },
      readFallbackBuildId: async () => {
        order.push("build-id");
        return RECOVERY_TRANSITION_FROM.buildId;
      },
      verifyFallbackInventory: async () => {
        order.push("actual-inventory");
        expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toBeNull();
      },
      transition: async () => {
        order.push("transition");
        return c.apply();
      },
    });
    expect(order).toEqual([
      "build",
      "build-id",
      "actual-inventory",
      "transition",
    ]);
    expect(await c.owner.authenticate(c.proof)).toBe(RECOVERY_SESSION);
  });
  it("actual immutable-inventory tampering prevents any transition publication through the CLI ordering gate", async () => {
    const c = await fixture(),
      root = `${c.files.directory}/synthetic-fallback`;
    await mkdir(`${root}/.next`, { recursive: true, mode: 0o700 });
    const build = JSON.stringify({ ...RECOVERY_TRANSITION_FROM, dirty: "" });
    const id = RECOVERY_TRANSITION_FROM.buildId;
    await writeFile(`${root}/.next/palcare-build.json`, build, { mode: 0o600 });
    await writeFile(`${root}/.next/BUILD_ID`, id, { mode: 0o600 });
    await writeFile(`${root}/asset.txt`, "original immutable asset", {
      mode: 0o600,
    });
    const manifest = JSON.stringify({
      commit: RECOVERY_TRANSITION_FROM.commit,
      sourceHash: RECOVERY_TRANSITION_FROM.sourceHash,
      files: {
        ".next/BUILD_ID": sha(id),
        ".next/palcare-build.json": sha(build),
        "asset.txt": sha("original immutable asset"),
      },
    });
    await writeFile(`${root}-manifest.json`, manifest, { mode: 0o600 });
    await writeFile(
      `${root}-launcher.mjs`,
      `const expectedManifest = "${sha(manifest)}";`,
      { mode: 0o600 },
    );
    await verifyNorthRecoveryInventory(root, RECOVERY_TRANSITION_FROM);
    await writeFile(`${root}/asset.txt`, "changed after earlier receipt", {
      mode: 0o600,
    });
    let transitionCalls = 0;
    await expect(
      applyNorthRecoveryTransition({
        readFallbackBuild: async () =>
          JSON.parse(
            await readFile(`${root}/.next/palcare-build.json`, "utf8"),
          ),
        readFallbackBuildId: () => readFile(`${root}/.next/BUILD_ID`, "utf8"),
        verifyFallbackInventory: () =>
          verifyNorthRecoveryInventory(root, RECOVERY_TRANSITION_FROM),
        transition: async () => {
          transitionCalls++;
          return c.apply();
        },
      }),
    ).rejects.toThrow("frozen_assets_changed_no_service_switch");
    expect(transitionCalls).toBe(0);
    expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toBeNull();
    await expect(
      readFile(`${c.files.directory}/.owner-access-lock`),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects symlink transition targets and malformed existing records rather than replacing them", async () => {
    const c = await fixture();
    await symlink(
      `${c.files.directory}/${RECOVERY_FILE}`,
      `${c.files.directory}/${RECOVERY_TRANSITION_FILE}`,
    );
    await expect(c.apply()).rejects.toThrow();
    await expect(c.owner.authenticate(c.proof)).rejects.toThrow();
    const d = await fixture();
    await d.files.write(RECOVERY_TRANSITION_FILE, { version: 1 });
    await expect(d.apply()).rejects.toThrow();
    await expect(d.owner.authenticate(d.proof)).rejects.toThrow();
  });
  it.each([null, false, 0, ""])(
    "never treats an existing invalid JSON value %s as absent, even on old runtime",
    async (value) => {
      const c = await fixture();
      await c.files.write(RECOVERY_TRANSITION_FILE, value);
      const bytes = await c.files.snapshot(RECOVERY_TRANSITION_FILE);
      await expect(c.apply()).rejects.toThrow();
      c.runtime.release = { ...RECOVERY_TRANSITION_FROM };
      c.runtime.ciReceiptHash = c.input.fromCiReceiptHash;
      await expect(c.owner.authenticate(c.proof)).rejects.toThrow();
      expect(await c.files.snapshot(RECOVERY_TRANSITION_FILE)).toEqual(bytes);
    },
  );
  it("still makes durable disable terminal and never restores authority after a managed fallback", async () => {
    const c = await fixture();
    await c.apply();
    const transition = await c.files.snapshot(RECOVERY_TRANSITION_FILE);
    await c.owner.disableEvaluationRecovery("managed-critical-fallback");
    await expect(c.owner.authenticate(c.proof)).rejects.toThrow();
    await expect(c.apply()).rejects.toThrow();
    expect(await c.files.snapshot(RECOVERY_TRANSITION_FILE)).toEqual(
      transition,
    );
  });
  it.each(["runtime-changed", "expired-during-check"])(
    "rechecks %s immediately before persistence",
    async (which) => {
      const c = await fixture();
      let calls = 0;
      const recovery = new EvaluationRecovery(c.files, c.now, async () => {
        calls++;
        if (calls === 2) {
          if (which === "runtime-changed")
            return { ...c.runtime, ciReceiptHash: "0".repeat(64) };
          c.advance(RECOVERY_DEADLINE - c.now());
        }
        return structuredClone(c.runtime);
      });
      const owner = new StandingOwner(c.files, c.now, recovery);
      await expect(
        owner.transitionEvaluationRecovery(c.input),
      ).rejects.toThrow();
      expect(await c.files.read(RECOVERY_TRANSITION_FILE)).toBeNull();
    },
  );
  it.each([
    "sequence",
    "history-source",
    "history-time",
    "from-ci",
    "document",
    "binding",
    "same-source",
  ])(
    "rejects malformed/changed persisted transition %s, not a generic release override",
    async (which) => {
      const c = await fixture();
      await c.apply();
      const record = (await c.files.read(RECOVERY_TRANSITION_FILE)) as Record<
        string,
        unknown
      > &
        RecoveryTransitionPreparation;
      if (which === "sequence") record.sequence = 2;
      if (which === "history-source")
        record.history.release = { ...c.runtime.release };
      if (which === "history-time") record.history.checkedAt = c.now() + 1;
      if (which === "from-ci") record.fromCiReceiptHash = "0".repeat(64);
      if (which === "document") record.originalDocumentHash = "0".repeat(64);
      if (which === "binding") record.originalBindingHash = "0".repeat(64);
      if (which === "same-source")
        record.toGate.release = { ...RECOVERY_TRANSITION_FROM };
      await c.files.write(RECOVERY_TRANSITION_FILE, record);
      await expect(c.owner.authenticate(c.proof)).rejects.toThrow();
    },
  );
  it("exports strict source-bound receipt schemas and requires actual old-source status/history readback fields", async () => {
    const c = await fixture();
    const base = {
      version: 1,
      release: c.runtime.release,
      checkedAt: c.now(),
      originalDocumentHash: c.input.originalDocumentHash,
      originalBindingHash: c.input.originalBindingHash,
      ownerStateHash: c.input.ownerStateHash,
    };
    expect(
      transitionSecurityReceiptSchema.safeParse({
        ...base,
        independentAuditPassed: true,
        privateHttpsPassed: true,
        actualRuntimeVerified: true,
        originalGrantUnchanged: true,
        noNewAuthority: true,
      }).success,
    ).toBe(true);
    expect(
      transitionPreservationReceiptSchema.safeParse({
        ...base,
        all63CompletedUnchanged: true,
        original274AndUnknownUnchanged: true,
        purchaseDataAndAccountingUnchanged: true,
      }).success,
    ).toBe(true);
    expect(
      transitionProviderReceiptSchema.safeParse({
        ...base,
        eligible: true,
        provider: "chatgpt-subscription",
        model: "gpt-6.1-sol",
        reasoning: "medium",
        creditsDisabledConfirmed: true,
        paidFallbackDisabled: true,
      }).success,
    ).toBe(true);
    expect(
      transitionFallbackReceiptSchema.safeParse({
        ...base,
        fallback: c.input.toGate.fallback,
        ciReceipt: {},
        inventoryVerified: true,
        disableBeforeSwitchTestPassed: true,
      }).success,
    ).toBe(true);
    const receipt = {
      ...base,
      release: RECOVERY_TRANSITION_FROM,
      ciReceiptHash: c.input.fromCiReceiptHash,
      recordsOwnerDigest: c.doc.binding.recordsOwnerDigest,
      historyHash: recoveryHistoryHash(c.doc.binding.history),
      history: c.doc.binding.history,
      existingRecoveryCredentialVerified: true,
      serverOwnedRecordsProofVerified: true,
      allOriginalPrefixesUnchanged: true,
      ownerStatus: {
        liveEnabled: true,
        remembered: true,
        browserCompletion: "complete",
        browserAccess: "recovery-active",
        originalBrowserRevoked: true,
        recoveryActive: true,
        providerBlocked: false,
        revoked: false,
        policy: "approved",
        used: 63,
        remaining: 237,
        unknown: 1,
        standingAllocation: { used: 274, remaining: 26 },
        evaluation: {
          id: RECOVERY_EVALUATION,
          limit: 300,
          expiresAt: RECOVERY_DEADLINE,
          used: 63,
          remaining: 237,
          browserBound: true,
        },
      },
    };
    expect(transitionHistoryReceiptSchema.safeParse(receipt).success).toBe(
      true,
    );
    expect(
      transitionHistoryReceiptSchema.safeParse({
        ...receipt,
        ownerStatus: undefined,
      }).success,
    ).toBe(false);
    expect(
      transitionHistoryReceiptSchema.safeParse({
        ...receipt,
        history: undefined,
      }).success,
    ).toBe(false);
    expect(
      transitionHistoryReceiptSchema.safeParse({
        ...receipt,
        rawCookie: "never-allowed",
      }).success,
    ).toBe(false);
    expect(
      transitionHistoryReceiptSchema.safeParse({
        ...receipt,
        ownerStatus: { ...receipt.ownerStatus, used: 64 },
      }).success,
    ).toBe(false);
  });
});
