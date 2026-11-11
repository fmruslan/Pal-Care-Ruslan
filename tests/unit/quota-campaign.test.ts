import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  StandingOwner,
  OWNER_IDLE,
  OWNER_MAX_AGE,
  OWNER_ORIGIN,
  type OwnerProof,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import {
  RECOVERY_DEADLINE,
  RECOVERY_EVALUATION,
  recoveryHash,
} from "../../src/lib/careos/evaluation-recovery";
import {
  quotaCampaignSchema,
  quotaCampaignExtensionSchema,
  subscriptionIdentityHash,
  northGuideCampaignSchema,
} from "../../src/lib/careos/quota-campaign";
import { campaignBudget } from "../../src/lib/careos/campaign-execution";
import {
  north150Fixture,
  north150Clock,
  north150Hash,
  north150Token,
  north150OldToken,
} from "../helpers/north150-fixture";
import { standingStructured } from "../../src/lib/careos/subscription/standing";
import { z } from "zod";

const roots: string[] = [];
async function fixture() {
  await mkdir("/tmp/opencode", { recursive: true });
  const root = await mkdtemp("/tmp/opencode/north150-quota-unit-");
  roots.push(root);
  const clock = north150Clock(root),
    agent = "quota-synthetic-browser";
  const f = await north150Fixture({
    home: root + "/home",
    agent,
    recordsToken: "f".repeat(64),
    clock,
    release: {
      commit: "a".repeat(40),
      sourceHash: "b".repeat(64),
      buildId: "isolated-quota",
    },
    ciReceiptHash: "c".repeat(64),
    fallbackManifestHash: "d".repeat(64),
    pool: {
      query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
    } as unknown as Pool,
  });
  const grant = await f.files.snapshot("evaluation-recovery.json");
  const approval = quotaCampaignSchema.parse({
    version: 1,
    campaignId: RECOVERY_EVALUATION,
    ownerApprovalHash: north150Hash("explicit new quota-only owner approval"),
    approvedAt: clock.now(),
    calendarExpiresAt: null,
    baselineUsed: 63,
    executionLimit: 163,
    maxAdditional: 100,
    scope: "customer-records-care-native-insights",
    concurrency: 1,
    maxRetries: 0,
    policyHash: recoveryHash(f.state.policy),
    historicalEvaluationHash: recoveryHash(f.state.evaluation),
    historicalRecoveryRawHash: grant!.hash,
    historicalEventCount: 785,
    historicalEventHash: recoveryHash(f.state.events),
    originalSessionHash: recoveryHash(f.state.sessions[0]),
    recordsOwnerDigest: f.recordsOwner,
    agentHash: north150Hash(agent),
    providerIdentityHash: subscriptionIdentityHash(
      await f.provider.registration(),
    ),
  });
  const read = async () =>
    (await f.files.read("owner-state.json")) as OwnerState;
  async function authorize() {
    await f.owner.installQuotaCampaign(approval);
    const pair = await f.owner.pair(agent, north150Token, f.recordsOwner);
    const proof: OwnerProof = {
      token: pair.token,
      agent,
      recordsOwnerDigest: f.recordsOwner,
      channel: "records",
      origin: OWNER_ORIGIN,
    };
    await f.owner.approve(pair.id);
    await f.owner.finishBrowser(proof);
    return { pair, proof };
  }
  async function fill(target: number) {
    const s = await read();
    const add = (kind: OwnerState["events"][number]["kind"], subject: string) =>
      s.events.push({
        id: randomUUID(),
        kind,
        subject,
        at: clock.now(),
        allocationId: RECOVERY_EVALUATION,
        ...(kind === "completed" ? { observation: { httpStatus: 200 } } : {}),
      });
    let used = campaignBudget(s.events).used;
    while (used < target) {
      const request = randomUUID(),
        marker = `customer:${request}:question:${randomUUID()}`;
      add("question-open", marker);
      const stages =
        (target - used) % 2
          ? ["north_conversation_v1"]
          : ["north_conversation_v1", "careos_care"];
      for (const stage of stages) {
        add("reserve", `customer:${request}:${stage}`);
        add("completed", `customer:${request}:${stage}`);
        used++;
      }
      add("question-close", marker);
    }
    await f.files.write("owner-state.json", s);
    clock.advance(60001);
  }
  return {
    ...f,
    agent,
    approval,
    grant,
    read,
    authorize,
    fill,
    async extension() {
      const s = await read();
      return quotaCampaignExtensionSchema.parse({
        version: 1,
        campaignId: RECOVERY_EVALUATION,
        approvedAt: clock.now(),
        ownerApprovalHash: north150Hash(
          "explicit second additional 100 approval",
        ),
        calendarExpiresAt: null,
        baselineUsed: 163,
        executionLimit: 263,
        maxAdditional: 100,
        previousAuthorizationHash: recoveryHash(s.quotaCampaign),
        checkpointEventCount: s.events.length,
        checkpointEventHash: recoveryHash(s.events),
      });
    },
    restart: () => new StandingOwner(f.files, clock.now),
  };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("separately approved 263 plus 300 guide campaign", () => {
  async function exhaustedGuide() {
    const f = await fixture();
    const old = await f.authorize();
    await f.fill(163);
    await f.owner.revokeSession(old.pair.id);
    await f.owner.installQuotaCampaignExtension(await f.extension());
    const browser = await f.owner.pair(
      f.agent,
      old.proof.token,
      f.recordsOwner,
    );
    const proof = { ...old.proof, token: browser.token };
    await f.owner.approve(browser.id);
    await f.owner.finishBrowser(proof);
    await f.fill(263);
    await f.owner.revokeSession(browser.id);
    const before = await f.read();
    const guide = northGuideCampaignSchema.parse({
      version: 1,
      campaignId: RECOVERY_EVALUATION,
      approvedAt: f.clock.now(),
      ownerApprovalHash: north150Hash(
        "owner confirms 300 NEW useful guide attempts",
      ),
      calendarExpiresAt: null,
      baselineUsed: 263,
      executionLimit: 563,
      maxAdditional: 300,
      purpose: "north-current-interface-guidance-300",
      previousAuthorizationHash: recoveryHash(before.quotaCampaignExtension),
      checkpointEventCount: before.events.length,
      checkpointEventHash: recoveryHash(before.events),
    });
    return { ...f, old, browser, proof, before, guide };
  }
  async function installed() {
    const f = await exhaustedGuide();
    await f.owner.installNorthGuideCampaign(f.guide);
    const browser = await f.owner.pair(f.agent, f.proof.token, f.recordsOwner);
    const proof = { ...f.proof, token: browser.token };
    await f.owner.approve(browser.id);
    await f.owner.finishBrowser(proof);
    return { ...f, newBrowser: browser, newProof: proof };
  }
  it("keeps all old grants, 263 charges, unknowns and revoked proofs; new approval survives restart", async () => {
    const f = await installed();
    const after = await f.read();
    for (const field of [
      "policy",
      "evaluation",
      "quotaCampaign",
      "quotaCampaignExtension",
    ] as const)
      expect(after[field]).toEqual(f.before[field]);
    expect(after.events.slice(0, f.before.events.length)).toEqual(
      f.before.events,
    );
    expect(after.sessions.slice(0, f.before.sessions.length)).toEqual(
      f.before.sessions,
    );
    expect((await f.files.snapshot("evaluation-recovery.json"))!.hash).toBe(
      f.grant!.hash,
    );
    expect(await f.restart().quotaCampaignStatus()).toMatchObject({
      active: true,
      executionLimit: 563,
      used: 263,
      remaining: 300,
      baselineUsed: 263,
      maxAdditional: 300,
      authorizationHash: recoveryHash(f.guide),
    });
    expect(await f.restart().status(f.newProof)).toMatchObject({
      requestLimit: 563,
      used: 263,
      remaining: 300,
      unknown: 1,
      campaign: { authorized: true, baselineUsed: 263, maxAdditional: 300 },
      standingAllocation: { used: 274, remaining: 26 },
    });
    await expect(f.owner.authenticate(f.proof)).rejects.toThrow();
    await expect(f.owner.installNorthGuideCampaign(f.guide)).rejects.toThrow(
      "already_set",
    );
  });
  it("retains two-stage admission through 563 and denies the 301st new attempt without resets", async () => {
    const f = await installed();
    await f.fill(561);
    const request = randomUUID(),
      conversation = randomUUID();
    await f.owner.beginCampaignQuestion(
      f.newProof,
      request,
      conversation,
      true,
    );
    for (const stage of ["north_conversation_v1", "careos_care"]) {
      await f.owner.reserve(
        f.newProof,
        "customer",
        `customer:${request}:${stage}`,
        true,
      );
      await f.owner.settle(`customer:${request}:${stage}`, "completed", {
        httpStatus: 200,
      });
    }
    await f.owner.finishCampaignQuestion(f.newProof, request, conversation);
    expect(campaignBudget((await f.read()).events)).toMatchObject({
      used: 563,
      remaining: 0,
      held: 0,
    });
    const before = await f.read();
    await expect(
      f.owner.beginCampaignQuestion(
        f.newProof,
        randomUUID(),
        randomUUID(),
        true,
      ),
    ).rejects.toThrow();
    expect(await f.read()).toEqual(before);
  });
  it("one remaining attempt cannot admit a two-stage question", async () => {
    const f = await installed();
    await f.fill(562);
    await expect(
      f.owner.beginCampaignQuestion(
        f.newProof,
        randomUUID(),
        randomUUID(),
        true,
      ),
    ).rejects.toThrow();
    expect(campaignBudget((await f.read()).events)).toMatchObject({
      used: 562,
      remaining: 1,
      held: 0,
    });
  });
  it.each([
    "cap",
    "baseline",
    "previous",
    "prefix",
    "approval",
    "future",
    "active-browser",
    "unsettled",
    "provider",
  ])("rejects %s without publishing any state", async (kind) => {
    const f = await exhaustedGuide();
    const guide: Record<string, unknown> = { ...f.guide };
    if (kind === "cap") guide.executionLimit = 600;
    if (kind === "baseline") guide.baselineUsed = 0;
    if (kind === "previous")
      guide.previousAuthorizationHash = recoveryHash(f.before.quotaCampaign);
    if (kind === "prefix") guide.checkpointEventHash = "0".repeat(64);
    if (kind === "approval")
      guide.ownerApprovalHash =
        f.before.quotaCampaignExtension!.ownerApprovalHash;
    if (kind === "future") guide.approvedAt = f.clock.now() + 60000;
    if (["active-browser", "unsettled", "provider"].includes(kind)) {
      const s = await f.read();
      if (kind === "active-browser")
        s.sessions.find((v) => v.id === f.browser.id)!.revoked = false;
      if (kind === "unsettled")
        s.events.splice(
          s.events.findLastIndex((e) => e.kind === "question-close"),
          1,
        );
      if (kind === "provider")
        s.events.push({
          id: randomUUID(),
          at: f.clock.now(),
          kind: "provider-block",
          subject: "blocked",
        });
      await f.files.write("owner-state.json", s);
    }
    const before = await f.read();
    await expect(f.owner.installNorthGuideCampaign(guide)).rejects.toThrow();
    expect(await f.read()).toEqual(before);
  });
  it("rejects an approval event without its exact grant and never funds an old question retroactively", async () => {
    const f = await installed();
    const s = await f.read();
    delete s.northGuideCampaign;
    await f.files.write("owner-state.json", s);
    await expect(
      f.owner.beginCampaignQuestion(
        f.newProof,
        randomUUID(),
        randomUUID(),
        true,
      ),
    ).rejects.toThrow();
    const events = structuredClone(f.before.events);
    events.splice(786, 0, {
      id: randomUUID(),
      at: f.clock.now(),
      kind: "approve-north-guide-campaign",
      subject: recoveryHash(f.guide),
      allocationId: RECOVERY_EVALUATION,
      executionLimit: 563,
    });
    expect(() => campaignBudget(events)).toThrow("invalid_ledger");
  });
  it("retains every journal entry past the old 3000 bound and fails closed above the new 5000 bound", async () => {
    const f = await installed();
    const s = await f.read();
    while (s.events.length < 5000)
      s.events.push({
        id: randomUUID(),
        at: f.clock.now(),
        kind: "touch",
        subject: f.newBrowser.id,
      });
    await f.files.write("owner-state.json", s);
    expect(await f.owner.quotaCampaignStatus()).toMatchObject({
      active: true,
      used: 263,
    });
    expect((await f.read()).events).toEqual(s.events);
    s.events.push({
      id: randomUUID(),
      at: f.clock.now(),
      kind: "touch",
      subject: f.newBrowser.id,
    });
    await f.files.write("owner-state.json", s);
    await expect(f.owner.quotaCampaignStatus()).rejects.toThrow();
  });
});

describe("one exact additive 163 to 263 amendment", () => {
  async function exhausted() {
    const f = await fixture();
    const old = await f.authorize();
    await f.fill(163);
    await f.owner.revokeSession(old.pair.id);
    return { ...f, old };
  }
  async function extend() {
    const f = await exhausted();
    const before = await f.read();
    const extension = await f.extension();
    await f.owner.installQuotaCampaignExtension(extension);
    const pair = await f.owner.pair(f.agent, f.old.proof.token, f.recordsOwner);
    const proof = { ...f.old.proof, token: pair.token };
    await expect(f.owner.authenticate(proof)).rejects.toThrow();
    await f.owner.approve(pair.id);
    await f.owner.finishBrowser(proof);
    return { ...f, before, extension, proof, pair };
  }
  it("preserves original policy, all 163 charges and revoked browsers; binds the new authorization across restart", async () => {
    const f = await extend();
    const after = await f.read();
    expect(after.quotaCampaign).toEqual(f.before.quotaCampaign);
    expect(after.policy).toEqual(f.before.policy);
    expect(after.evaluation).toEqual(f.before.evaluation);
    expect(after.sessions.slice(0, f.before.sessions.length)).toEqual(
      f.before.sessions,
    );
    expect(after.events.slice(0, f.before.events.length)).toEqual(
      f.before.events,
    );
    expect((await f.files.snapshot("evaluation-recovery.json"))!.hash).toBe(
      f.grant!.hash,
    );
    expect(after.events[f.before.events.length]).toMatchObject({
      kind: "approve-quota-campaign-extension",
      executionLimit: 263,
      subject: recoveryHash(f.extension),
      allocationId: RECOVERY_EVALUATION,
    });
    expect(await f.restart().quotaCampaignStatus()).toMatchObject({
      active: true,
      executionLimit: 263,
      baselineUsed: 163,
      maxAdditional: 100,
      used: 163,
      remaining: 100,
      authorizationHash: recoveryHash(f.extension),
      ownerApprovalHash: f.extension.ownerApprovalHash,
    });
    expect(await f.restart().status(f.proof)).toMatchObject({
      requestLimit: 263,
      used: 163,
      remaining: 100,
      campaign: { authorized: true, baselineUsed: 163, maxAdditional: 100 },
      standingAllocation: { used: 274, remaining: 26 },
      unknown: 1,
    });
    const request = randomUUID(),
      conversation = randomUUID();
    await f
      .restart()
      .beginCampaignQuestion(f.proof, request, conversation, true);
    expect(
      await f
        .restart()
        .assertDispatch(
          f.proof,
          "customer",
          true,
          `customer:${request}:north_conversation_v1`,
        ),
    ).toMatchObject({
      requestLimit: 263,
      concurrency: 1,
      maxRetries: 0,
      providerIdentityHash: f.approval.providerIdentityHash,
    });
    await f.restart().finishCampaignQuestion(f.proof, request, conversation);
    await expect(f.restart().authenticate(f.old.proof)).rejects.toThrow();
    await expect(
      f.owner.installQuotaCampaignExtension(f.extension),
    ).rejects.toThrow("already_set");
  });
  it("converts the 261 two-stage hold to exactly 263, then denies without replenishment", async () => {
    const f = await extend();
    await f.fill(261);
    const request = randomUUID(),
      conversation = randomUUID();
    await f
      .restart()
      .beginCampaignQuestion(f.proof, request, conversation, true);
    expect(campaignBudget((await f.read()).events)).toMatchObject({
      used: 261,
      held: 2,
    });
    for (const stage of ["north_conversation_v1", "careos_care"]) {
      await f
        .restart()
        .reserve(f.proof, "customer", `customer:${request}:${stage}`, true);
      await f.restart().settle(`customer:${request}:${stage}`, "completed", {
        httpStatus: 200,
      });
    }
    await f.restart().finishCampaignQuestion(f.proof, request, conversation);
    expect(campaignBudget((await f.read()).events)).toMatchObject({
      used: 263,
      remaining: 0,
      held: 0,
    });
    const before = await f.read();
    await expect(
      f
        .restart()
        .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
    ).rejects.toThrow();
    expect(await f.read()).toEqual(before);
  });
  it("denies a new question at 262 with no hold", async () => {
    const f = await extend();
    await f.fill(262);
    await expect(
      f
        .restart()
        .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
    ).rejects.toThrow();
    expect(campaignBudget((await f.read()).events)).toMatchObject({
      used: 262,
      remaining: 1,
      held: 0,
    });
  });
  it("cannot apply the amendment before the 163 checkpoint or retroactively fund an old question", async () => {
    const f = await extend();
    const events = structuredClone((await f.read()).events);
    const [approval] = events.splice(f.before.events.length, 1);
    events.splice(786, 0, approval);
    expect(() => campaignBudget(events)).toThrow("invalid_ledger");
    const prefix = structuredClone(f.before.events);
    const request = randomUUID();
    prefix.push({
      id: randomUUID(),
      at: f.clock.now(),
      kind: "question-open",
      subject: `customer:${request}:question:${randomUUID()}`,
      allocationId: RECOVERY_EVALUATION,
    });
    prefix.push(approval);
    expect(() => campaignBudget(prefix)).toThrow("invalid_ledger");
  });
  it.each(["agent", "records", "channel", "origin"])(
    "retains the inherited %s boundary",
    async (field) => {
      const f = await extend();
      const bad = { ...f.proof };
      if (field === "agent") bad.agent = "different-browser";
      if (field === "records") bad.recordsOwnerDigest = "0".repeat(64);
      if (field === "channel") bad.channel = undefined;
      if (field === "origin") bad.origin = "https://example.invalid";
      await expect(
        f
          .restart()
          .beginCampaignQuestion(bad, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
      expect(campaignBudget((await f.read()).events).used).toBe(163);
    },
  );
  it.each(["policy", "provider", "campaign", "session"])(
    "fails closed on %s revocation after extension",
    async (kind) => {
      const f = await extend();
      if (kind === "policy") await f.owner.revokePolicy(f.proof);
      if (kind === "provider") await f.owner.blockProvider();
      if (kind === "campaign") await f.owner.disableEvaluationRecovery();
      if (kind === "session") await f.owner.revokeSession(f.pair.id);
      await expect(
        f
          .restart()
          .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
      expect(campaignBudget((await f.read()).events).used).toBe(163);
    },
  );
  it.each([
    "baseline",
    "prefix",
    "previous",
    "owner",
    "cap",
    "deadline",
    "provider",
    "policy",
    "browser",
    "unsettled",
  ])("rejects invalid %s installation without writes", async (kind) => {
    const f = await exhausted();
    if (kind === "baseline" || kind === "browser" || kind === "unsettled") {
      const s = await f.read();
      if (kind === "baseline")
        s.events.splice(
          s.events.findLastIndex((e) => e.kind === "question-open"),
          6,
        );
      if (kind === "browser")
        s.sessions.find((s) => s.id === f.old.pair.id)!.revoked = false;
      if (kind === "unsettled")
        s.events.splice(
          s.events.findLastIndex((e) => e.kind === "question-close"),
          1,
        );
      await f.files.write("owner-state.json", s);
    }
    if (kind === "provider") await f.owner.blockProvider();
    if (kind === "policy") {
      const s = await f.read();
      s.events.push({
        id: randomUUID(),
        at: f.clock.now(),
        kind: "revoke-policy",
        subject: s.policy!.id,
      });
      await f.files.write("owner-state.json", s);
    }
    const extension = (await f.extension()) as Record<string, unknown>;
    if (kind === "prefix") extension.checkpointEventHash = "0".repeat(64);
    if (kind === "previous")
      extension.previousAuthorizationHash = "0".repeat(64);
    if (kind === "owner")
      extension.ownerApprovalHash = f.approval.ownerApprovalHash;
    if (kind === "cap") extension.executionLimit = 300;
    if (kind === "deadline") extension.calendarExpiresAt = Date.now();
    const before = await f.read();
    await expect(
      f.owner.installQuotaCampaignExtension(extension),
    ).rejects.toThrow();
    expect(await f.read()).toEqual(before);
  });
  it.each(["prefix", "approval", "missing-extension", "stale-original"])(
    "denies tampered %s authorization on restart",
    async (kind) => {
      const f = await extend();
      const s = await f.read();
      if (kind === "prefix") s.events[800].subject += "changed";
      if (kind === "approval")
        s.events[f.before.events.length].subject = recoveryHash(f.approval);
      if (kind === "missing-extension") delete s.quotaCampaignExtension;
      if (kind === "stale-original")
        s.quotaCampaignExtension!.previousAuthorizationHash = "0".repeat(64);
      await f.files.write("owner-state.json", s);
      await expect(
        f
          .restart()
          .beginCampaignQuestion(f.proof, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
    },
  );
});

describe("additive quota-only policy using established browser approval", () => {
  it("preserves the old disabled grant/deadline/revocations, requires a new approved browser and keeps 63/163", async () => {
    const f = await fixture(),
      before = await f.read();
    expect(
      await f.owner.status({ token: north150Token, agent: f.agent }),
    ).toMatchObject({ campaign: { maxAdditional: 87 } });
    const { proof, pair } = await f.authorize();
    expect(pair.token).not.toBe(north150Token);
    expect(await f.owner.authenticate(proof)).toBe(pair.id);
    for (const token of [north150Token, north150OldToken])
      await expect(f.owner.authenticate({ ...proof, token })).rejects.toThrow();
    const after = await f.read();
    expect(after.policy).toEqual(before.policy);
    expect(after.evaluation).toEqual(before.evaluation);
    expect(after.sessions.slice(0, before.sessions.length)).toEqual(
      before.sessions,
    );
    expect(after.events.slice(0, 785)).toEqual(before.events);
    expect((await f.files.snapshot("evaluation-recovery.json"))!.hash).toBe(
      f.grant!.hash,
    );
    expect(await f.owner.status(proof)).toMatchObject({
      remembered: true,
      requestLimit: 163,
      used: 63,
      remaining: 100,
      maxRetries: 0,
      concurrency: 1,
      standingAllocation: { used: 274, remaining: 26 },
      unknown: 1,
      campaign: {
        authorization: "quota-bounded",
        authorized: true,
        calendarExpiresAt: null,
        maxAdditional: 100,
      },
      evaluation: {
        expiresAt: null,
        originalExpiresAt: RECOVERY_DEADLINE,
        browserBound: true,
      },
    });
    await expect(f.owner.installQuotaCampaign(f.approval)).rejects.toThrow(
      "already_set",
    );
  });
  it("allows new dispatch after the historical calendar deadline, but not after idle/absolute browser expiry", async () => {
    const f = await fixture(),
      { proof } = await f.authorize();
    f.clock.advance(RECOVERY_DEADLINE + 86400000 - f.clock.now());
    const request = randomUUID(),
      conversation = randomUUID();
    await f.restart().beginCampaignQuestion(proof, request, conversation, true);
    await f
      .restart()
      .reserve(
        proof,
        "customer",
        `customer:${request}:north_conversation_v1`,
        true,
      );
    await f.owner.settle(
      `customer:${request}:north_conversation_v1`,
      "completed",
      { httpStatus: 200 },
    );
    await f.restart().finishCampaignQuestion(proof, request, conversation);
    expect(campaignBudget((await f.read()).events)).toMatchObject({
      used: 64,
      remaining: 99,
      held: 0,
    });
    f.clock.advance(OWNER_IDLE);
    await expect(f.restart().authenticate(proof)).rejects.toThrow();
    expect(await f.owner.status(proof)).toMatchObject({
      remembered: false,
      used: 64,
      remaining: 99,
      requestLimit: 163,
    });
  });
  it("does not authorize a pending browser, change a pending secret on reload or bypass host approval", async () => {
    const f = await fixture();
    await f.owner.installQuotaCampaign(f.approval);
    const pair = await f.owner.pair(f.agent, north150Token, f.recordsOwner);
    const proof = {
      token: pair.token,
      agent: f.agent,
      recordsOwnerDigest: f.recordsOwner,
      channel: "records" as const,
    };
    expect(
      await f.owner.pair(f.agent, pair.token, f.recordsOwner),
    ).toMatchObject({ id: pair.id, token: pair.token, reused: true });
    await expect(f.owner.authenticate(proof)).rejects.toThrow();
    await expect(f.owner.finishBrowser(proof)).rejects.toThrow();
    expect(await f.owner.status(proof)).toMatchObject({
      used: 63,
      remaining: 100,
      remembered: false,
    });
    f.clock.advance(300001);
    await expect(f.owner.approve(pair.id)).rejects.toThrow("expired");
  });
  it.each(["agent", "records", "channel", "studio", "origin"])(
    "rejects changed %s without standing-allocation fallback",
    async (field) => {
      const f = await fixture(),
        { proof } = await f.authorize();
      const bad = { ...proof };
      if (field === "agent") bad.agent = "other";
      if (field === "records") bad.recordsOwnerDigest = "0".repeat(64);
      if (field === "channel") bad.channel = undefined;
      if (field === "origin") bad.origin = "https://example.invalid";
      const before = await f.read();
      await expect(
        f.owner.assertDispatch(
          bad,
          field === "studio" ? "customer-studio" : "customer",
          true,
          `customer:${randomUUID()}:north_conversation_v1`,
        ),
      ).rejects.toThrow();
      expect(await f.read()).toEqual(before);
    },
  );
  it.each(["logout", "policy", "host", "fallback", "provider"])(
    "honors %s cancellation across restart without changing standing policy or old grant",
    async (kind) => {
      const f = await fixture(),
        { proof, pair } = await f.authorize();
      if (kind === "logout") await f.owner.logout(proof);
      if (kind === "policy") await f.owner.revokePolicy(proof);
      if (kind === "host") await f.owner.revokeSession(pair.id);
      if (kind === "fallback") await f.owner.disableEvaluationRecovery();
      if (kind === "provider") await f.owner.blockProvider();
      await expect(
        f
          .restart()
          .beginCampaignQuestion(proof, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
      expect((await f.read()).policy).toEqual(f.state.policy);
      expect((await f.files.snapshot("evaluation-recovery.json"))!.hash).toBe(
        f.grant!.hash,
      );
      expect(
        (await f.read()).events.filter(
          (e) => e.kind === "reserve" && !e.allocationId,
        ),
      ).toHaveLength(274);
    },
  );
  it.each([162, 163])(
    "rejects a complete new question at %i without replenishment or a standing charge",
    async (target) => {
      const f = await fixture(),
        { proof } = await f.authorize();
      await f.fill(target);
      const before = await f.read();
      await expect(
        f.owner.beginCampaignQuestion(proof, randomUUID(), randomUUID(), true),
      ).rejects.toThrow();
      expect(await f.read()).toEqual(before);
      expect(await f.owner.status(proof)).toMatchObject({
        used: target,
        remaining: 163 - target,
        standingAllocation: { used: 274, remaining: 26 },
      });
    },
  );
  it("converts the 161 two-slot hold to exactly 163 and closes at exhaustion", async () => {
    const f = await fixture(),
      { proof } = await f.authorize();
    await f.fill(161);
    const request = randomUUID(),
      conversation = randomUUID();
    await f.owner.beginCampaignQuestion(proof, request, conversation, true);
    for (const stage of ["north_conversation_v1", "careos_care"]) {
      await f.owner.reserve(
        proof,
        "customer",
        `customer:${request}:${stage}`,
        true,
      );
      await f.owner.settle(`customer:${request}:${stage}`, "completed", {
        httpStatus: 200,
      });
    }
    await f.owner.finishCampaignQuestion(proof, request, conversation);
    expect(campaignBudget((await f.read()).events)).toMatchObject({
      used: 163,
      remaining: 0,
      held: 0,
    });
  });
  it("pins provider identity before refresh and does not dispatch using another client/subject", async () => {
    const f = await fixture(),
      { proof } = await f.authorize();
    const request = randomUUID(),
      conversation = randomUUID();
    await f.owner.beginCampaignQuestion(proof, request, conversation, true);
    const registration = (await f.provider.registration())!;
    await f.provider.write("registration.json", {
      ...registration,
      subject: "different-provider-owner",
    });
    const transport = vi.fn();
    await expect(
      standingStructured({
        files: f.provider,
        owner: f.owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: request,
        payload: "{}",
        schema: z.object({ ok: z.boolean() }),
        name: "north_conversation_v1",
        signal: AbortSignal.timeout(1000),
        transport,
      }),
    ).rejects.toThrow("provider_identity_denied");
    expect(transport).not.toHaveBeenCalled();
    expect(campaignBudget((await f.read()).events).used).toBe(63);
  });
  it.each(["deadline", "cap", "history", "recovery", "grant"])(
    "rejects manipulated %s approval metadata",
    async (field) => {
      const f = await fixture(),
        changed = structuredClone(f.approval) as Record<string, unknown>;
      if (field === "deadline") changed.expiresAt = Date.now() + OWNER_MAX_AGE;
      if (field === "cap") changed.executionLimit = 300;
      if (field === "history") changed.historicalEventHash = "0".repeat(64);
      if (field === "recovery")
        changed.historicalRecoveryRawHash = "0".repeat(64);
      if (field === "grant") changed.historicalEvaluationHash = "0".repeat(64);
      const before = await f.read();
      await expect(f.owner.installQuotaCampaign(changed)).rejects.toThrow();
      expect(await f.read()).toEqual(before);
    },
  );
});
