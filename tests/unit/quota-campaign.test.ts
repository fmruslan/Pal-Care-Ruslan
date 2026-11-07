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
  subscriptionIdentityHash,
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
    let used = 63;
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
    restart: () => new StandingOwner(f.files, clock.now),
  };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("additive quota-only policy using established browser approval", () => {
  it("preserves the old disabled grant/deadline/revocations, requires a new approved browser and keeps 63/163", async () => {
    const f = await fixture(),
      before = await f.read();
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
