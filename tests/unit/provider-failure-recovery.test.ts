import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, readFile, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { z } from "zod";
import {
  createProviderFailureRecoveryFixture,
  type ProviderFailureRecoveryFixture,
} from "../helpers/provider-failure-recovery-fixture";
import {
  PilotFiles,
  PilotTransitionPublicationUncertainError,
} from "../../src/lib/careos/subscription/files";
import { standingStructured } from "../../src/lib/careos/subscription/standing";
import { RECOVERY_EVALUATION } from "../../src/lib/careos/evaluation-recovery";
import {
  campaignBudget,
  assertCampaignQuestionOpen,
  assertCampaignStage,
  assertCampaignQuestionClose,
} from "../../src/lib/careos/campaign-execution";
import {
  providerRecoveryContext,
  providerRecoveryPhase,
  PROVIDER_RECOVERY_EXPIRY,
  PROVIDER_RECOVERY_REQUEST,
  PROVIDER_RECOVERY_CONVERSATION,
  type ProviderRecoveryEnvironment,
} from "../../src/lib/careos/provider-failure-recovery";
import { type OwnerProof } from "../../src/lib/careos/standing-owner";

const roots: string[] = [];
async function fixture() {
  await mkdir("/tmp/opencode", { recursive: true });
  const directory = await mkdtemp("/tmp/opencode/provider-failure-recovery-");
  roots.push(directory);
  return createProviderFailureRecoveryFixture({ directory });
}
async function active() {
  const f = await fixture();
  await f.owner.installProviderFailureRecovery(f.approval);
  return { ...f, ...(await f.authorize()) };
}
async function question(f: ProviderFailureRecoveryFixture, proof: OwnerProof) {
  const request = randomUUID(),
    conversation = randomUUID();
  await f.owner.beginCampaignQuestion(proof, request, conversation, true);
  return {
    request,
    conversation,
    key: `customer:${request}:north_conversation_v1`,
  };
}
function call(
  f: ProviderFailureRecoveryFixture,
  proof: OwnerProof,
  requestId: string,
  transport: typeof fetch,
) {
  return standingStructured({
    files: f.provider,
    owner: f.owner,
    proof,
    scope: "customer",
    enabled: () => true,
    requestId,
    payload: "{}",
    schema: z.object({ ok: z.boolean() }),
    name: "north_conversation_v1",
    signal: AbortSignal.timeout(10000),
    transport,
  });
}
/** Keep lock-failure assertions fast, without changing production deadlines or
 * hiding real cross-process contention (the separate worker test uses defaults). */
class InspectionFiles extends PilotFiles {
  override lockedWaiting<T>(
    work: () => Promise<T>,
    name: ".lock" | ".owner-access-lock" = ".lock",
    signal?: AbortSignal,
    waitMs = 2000,
    mode?: "recovery-transition",
  ): Promise<T> {
    return super.lockedWaiting(work, name, signal, Math.min(waitMs, 10), mode);
  }
}
class RestrictionFaultFiles extends InspectionFiles {
  syncCalls = 0;
  constructor(
    directory: string,
    private fault: string,
  ) {
    super(directory);
  }
  override async write(
    name: Parameters<PilotFiles["write"]>[0],
    value: unknown,
  ) {
    if (name === "owner-state.json" && this.fault === "before-publication")
      throw Error("synthetic restriction before rename");
    await super.write(name, value);
    if (name === "owner-state.json" && this.fault === "after-publication")
      throw Error("synthetic restriction write then throw");
  }
  protected override async openDirectory() {
    const handle = await super.openDirectory();
    if (this.fault === "directory-sync" && ++this.syncCalls === 2)
      handle.sync = async () => {
        throw Error("synthetic restriction directory sync");
      };
    return handle;
  }
}
async function assertRestartLocked(f: Awaited<ReturnType<typeof active>>) {
  await expect(
    access(f.files.directory + "/.owner-access-lock"),
  ).resolves.toBeUndefined();
  const restarted = f.restart(new InspectionFiles(f.files.directory));
  for (const proof of [f.oldProof, f.proof])
    await expect(restarted.authenticate(proof)).rejects.toThrow("locked");
  await expect(restarted.status(f.proof)).rejects.toThrow("locked");
  await expect(restarted.finishBrowser(f.proof)).rejects.toThrow("locked");
  await expect(
    restarted.beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
  ).rejects.toThrow("locked");
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("exact once-only provider-failure recovery, synthetic isolated host files", () => {
  it.each(["before-publication", "after-publication", "directory-sync"])(
    "pre-reservation stop %s remains denied across restart without a charge",
    async (fault) => {
      const f = await active(),
        q = await question(f, f.proof);
      const registration = (await f.provider.registration())!;
      registration.tokens!.scopes = [];
      await f.provider.write("registration.json", registration);
      const owner = f.restart(
        new RestrictionFaultFiles(f.files.directory, fault),
      );
      const transport = vi.fn();
      await expect(
        call({ ...f, owner }, f.proof, q.request, transport),
      ).rejects.toBeInstanceOf(PilotTransitionPublicationUncertainError);
      expect(transport).not.toHaveBeenCalled();
      await assertRestartLocked(f);
      const s = await f.read();
      expect(s.events.slice(0, 1894)).toEqual(f.baseline.events);
      expect(
        s.events.filter(
          (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
        ),
      ).toHaveLength(335);
      expect(
        s.events.filter((e) => e.kind === "disable-provider-failure-recovery"),
      ).toHaveLength(fault === "before-publication" ? 0 : 1);
    },
  );
  it.each(["provider-block", "managed-disable", "failed-settlement"])(
    "%s write failure cannot restore continuation after restart",
    async (path) => {
      const f = await active();
      let key = "";
      if (path === "failed-settlement") {
        const q = await question(f, f.proof);
        key = q.key;
        await f.owner.reserve(f.proof, "customer", key, true);
      }
      const owner = f.restart(
        new RestrictionFaultFiles(f.files.directory, "before-publication"),
      );
      const stop =
        path === "provider-block"
          ? owner.blockProvider()
          : path === "managed-disable"
            ? owner.disableEvaluationRecovery("managed-critical-fallback")
            : owner.settle(key, "failed", { httpStatus: 503 });
      await expect(stop).rejects.toBeInstanceOf(
        PilotTransitionPublicationUncertainError,
      );
      await assertRestartLocked(f);
      expect(
        (await f.read()).events.filter(
          (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
        ),
      ).toHaveLength(path === "failed-settlement" ? 336 : 335);
    },
  );
  it("wrong and old browser proofs cannot strand the restriction lock", async () => {
    const f = await active(),
      owner = f.restart(
        new RestrictionFaultFiles(f.files.directory, "before-publication"),
      );
    for (const proof of [f.oldProof, { ...f.proof, token: "f".repeat(64) }])
      await expect(
        owner.stopProviderFailureContinuation(proof),
      ).resolves.toBeUndefined();
    await expect(
      access(f.files.directory + "/.owner-access-lock"),
    ).rejects.toThrow();
    expect(await f.restart().authenticate(f.proof)).toBe(f.pair.id);
    expect(providerRecoveryPhase(await f.read(), f.now())!.phase).toBe(
      "active",
    );
  });
  it.each([
    "security-hash",
    "missing-security-case",
    "security-failed",
    "source-hash",
    "input-hash",
    "missing-engine",
    "missing-fallback",
    "retried",
    "skipped",
    "https-profile",
    "https-writes",
    "provider-calls",
    "deployment-source",
  ])(
    "fixed report content rejects %s even with affirmative host booleans",
    async (kind) => {
      const f = await fixture();
      const env: ProviderRecoveryEnvironment = f.environment;
      const record = (v: unknown) => v as Record<string, unknown>;
      const units = record(env.artifacts.security.results.value);
      const unitFile = record((units.testResults as unknown[])[0]);
      const assertions = unitFile.assertionResults as Array<
        Record<string, unknown>
      >;
      const browser = record(env.artifacts.threeEngine.results.value);
      const specs = record((browser.suites as unknown[])[0]).specs as Array<
        Record<string, unknown>
      >;
      if (kind === "security-hash")
        env.artifacts.security.results.hash = "0".repeat(64);
      if (kind === "missing-security-case") {
        assertions.shift();
        units.numTotalTests = assertions.length;
        units.numPassedTests = assertions.length;
      }
      if (kind === "security-failed") assertions[0].status = "failed";
      if (kind === "source-hash")
        record(env.artifacts.security.proof.value).sourceHash = "0".repeat(64);
      if (kind === "input-hash")
        record(record(env.artifacts.security.proof.value).fileHashes)[
          "tests/unit/provider-failure-recovery.test.ts"
        ] = "0".repeat(64);
      if (kind === "missing-engine")
        for (const spec of specs) (spec.tests as unknown[]).pop();
      if (kind === "missing-fallback")
        specs.splice(
          specs.findIndex((s) =>
            String(s.title).startsWith("new-format restart"),
          ),
          1,
        );
      if (kind === "retried")
        record(
          (record((specs[0].tests as unknown[])[0]).results as unknown[])[0],
        ).retry = 1;
      if (kind === "skipped") record(browser.stats).skipped = 1;
      if (kind === "https-profile")
        (record(env.artifacts.primaryHttps.value).results as unknown[]).pop();
      if (kind === "https-writes")
        record(
          (record(env.artifacts.primaryHttps.value).results as unknown[])[0],
        ).writes = ["/api/ai/owner"];
      if (kind === "provider-calls")
        record(env.artifacts.frozenHttps.value).providerCalls = 1;
      if (kind === "deployment-source")
        record(record(env.artifacts.deployment.value).release).sourceHash =
          "0".repeat(64);
      await expect(
        f.owner.installProviderFailureRecovery(f.approval),
      ).rejects.toThrow();
      expect(await f.read()).toEqual(f.baseline);
    },
  );
  it("preserves the complete checkpoint/grants/31 sessions/all335 charges/unknown; releases only held1 without browser authority", async () => {
    const f = await fixture();
    const oldRecovery = await f.files.snapshot("evaluation-recovery.json");
    expect(await f.budget()).toMatchObject({
      used: 335,
      executionLimit: 563,
      remaining: 228,
      held: 1,
      availableForNewQuestion: 227,
    });
    await f.owner.installProviderFailureRecovery(f.approval);
    const s = await f.read();
    expect(s.events.slice(0, 1894)).toEqual(f.baseline.events);
    expect(s.sessions).toEqual(f.baseline.sessions);
    for (const field of [
      "policy",
      "evaluation",
      "quotaCampaign",
      "quotaCampaignExtension",
      "northGuideCampaign",
      "northGuideRecordsBinding",
    ] as const)
      expect(s[field]).toEqual(f.baseline[field]);
    expect(s.events.slice(1894).map((e) => e.kind)).toEqual([
      "approve-provider-failure-recovery",
      "resolve-provider-failed-question",
    ]);
    expect(await f.budget()).toEqual({
      historicalLimit: 300,
      executionLimit: 563,
      used: 335,
      remaining: 228,
      held: 0,
      availableForNewQuestion: 228,
    });
    expect((await f.files.snapshot("evaluation-recovery.json"))!.hash).toBe(
      oldRecovery!.hash,
    );
    expect(await f.restart().status(f.oldProof)).toMatchObject({
      used: 335,
      remaining: 228,
      unknown: 1,
      standingAllocation: { used: 283, remaining: 17 },
      providerRecovery: {
        phase: "awaiting-browser",
        originalBrowserExpiresAt: PROVIDER_RECOVERY_EXPIRY,
      },
    });
    expect(await f.owner.quotaCampaignStatus()).toMatchObject({
      active: false,
      providerRecoveryPhase: "awaiting-browser",
    });
    await expect(f.owner.authenticate(f.oldProof)).rejects.toThrow();
    await expect(
      f.owner.installProviderFailureRecovery(f.approval),
    ).rejects.toThrow();
    expect(() => campaignBudget(s.events)).toThrow(
      "invalid_recovery_resolution",
    );
  });

  it("requires the one normal Pair -> host approve -> Finish, reuses pending secret, denies all old/replayed identities", async () => {
    const f = await fixture();
    await f.owner.installProviderFailureRecovery(f.approval);
    const pair = await f.owner.pair(
      f.agent,
      f.oldProof.token,
      f.recordsOwnerDigest,
    );
    const proof = { ...f.oldProof, token: pair.token };
    expect(pair.token).not.toBe(f.oldProof.token);
    expect(pair.expiresAt).toBe(PROVIDER_RECOVERY_EXPIRY);
    expect(
      await f.owner.pair(f.agent, pair.token, f.recordsOwnerDigest),
    ).toMatchObject({ id: pair.id, token: pair.token, reused: true });
    await expect(
      f.owner.pair(f.agent, f.oldProof.token, f.recordsOwnerDigest),
    ).rejects.toThrow();
    await expect(f.owner.authenticate(proof)).rejects.toThrow();
    await expect(f.owner.finishBrowser(proof)).rejects.toThrow();
    await f.owner.approve(pair.id);
    await expect(f.owner.authenticate(proof)).rejects.toThrow(
      "browser_required",
    );
    await expect(
      f.owner.beginCampaignQuestion(proof, randomUUID(), randomUUID(), true),
    ).rejects.toThrow();
    expect(await f.owner.status(proof)).toMatchObject({
      browserCompletion: "finish-needed",
      campaign: { authorized: false },
    });
    expect(await f.owner.finishBrowser(proof)).toBe(PROVIDER_RECOVERY_EXPIRY);
    const beforeRepeat = await f.read();
    await f.owner.finishBrowser(proof);
    expect(await f.read()).toEqual(beforeRepeat);
    expect(await f.restart().authenticate(proof)).toBe(pair.id);
    expect(await f.owner.status(proof)).toMatchObject({
      revoked: false,
      campaign: {
        authorized: true,
        browserExpiresAt: PROVIDER_RECOVERY_EXPIRY,
      },
      providerRecovery: { phase: "active" },
    });
    const s = await f.read(),
      context = providerRecoveryContext(s, f.now());
    expect(() =>
      assertCampaignQuestionOpen(
        s.events,
        PROVIDER_RECOVERY_REQUEST,
        PROVIDER_RECOVERY_CONVERSATION,
        context,
      ),
    ).toThrow("request_reused");
    expect(() =>
      assertCampaignQuestionOpen(
        s.events,
        PROVIDER_RECOVERY_REQUEST,
        randomUUID(),
        context,
      ),
    ).toThrow("request_reused");
    expect(() =>
      assertCampaignStage(
        s.events,
        `customer:${PROVIDER_RECOVERY_REQUEST}:careos_care`,
        context,
      ),
    ).toThrow();
    expect(() =>
      assertCampaignQuestionClose(
        s.events,
        PROVIDER_RECOVERY_REQUEST,
        PROVIDER_RECOVERY_CONVERSATION,
        context,
      ),
    ).toThrow();
    await expect(f.owner.finishBrowser(f.oldProof)).rejects.toThrow();
    expect(s.sessions.slice(0, 31)).toEqual(f.baseline.sessions);
  });

  it.each([
    "cap",
    "held",
    "retry",
    "expiry",
    "session-count",
    "reserve",
    "terminal",
    "browser-revoke",
    "extra",
    "approval-hash",
    "prefix-hash",
    "state-hash",
    "release",
    "readback",
    "future",
  ])("rejects manipulated %s proof with no state change", async (which) => {
    const f = await fixture(),
      p = structuredClone(f.approval);
    if (which === "cap") Object.assign(p.limits, { executionLimit: 564 });
    if (which === "held")
      Object.assign(p.failedQuestion, { releasedHeldSlots: 2 });
    if (which === "retry") Object.assign(p.limits, { maxRetries: 1 });
    if (which === "expiry")
      Object.assign(p, {
        originalBrowserExpiresAt: PROVIDER_RECOVERY_EXPIRY + 1,
      });
    if (which === "session-count")
      Object.assign(p.checkpoint, { sessionCount: 30 });
    if (which === "reserve")
      Object.assign(p.failedQuestion, { reserveEventId: randomUUID() });
    if (which === "terminal")
      Object.assign(p.failedQuestion, { terminalEventId: randomUUID() });
    if (which === "browser-revoke")
      Object.assign(p.failedQuestion, {
        browserRevocationEventId: randomUUID(),
      });
    if (which === "extra") Object.assign(p, { reset: true });
    if (which === "approval-hash")
      Object.assign(p, { ownerApprovalHash: "0".repeat(64) });
    if (which === "prefix-hash") p.checkpoint.eventHash = "0".repeat(64);
    if (which === "state-hash") p.checkpoint.ownerStateHash = "0".repeat(64);
    if (which === "release") p.releaseGate.release.commit = "0".repeat(40);
    if (which === "readback")
      p.evidence.unavailableReadbackHash = "0".repeat(64);
    if (which === "future") p.approvedAt = f.now() + 1;
    const before = await readFile(
      f.files.directory + "/owner-state.json",
      "utf8",
    );
    await expect(f.owner.installProviderFailureRecovery(p)).rejects.toThrow();
    expect(
      await readFile(f.files.directory + "/owner-state.json", "utf8"),
    ).toBe(before);
  });

  it.each([
    "provider",
    "not-ready",
    "attestation",
    "stale-check",
    "ci",
    "fallback",
    "checkpoint",
  ])(
    "the core, not just CLI, rejects wrong trusted %s evidence",
    async (kind) => {
      const f = await fixture();
      if (kind === "provider")
        f.environment.providerIdentityHash = "0".repeat(64);
      if (kind === "not-ready") f.environment.providerReady = false;
      if (kind === "attestation")
        f.environment.releaseEvidenceHash = "0".repeat(64);
      if (kind === "stale-check")
        f.environment.releaseEvidence.checkedAt -= 300001;
      if (kind === "ci") f.environment.runtime.ciReceiptHash = "0".repeat(64);
      if (kind === "fallback")
        f.environment.releaseEvidence.fallback.release = {
          ...f.environment.releaseEvidence.fallback.release,
          buildId: "wrong",
        };
      if (kind === "checkpoint")
        f.environment.checkpoint = {
          ...f.environment.checkpoint,
          eventHash: "0".repeat(64),
        };
      await expect(
        f.owner.installProviderFailureRecovery(f.approval),
      ).rejects.toThrow();
      expect(await f.read()).toEqual(f.baseline);
    },
  );

  it.each([
    "touch-tail",
    "revived-session",
    "unknown-target",
    "second-stage",
    "wrong-status",
    "missing-terminal",
    "global-block",
    "grant",
  ])(
    "rejects changed actual %s checkpoint without discarding its tail",
    async (kind) => {
      const f = await fixture(),
        s = await f.read();
      if (kind === "touch-tail")
        s.events.push({
          id: randomUUID(),
          at: f.now(),
          kind: "touch",
          subject: "new activity",
        });
      if (kind === "revived-session") s.sessions[30].revoked = false;
      if (kind === "unknown-target") s.events[1891].kind = "unknown";
      if (kind === "second-stage")
        s.events[1891].subject = `customer:${PROVIDER_RECOVERY_REQUEST}:careos_care`;
      if (kind === "wrong-status") s.events[1891].observation!.httpStatus = 502;
      if (kind === "missing-terminal") s.events.splice(1891, 1);
      if (kind === "global-block")
        s.events.push({
          id: randomUUID(),
          at: f.now(),
          kind: "provider-block",
          subject: "denied",
        });
      if (kind === "grant") s.quotaCampaign!.maxRetries = 1 as 0;
      await f.files.write("owner-state.json", s);
      const before = await readFile(
        f.files.directory + "/owner-state.json",
        "utf8",
      );
      await expect(
        f.owner.installProviderFailureRecovery(f.approval),
      ).rejects.toThrow();
      expect(
        await readFile(f.files.directory + "/owner-state.json", "utf8"),
      ).toBe(before);
    },
  );

  it.each([
    "records",
    "missing-records",
    "agent",
    "origin",
    "channel",
    "studio",
  ])("denies changed %s without any standing17 charge", async (kind) => {
    const f = await active(),
      proof = { ...f.proof };
    if (kind === "records") proof.recordsOwnerDigest = "0".repeat(64);
    if (kind === "missing-records") proof.recordsOwnerDigest = undefined;
    if (kind === "agent") proof.agent = "different";
    if (kind === "origin") proof.origin = "https://foreign.invalid";
    if (kind === "channel") proof.channel = undefined;
    const before = await f.read();
    if (kind !== "studio")
      await expect(
        f.owner.beginCampaignQuestion(proof, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
    await expect(
      f.owner.assertDispatch(
        proof,
        kind === "studio" ? "customer-studio" : "customer",
        true,
        `customer:${randomUUID()}:north_conversation_v1`,
      ),
    ).rejects.toThrow();
    expect(await f.read()).toEqual(before);
  });

  it("a forged visitor cannot cancel another continuation and local wire rejection does not spend or disable", async () => {
    const f = await active();
    await f.owner.stopProviderFailureContinuation({
      ...f.proof,
      token: "f".repeat(64),
    });
    expect(providerRecoveryPhase(await f.read(), f.now())!.phase).toBe(
      "active",
    );
    const q = await question(f, f.proof),
      transport = vi.fn();
    await expect(
      standingStructured({
        files: f.provider,
        owner: f.owner,
        proof: f.proof,
        scope: "customer",
        enabled: () => true,
        requestId: q.request,
        payload: "x".repeat(25000),
        schema: z.object({ ok: z.boolean() }),
        name: "north_conversation_v1",
        signal: AbortSignal.timeout(1000),
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(await f.budget()).toMatchObject({ used: 335, held: 2 });
    expect(providerRecoveryPhase(await f.read(), f.now())!.phase).toBe(
      "active",
    );
    await f.owner.finishCampaignQuestion(f.proof, q.request, q.conversation);
  });

  describe.each([
    "subscription_sharing_usage_unavailable",
    "subscription_sharing_user_unavailable",
  ])("known temporary synthetic %s", (code) => {
    let f: Awaited<ReturnType<typeof active>>;
    let q: Awaited<ReturnType<typeof question>>;
    let transport: ReturnType<typeof vi.fn<typeof fetch>>;
    // Keep real host setup/provider settlement under its own unchanged 5s
    // deadline, instead of combining it with every subsequent denial check.
    beforeEach(async () => {
      f = await active();
      q = await question(f, f.proof);
      transport = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              error: { code, message: "Synthetic pre-stream denial" },
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          ),
      );
      await expect(call(f, f.proof, q.request, transport)).rejects.toThrow();
    });
    it(`synthetic ${code} counts one failed and stops without retry or second stage`, async () => {
      expect(transport).toHaveBeenCalledTimes(1);
      const s = await f.read();
      expect(
        s.events.filter((e) => e.subject === q.key).map((e) => e.kind),
      ).toEqual(["reserve", "failed"]);
      expect(
        s.events.filter((e) => e.kind === "disable-provider-failure-recovery"),
      ).toHaveLength(1);
      expect(await f.budget()).toMatchObject({
        used: 336,
        remaining: 227,
        held: 1,
      });
      expect(providerRecoveryPhase(s, f.now())!.phase).toBe("disabled");
    });
    it(`after synthetic ${code}, denies stage two, new questions, pairing and reinstallation across restart`, async () => {
      await expect(
        f
          .restart()
          .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
      await expect(
        f.owner.assertDispatch(
          f.proof,
          "customer",
          true,
          `customer:${q.request}:careos_care`,
        ),
      ).rejects.toThrow();
      await expect(
        f.owner.pair(f.agent, f.proof.token, f.recordsOwnerDigest),
      ).rejects.toThrow();
      await expect(
        f.owner.installProviderFailureRecovery(f.approval),
      ).rejects.toThrow();
      expect(await f.owner.status(f.proof)).toMatchObject({
        revoked: true,
        used: 336,
        campaign: { authorized: false },
        standingAllocation: { remaining: 17 },
      });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(await f.budget()).toMatchObject({
        used: 336,
        remaining: 227,
        held: 1,
      });
    });
  });

  it.each([503, 401, 403, 429])(
    "arbitrary/denied HTTP %i stays charged unknown and cannot retry",
    async (status) => {
      const f = await active(),
        q = await question(f, f.proof);
      const transport = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "synthetic_not_a_safe_temporary_code" },
            }),
            { status, headers: { "content-type": "application/json" } },
          ),
      );
      await expect(call(f, f.proof, q.request, transport)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
      const s = await f.read();
      expect(
        s.events.filter((e) => e.subject === q.key).map((e) => e.kind),
      ).toEqual(["reserve", "unknown"]);
      expect(providerRecoveryPhase(s, f.now())!.phase).toBe("disabled");
      await expect(call(f, f.proof, q.request, transport)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(await f.budget()).toMatchObject({ used: 336, held: 1 });
    },
  );

  it.each([
    "identity",
    "permission",
    "refresh-pending",
    "denied-refresh",
    "lost-refresh",
  ])(
    "pre-reservation provider %s stops with zero inference reserve",
    async (kind) => {
      const f = await active(),
        q = await question(f, f.proof);
      const registration = (await f.provider.registration())!;
      if (kind === "identity") registration.subject = "different-subject";
      if (kind === "permission") registration.tokens!.scopes = [];
      if (kind === "refresh-pending") registration.refreshPending = true;
      if (kind === "denied-refresh" || kind === "lost-refresh")
        registration.tokens!.expiresAt = 1;
      await f.provider.write("registration.json", registration);
      const transport = vi.fn(async () => {
        if (kind === "lost-refresh")
          throw new TypeError("synthetic lost refresh");
        return new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      });
      await expect(call(f, f.proof, q.request, transport)).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(
        ["denied-refresh", "lost-refresh"].includes(kind) ? 1 : 0,
      );
      expect(
        (await f.read()).events.filter((e) => e.subject === q.key),
      ).toEqual([]);
      expect(await f.budget()).toMatchObject({ used: 335, held: 2 });
      expect(providerRecoveryPhase(await f.read(), f.now())!.phase).toBe(
        "disabled",
      );
      await expect(
        f
          .restart()
          .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
    },
  );

  it.each([
    "pending-logout",
    "logout",
    "host-revoke",
    "policy",
    "fallback",
    "pending-expired",
  ])(
    "%s is terminal with no replacement session or allowance reset",
    async (kind) => {
      const f = await fixture();
      await f.owner.installProviderFailureRecovery(f.approval);
      const pair = await f.owner.pair(
        f.agent,
        f.oldProof.token,
        f.recordsOwnerDigest,
      );
      const proof = { ...f.oldProof, token: pair.token };
      if (!["pending-logout", "pending-expired"].includes(kind)) {
        await f.owner.approve(pair.id);
        await f.owner.finishBrowser(proof);
      }
      if (kind.endsWith("logout")) await f.owner.logout(proof);
      if (kind === "host-revoke") await f.owner.revokeSession(pair.id);
      if (kind === "policy") await f.owner.revokePolicy(proof);
      if (kind === "fallback")
        await f.owner.disableEvaluationRecovery("managed-critical-fallback");
      if (kind === "pending-expired") f.advance(300000);
      await expect(
        f.restart().pair(f.agent, pair.token, f.recordsOwnerDigest),
      ).rejects.toThrow();
      await expect(f.owner.approve(pair.id)).rejects.toThrow();
      await expect(f.owner.finishBrowser(proof)).rejects.toThrow();
      expect((await f.read()).sessions).toHaveLength(32);
      expect(await f.budget()).toMatchObject({ used: 335, remaining: 228 });
    },
  );

  it("retains whole-question exhaustion and all tail charges through563 without standing17 fallback", async () => {
    const f = await active();
    await f.fill(561);
    const q = await question(f, f.proof);
    for (const stage of ["north_conversation_v1", "careos_care"]) {
      const key = `customer:${q.request}:${stage}`;
      await f.owner.reserve(f.proof, "customer", key, true);
      await f.owner.settle(key, "completed", { httpStatus: 200 });
    }
    await f.owner.finishCampaignQuestion(f.proof, q.request, q.conversation);
    expect(await f.budget()).toMatchObject({
      used: 563,
      remaining: 0,
      held: 0,
    });
    await expect(
      f
        .restart()
        .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
    ).rejects.toThrow();
    expect(await f.owner.status(f.proof)).toMatchObject({
      used: 563,
      remaining: 0,
      standingAllocation: { used: 283, remaining: 17 },
    });
  });

  it("one remaining slot at562 cannot admit a whole question or use standing17", async () => {
    const g = await active();
    await g.fill(562);
    await expect(
      g.owner.beginCampaignQuestion(g.proof, randomUUID(), randomUUID(), true),
    ).rejects.toThrow();
    expect(await g.budget()).toMatchObject({
      used: 562,
      remaining: 1,
      held: 0,
    });
  });

  it("restart retains an unsettled reserve and failure stops even if subsequent legacy helper throws", async () => {
    const f = await active(),
      q = await question(f, f.proof);
    await f.owner.reserve(f.proof, "customer", q.key, true);
    await expect(
      f
        .restart()
        .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
    ).rejects.toThrow();
    vi.spyOn(f.owner, "disableEvaluationRecovery").mockRejectedValueOnce(
      Error("synthetic helper failure"),
    );
    await expect(f.owner.settle(q.key, "unknown")).rejects.toThrow();
    expect(providerRecoveryPhase(await f.read(), f.now())!.phase).toBe(
      "disabled",
    );
    await expect(
      f
        .restart()
        .assertDispatch(
          f.proof,
          "customer",
          true,
          `customer:${q.request}:careos_care`,
        ),
    ).rejects.toThrow();
    expect(await f.budget()).toMatchObject({ used: 336, held: 1 });
  });

  it("a failed terminal alone stops continuation if its later disable marker is lost; no completion rewrite/refund", async () => {
    const f = await active(),
      q = await question(f, f.proof);
    await f.owner.reserve(f.proof, "customer", q.key, true);
    await f.owner.settle(q.key, "failed", { httpStatus: 503 });
    const s = await f.read();
    s.events = s.events.filter(
      (e) => e.kind !== "disable-provider-failure-recovery",
    );
    await f.files.write("owner-state.json", s);
    expect(providerRecoveryPhase(await f.read(), f.now())!.phase).toBe(
      "disabled",
    );
    await expect(
      f
        .restart()
        .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
    ).rejects.toThrow();
    await expect(
      f.owner.settle(q.key, "completed", { httpStatus: 200 }),
    ).rejects.toThrow("settlement_conflict");
    expect(await f.budget()).toMatchObject({ used: 336, held: 1 });
  });

  it("touch and restart never extend the original explicit pin; exact boundary rejects admission", async () => {
    const f = await active();
    // Advance in bounded idle steps, touching only the new session.
    while (f.now() + 86400000 < PROVIDER_RECOVERY_EXPIRY) {
      f.advance(86400000);
      await f.owner.authenticate(f.proof);
    }
    f.advance(PROVIDER_RECOVERY_EXPIRY - 1 - f.now());
    expect(await f.restart().authenticate(f.proof)).toBe(f.pair.id);
    expect((await f.owner.status(f.proof)).campaign!.browserExpiresAt).toBe(
      PROVIDER_RECOVERY_EXPIRY,
    );
    f.advance(1);
    await expect(f.restart().authenticate(f.proof)).rejects.toThrow();
    await expect(f.owner.finishBrowser(f.proof)).rejects.toThrow();
    await expect(
      f.owner.pair(f.agent, f.proof.token, f.recordsOwnerDigest),
    ).rejects.toThrow();
    expect(await f.owner.status(f.proof)).toMatchObject({
      providerRecovery: { phase: "expired" },
      campaign: { authorized: false },
    });
  });

  it.each([
    "missing-field",
    "missing-approval",
    "duplicate-resolution",
    "changed-resolution",
    "deleted-stop",
    "old-session",
    "proof-change",
  ])(
    "restart fails closed for tampered %s without an old grant fallback",
    async (kind) => {
      const f = await active(),
        s = await f.read();
      if (kind === "missing-field") delete s.providerFailureRecovery;
      if (kind === "missing-approval") s.events.splice(1894, 1);
      if (kind === "duplicate-resolution")
        s.events.push({ ...s.events[1895], id: randomUUID() });
      if (kind === "changed-resolution") s.events[1895].subject += "changed";
      if (kind === "deleted-stop") s.events.splice(1892, 1);
      if (kind === "old-session") s.sessions[30].revoked = false;
      if (kind === "proof-change")
        s.providerFailureRecovery!.identity.providerIdentityHash = "0".repeat(
          64,
        );
      await f.files.write("owner-state.json", s);
      await expect(
        f
          .restart()
          .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
    },
  );

  it.each(["before-publication", "after-publication", "directory-sync"])(
    "uncertain %s holds a durable sentinel; status/Finish/admission never use visible authority",
    async (kind) => {
      const f = await fixture();
      class FaultFiles extends PilotFiles {
        syncCalls = 0;
        override async write(
          name: Parameters<PilotFiles["write"]>[0],
          value: unknown,
        ) {
          if (kind === "before-publication")
            throw Error("synthetic before rename");
          await super.write(name, value);
          if (kind === "after-publication")
            throw Error("synthetic write then throw");
        }
        protected override async openDirectory() {
          const handle = await super.openDirectory();
          if (kind === "directory-sync" && ++this.syncCalls === 2)
            handle.sync = async () => {
              throw Error("synthetic directory sync uncertainty");
            };
          return handle;
        }
      }
      const owner = f.restart(new FaultFiles(f.files.directory));
      await expect(
        owner.installProviderFailureRecovery(f.approval),
      ).rejects.toBeInstanceOf(PilotTransitionPublicationUncertainError);
      await expect(
        access(f.files.directory + "/.owner-access-lock"),
      ).resolves.toBeUndefined();
      const restarted = f.restart(new InspectionFiles(f.files.directory));
      await expect(restarted.status(f.oldProof)).rejects.toThrow("locked");
      await expect(restarted.finishBrowser(f.oldProof)).rejects.toThrow(
        "locked",
      );
      await expect(
        restarted.beginCampaignQuestion(
          f.oldProof,
          randomUUID(),
          randomUUID(),
          true,
        ),
      ).rejects.toThrow("locked");
      expect(
        (await f.read()).events.filter(
          (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
        ),
      ).toHaveLength(335);
    },
    15000,
  );

  it("serializes real worker installs and competing whole-question/stage processes", async () => {
    const f = await fixture();
    const worker = (
      action: string,
      proof = f.oldProof,
      request = "",
      conversation = "",
    ) =>
      new Promise<{ ok: boolean }>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            "tests/helpers/provider-failure-recovery-child.ts",
            f.files.directory,
            action,
            String(f.now()),
            proof.token!,
            proof.agent,
            proof.recordsOwnerDigest!,
            request,
            conversation,
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        let out = "",
          err = "";
        child.stdout.on("data", (v) => (out += v));
        child.stderr.on("data", (v) => (err += v));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code) return reject(Error(err));
          try {
            resolve(JSON.parse(out));
          } catch (e) {
            reject(e);
          }
        });
      });
    expect(
      (await Promise.all([worker("install"), worker("install")])).filter(
        (v) => v.ok,
      ),
    ).toHaveLength(1);
    const { proof } = await f.authorize();
    const request = randomUUID(),
      conversation = randomUUID();
    expect(
      (
        await Promise.all([
          worker("open", proof, request, conversation),
          worker("open", proof, randomUUID(), conversation),
        ])
      ).filter((v) => v.ok),
    ).toHaveLength(1);
    const activeRequest = (await f.budget()).activeQuestion!.requestId;
    expect(
      (
        await Promise.all([
          worker("reserve", proof, activeRequest, "north_conversation_v1"),
          worker("reserve", proof, activeRequest, "north_conversation_v1"),
        ])
      ).filter((v) => v.ok),
    ).toHaveLength(1);
    expect(await f.budget()).toMatchObject({ used: 336, held: 1 });
  }, 30000);
});
