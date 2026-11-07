import { afterEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  StandingOwner,
  type OwnerState,
  type OwnerProof,
} from "../../src/lib/careos/standing-owner";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  RECOVERY_EVALUATION,
  RECOVERY_SESSION,
} from "../../src/lib/careos/evaluation-recovery";
import { campaignBudget } from "../../src/lib/careos/campaign-execution";

const roots: string[] = [];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function fixture(used = 63) {
  await mkdir("/tmp/opencode", { recursive: true });
  const directory = await mkdtemp("/tmp/opencode/campaign-owner-unit-");
  roots.push(directory);
  const files = new PilotFiles(directory);
  await files.prepare();
  const now = Date.now(),
    token = "a".repeat(64);
  const proof: OwnerProof = {
    token,
    agent: "synthetic-campaign-browser",
    channel: "records",
  };
  const state: OwnerState = {
    version: 1,
    policy: {
      id: randomUUID(),
      approvedAt: now - 3600000,
      provider: "chatgpt-subscription",
      model: "gpt-6.1-sol",
      reasoning: "medium",
      origin: "https://greatbison.tail9e8802.ts.net:8444",
      scopes: ["customer", "customer-studio"],
      requestLimit: 300,
      concurrency: 4,
      requestsPerMinute: 30,
      maxRetries: 1,
      creditsDisabledConfirmed: true,
      providerPermissionConfirmed: true,
      historicalJournalHash: sha("retained-synthetic-history"),
    },
    sessions: [
      {
        id: RECOVERY_SESSION,
        tokenHash: sha(token),
        agentHash: sha(proof.agent),
        createdAt: now - 3600000,
        lastSeen: now - 1000,
        approvedAt: now - 3500000,
        finishedAt: now - 3499000,
        expiresAt: now + 3600000,
        revoked: false,
      },
    ],
    events: [],
  };
  for (let n = 0; n < 274 + used; n++) {
    const subject = `customer:${randomUUID()}:north_conversation_v1`;
    const allocation = n >= 274 ? { allocationId: RECOVERY_EVALUATION } : {};
    const at = now - 600000 + n * 100;
    state.events.push(
      { id: randomUUID(), at, kind: "reserve", subject, ...allocation },
      {
        id: randomUUID(),
        at: at + 1,
        kind: n === 0 ? "unknown" : "completed",
        subject,
        observation: { httpStatus: 200 },
        ...allocation,
      },
    );
  }
  state.evaluation = {
    id: RECOVERY_EVALUATION,
    sessionId: RECOVERY_SESSION,
    policyId: state.policy!.id,
    policyHash: sha(JSON.stringify(state.policy)),
    approvedAt: now - 3500000,
    expiresAt: now + 3600000,
    requestLimit: 300,
    purpose: "north-language-300",
    fastApplicationQuotaApproved: true,
    baselineEventCount: 548,
    baselineEventHash: sha(JSON.stringify(state.events.slice(0, 548))),
  };
  await files.write("owner-state.json", state);
  const owner = new StandingOwner(files);
  const read = async () => (await files.read("owner-state.json")) as OwnerState;
  const worker = (action: string, requestId: string, conversationId: string) =>
    new Promise<{ ok: boolean; code?: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "tests/helpers/campaign-owner-child.ts",
          directory,
          action,
          requestId,
          conversationId,
          token,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0)
          return reject(Error(`isolated_worker_failed: ${stderr}`));
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(error);
        }
      });
    });
  return { files, state, owner, proof, read, worker };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("central campaign admission and cross-process lock, synthetic state only", () => {
  it("requires the records channel even for a nonrecovered fixed-campaign principal", async () => {
    const c = await fixture(),
      request = randomUUID(),
      conversation = randomUUID();
    const missingChannel = { ...c.proof, channel: undefined };
    await expect(c.owner.authenticate(missingChannel)).rejects.toThrow(
      "scope_denied",
    );
    await expect(
      c.owner.authenticate(c.proof, "customer-studio"),
    ).rejects.toThrow("scope_denied");
    await c.owner.beginCampaignQuestion(c.proof, request, conversation, true);
    await c.owner.reserve(
      c.proof,
      "customer",
      `customer:${request}:north_conversation_v1`,
      true,
    );
    await c.owner.settle(
      `customer:${request}:north_conversation_v1`,
      "completed",
      { httpStatus: 200 },
    );
    const before = await c.read();
    await expect(
      c.owner.reserve(
        missingChannel,
        "customer",
        `customer:${request}:careos_care`,
        true,
      ),
    ).rejects.toThrow("scope_denied");
    await expect(
      c.owner.assertDispatch(
        missingChannel,
        "customer",
        true,
        `customer:${request}:careos_care`,
      ),
    ).rejects.toThrow("scope_denied");
    expect(await c.read()).toEqual(before);
  });
  it("reports 63/150 and retained 300 separately, preserving the standing 274/26 and unknown", async () => {
    const c = await fixture();
    expect(await c.owner.status(c.proof)).toMatchObject({
      used: 63,
      requestLimit: 150,
      remaining: 87,
      evaluation: { limit: 150, historicalLimit: 300, remaining: 87 },
      campaign: {
        historicalLimit: 300,
        executionLimit: 150,
        historicalRemaining: 237,
        maxAdditional: 87,
      },
      standingAllocation: { used: 274, remaining: 26 },
      unknown: 1,
    });
    expect(await c.read()).toEqual(c.state);
  });
  it("serializes two real processes admitting whole questions without spending attempts", async () => {
    const c = await fixture(148),
      conversation = randomUUID();
    const results = await Promise.all([
      c.worker("open", randomUUID(), conversation),
      c.worker("open", randomUUID(), conversation),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(campaignBudget((await c.read()).events)).toMatchObject({
      used: 148,
      remaining: 2,
      held: 2,
      availableForNewQuestion: 0,
    });
    expect((await c.read()).events.slice(0, c.state.events.length)).toEqual(
      c.state.events,
    );
  }, 30000);
  it("atomically converts a 148 hold to 149 and 150 despite competing stage processes", async () => {
    const c = await fixture(148),
      request = randomUUID(),
      conversation = randomUUID();
    await c.owner.beginCampaignQuestion(c.proof, request, conversation, true);
    for (const [action, stage, used] of [
      ["stage-one", "north_conversation_v1", 149],
      ["stage-two", "careos_care", 150],
    ] as const) {
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          c.worker(action, request, conversation),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(campaignBudget((await c.read()).events)).toMatchObject({
        used,
        held: 150 - used,
        availableForNewQuestion: 0,
      });
      await c.owner.settle(`customer:${request}:${stage}`, "completed", {
        httpStatus: 200,
      });
    }
    await c.owner.finishCampaignQuestion(c.proof, request, conversation);
    expect(campaignBudget((await c.read()).events)).toMatchObject({
      used: 150,
      held: 0,
      remaining: 0,
    });
    await expect(
      c.owner.beginCampaignQuestion(c.proof, randomUUID(), conversation, true),
    ).rejects.toThrow();
    expect((await c.read()).policy).toEqual(c.state.policy);
    expect((await c.read()).evaluation).toEqual(c.state.evaluation);
    expect((await c.read()).sessions).toEqual(c.state.sessions);
    expect(await c.owner.status(c.proof)).toMatchObject({
      standingAllocation: { used: 274, remaining: 26 },
      unknown: 1,
    });
  }, 30000);
  it.each([149, 150])(
    "rejects a new whole question at %i without any ledger write",
    async (used) => {
      const c = await fixture(used),
        before = await readFile(
          `${c.files.directory}/owner-state.json`,
          "utf8",
        );
      await expect(
        c.owner.beginCampaignQuestion(
          c.proof,
          randomUUID(),
          randomUUID(),
          true,
        ),
      ).rejects.toThrow();
      expect(
        await readFile(`${c.files.directory}/owner-state.json`, "utf8"),
      ).toBe(before);
    },
  );
  it("rejects direct stage, care-first, wrong request, retry and duplicate dispatch", async () => {
    const c = await fixture(),
      request = randomUUID(),
      conversation = randomUUID();
    const key = `customer:${request}:north_conversation_v1`;
    await expect(
      c.owner.assertDispatch(c.proof, "customer", true, key),
    ).rejects.toThrow();
    await expect(
      c.owner.reserve(c.proof, "customer", key, true),
    ).rejects.toThrow();
    await c.owner.beginCampaignQuestion(c.proof, request, conversation, true);
    for (const bad of [
      `customer:${request}:careos_care`,
      `${key}:retry-1`,
      `customer:${randomUUID()}:north_conversation_v1`,
    ]) {
      await expect(
        c.owner.assertDispatch(c.proof, "customer", true, bad),
      ).rejects.toThrow();
      await expect(
        c.owner.reserve(c.proof, "customer", bad, true),
      ).rejects.toThrow();
    }
    await c.owner.reserve(c.proof, "customer", key, true);
    await expect(
      c.owner.reserve(c.proof, "customer", key, true),
    ).rejects.toThrow();
    await expect(
      c.owner.finishCampaignQuestion(c.proof, request, conversation),
    ).rejects.toThrow();
    await c.owner.settle(key, "completed", { httpStatus: 200 });
    await c.owner.finishCampaignQuestion(c.proof, request, conversation);
    expect(campaignBudget((await c.read()).events)).toMatchObject({
      used: 64,
      remaining: 86,
      held: 0,
    });
    await expect(
      c.owner.beginCampaignQuestion(c.proof, request, conversation, true),
    ).rejects.toThrow();
  });
  it.each(["failed", "unknown", "unsettled"] as const)(
    "retains charged %s work and its unstarted hold across process restart",
    async (outcome) => {
      const c = await fixture(),
        request = randomUUID(),
        conversation = randomUUID();
      const key = `customer:${request}:north_conversation_v1`;
      await c.owner.beginCampaignQuestion(c.proof, request, conversation, true);
      await c.owner.reserve(c.proof, "customer", key, true);
      if (outcome !== "unsettled") await c.owner.settle(key, outcome);
      expect((await c.worker("open", randomUUID(), conversation)).ok).toBe(
        false,
      );
      await expect(
        new StandingOwner(c.files).finishCampaignQuestion(
          c.proof,
          request,
          conversation,
        ),
      ).rejects.toThrow();
      expect(campaignBudget((await c.read()).events)).toMatchObject({
        used: 64,
        remaining: 86,
        held: 1,
      });
    },
    30000,
  );
  it("releases only unstarted slots on known preflight failure, never replenishing charged usage", async () => {
    const c = await fixture(148),
      request = randomUUID(),
      conversation = randomUUID();
    await c.owner.beginCampaignQuestion(c.proof, request, conversation, true);
    await c.owner.finishCampaignQuestion(c.proof, request, conversation);
    expect(campaignBudget((await c.read()).events)).toMatchObject({
      used: 148,
      remaining: 2,
      held: 0,
    });
    await c.owner.beginCampaignQuestion(
      c.proof,
      randomUUID(),
      conversation,
      true,
    );
    expect(campaignBudget((await c.read()).events)).toMatchObject({
      used: 148,
      held: 2,
    });
  });
});
