import { afterEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  StandingOwner,
  evaluationRecoveryCheckpoint,
  type OwnerProof,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  EvaluationRecovery,
  RECOVERY_DEADLINE,
  RECOVERY_EVALUATION,
  RECOVERY_ORIGIN,
  RECOVERY_SESSION,
  RECOVERY_FILE,
  RECOVERY_COOKIE,
  checkRecoveryHistory,
  recoveryHash,
  recoveryHistoryHash,
  type RecoveryPreparation,
} from "../../src/lib/careos/evaluation-recovery";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("../../src/lib/careos/runtime", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/careos/runtime")>();
  return { ...actual, careRuntime: vi.fn() };
});
vi.mock("../../src/lib/careos/standing-runtime", () => ({
  assertStandingOwner: vi.fn(),
  standingOwnerMode: () => true,
  standingProof: vi.fn(),
  configuredOwnerOrigin: () => RECOVERY_ORIGIN,
}));
vi.mock("../../src/lib/careos/records/runtime", () => ({
  recordsRuntime: vi.fn(),
}));
vi.mock("../../src/lib/intelligence/access", () => ({
  studioEvaluationAllowed: () => true,
}));
vi.mock("../../src/lib/intelligence/customer-repository", () => ({
  getCustomerIntelligence: vi.fn(),
}));

const roots: string[] = [];
const sha = (x: string) => createHash("sha256").update(x).digest("hex");
const key = () => `customer:${randomUUID()}:north_conversation_v1`;
class FailingFiles extends PilotFiles {
  failRecovery = false;
  override async write(
    name: Parameters<PilotFiles["write"]>[0],
    value: unknown,
  ) {
    if (this.failRecovery && name === RECOVERY_FILE)
      throw Error("injected_recovery_write_failure");
    return super.write(name, value);
  }
}
async function setup() {
  await mkdir("/tmp/opencode", { recursive: true });
  const root = await mkdtemp("/tmp/opencode/evaluation-recovery-test-");
  roots.push(root);
  const files = new FailingFiles(root);
  await files.prepare();
  let now = RECOVERY_DEADLINE - 12 * 3600000;
  const release = {
    commit: "a".repeat(40),
    sourceHash: "b".repeat(64),
    buildId: "test-recovery-build",
  };
  const runtime = { release, ciReceiptHash: "c".repeat(64) };
  const recovery = new EvaluationRecovery(
    files,
    () => now,
    async () => runtime,
  );
  const owner = new StandingOwner(files, () => now, recovery);
  const agent = "original-evaluation-browser",
    oldToken = "d".repeat(64),
    recordsOwnerDigest = sha("records-v1:independent-existing-records-cookie");
  const events: OwnerState["events"] = [];
  function completed(subject: string, allocationId?: string, unknown = false) {
    // Historical charges are spaced five seconds apart and all settled before
    // the current rolling minute. Do not bypass the production rate limiter.
    const reservedAt = now - (338 - events.length / 2) * 5000 - 60000;
    events.push({
      id: randomUUID(),
      at: reservedAt,
      kind: "reserve",
      subject,
      ...(allocationId ? { allocationId } : {}),
    });
    events.push({
      id: randomUUID(),
      at: reservedAt + 1000,
      kind: unknown ? "unknown" : "completed",
      subject,
      ...(allocationId ? { allocationId } : {}),
      observation: { httpStatus: 200 },
    });
  }
  for (let i = 0; i < 274; i++) completed(`original-${i}`, undefined, i === 0);
  const state: OwnerState = {
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
      historicalJournalHash: sha("null"),
    },
    evaluation: {
      id: RECOVERY_EVALUATION,
      policyId: "",
      policyHash: "",
      approvedAt: now - 600000,
      expiresAt: RECOVERY_DEADLINE,
      sessionId: RECOVERY_SESSION,
      requestLimit: 300,
      purpose: "north-language-300",
      fastApplicationQuotaApproved: true,
      baselineEventCount: events.length,
      baselineEventHash: recoveryHash(events),
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
    events,
  };
  state.evaluation!.policyId = state.policy!.id;
  state.evaluation!.policyHash = recoveryHash(state.policy);
  for (let i = 0; i < 63; i++) completed(key(), RECOVERY_EVALUATION);
  events.push({
    id: randomUUID(),
    at: now - 1000,
    kind: "revoke-session",
    subject: RECOVERY_SESSION,
  });
  await files.write("owner-state.json", state);
  type History = {
    id: string;
    expiresAt: string;
    turns: { requestId: string; text: string }[];
  };
  const histories = new Map<string, History>(
    Array.from({ length: 15 }, (_, n): [string, History] => {
      const id = randomUUID();
      return [
        id,
        {
          id,
          expiresAt: new Date(RECOVERY_DEADLINE).toISOString(),
          turns: Array.from({ length: n === 14 ? 2 : 4 }, () => ({
            requestId: randomUUID(),
            text: "preserved fictional owned result",
          })),
        },
      ];
    }),
  );
  const input: RecoveryPreparation = {
    recordsOwnerDigest,
    checkpoint: evaluationRecoveryCheckpoint(state),
    history: [...histories.values()].map((c) => ({
      conversationId: c.id,
      turnCount: c.turns.length,
      turnsHash: recoveryHistoryHash(c.turns),
    })),
    gates: {
      release,
      ciReceiptHash: runtime.ciReceiptHash,
      securityReviewHash: "1".repeat(64),
      preservationHash: "2".repeat(64),
      preservationOwnerStateHash:
        evaluationRecoveryCheckpoint(state).ownerStateHash,
      providerEligibilityHash: "3".repeat(64),
      providerEligibilityCheckedAt: now,
      fallback: {
        release,
        evidenceHash: "4".repeat(64),
        ciReceiptHash: "5".repeat(64),
        ciRunId: 1,
        recoveryAware: true,
        startupHttpsPassed: true,
        oldCredentialDenied: true,
        injectedRecoveryLogoutPassed: true,
      },
    },
  };
  const proof: OwnerProof = {
    agent,
    origin: RECOVERY_ORIGIN,
    recordsOwnerDigest,
    channel: "records",
  };
  const read = async () => (await files.read("owner-state.json")) as OwnerState;
  const prepare = async () => owner.prepareEvaluationRecovery(input);
  const evidence = async (p = proof) => {
    const { binding } = await owner.evaluationRecoveryBinding();
    return checkRecoveryHistory(
      binding,
      p,
      async (id, digest) => {
        if (digest !== recordsOwnerDigest) throw Error("wrong_records_owner");
        return structuredClone(histories.get(id)!);
      },
      () => now,
    );
  };
  const pending = async () => {
    await prepare();
    return owner.requestEvaluationRecovery(proof, await evidence());
  };
  const approved = async () => {
    const p = await pending();
    const { bindingHash } = await owner.evaluationRecoveryBinding();
    await owner.approveEvaluationRecovery(p.id, bindingHash);
    return p;
  };
  const activate = async () => {
    const p = await approved();
    const result = await owner.finishEvaluationRecovery(
      proof,
      p.token,
      await evidence(),
    );
    return { ...proof, token: result.token };
  };
  return {
    owner,
    recovery,
    files,
    state,
    input,
    proof,
    oldToken,
    histories,
    read,
    prepare,
    evidence,
    pending,
    approved,
    activate,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
    restart: () =>
      new StandingOwner(
        files,
        () => now,
        new EvaluationRecovery(
          files,
          () => now,
          async () => runtime,
        ),
      ),
    runtime,
  };
}
/** Isolated HTTP wiring: only temporary fixtures; no actual browser/DB/provider. */
async function ownerHttp(c: Awaited<ReturnType<typeof setup>>) {
  vi.spyOn(Date, "now").mockImplementation(c.now);
  vi.stubEnv("CAREOS_STANDING_AI_ENABLED", "true");
  const values = new Map<string, string>([
    ["__Host-palcare-owner", c.oldToken],
  ]);
  let fields: Partial<OwnerProof> = { channel: undefined };
  const jar = {
    get: (name: string) =>
      values.has(name) ? { name, value: values.get(name)! } : undefined,
    set: vi.fn((name: string, value: string) => {
      values.set(name, value);
    }),
  };
  const { cookies } = await import("next/headers");
  vi.mocked(cookies).mockResolvedValue(
    jar as unknown as Awaited<ReturnType<typeof cookies>>,
  );
  const { standingProof } =
    await import("../../src/lib/careos/standing-runtime");
  vi.mocked(standingProof).mockImplementation(async () => ({
    ...c.proof,
    ...fields,
    token: values.get("__Host-palcare-owner"),
  }));
  const binding = c.owner.evaluationRecoveryBinding.bind(c.owner);
  const request = c.owner.requestEvaluationRecovery.bind(c.owner);
  const finish = c.owner.finishEvaluationRecovery.bind(c.owner);
  const logout = c.owner.logout.bind(c.owner);
  const status = c.owner.status.bind(c.owner);
  vi.spyOn(StandingOwner.prototype, "assertOriginApproval").mockResolvedValue();
  vi.spyOn(
    StandingOwner.prototype,
    "evaluationRecoveryBinding",
  ).mockImplementation(binding);
  vi.spyOn(
    StandingOwner.prototype,
    "requestEvaluationRecovery",
  ).mockImplementation(request);
  vi.spyOn(
    StandingOwner.prototype,
    "finishEvaluationRecovery",
  ).mockImplementation(finish);
  vi.spyOn(StandingOwner.prototype, "logout").mockImplementation(logout);
  vi.spyOn(StandingOwner.prototype, "status").mockImplementation(status);
  const { recordsRuntime } =
    await import("../../src/lib/careos/records/runtime");
  const get = vi.fn(async (id: string, owner: string) => {
    await expect(
      access(`${c.files.directory}/.owner-access-lock`),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(owner).toBe(c.proof.recordsOwnerDigest);
    return structuredClone(c.histories.get(id)!);
  });
  vi.mocked(recordsRuntime).mockReturnValue({
    origin: RECOVERY_ORIGIN,
    store: { get } as unknown as ReturnType<typeof recordsRuntime>["store"],
  });
  const provider = await import("../../src/lib/careos/subscription/provider");
  vi.spyOn(provider, "subscriptionFiles").mockReturnValue(
    new PilotFiles(c.files.directory),
  );
  const route = await import("../../src/app/api/ai/owner/route");
  const headers = {
    host: new URL(RECOVERY_ORIGIN).host,
    origin: RECOVERY_ORIGIN,
    "user-agent": c.proof.agent,
    "content-type": "application/json",
  };
  return {
    values,
    jar,
    setProof: (value: Partial<OwnerProof>) => {
      fields = value;
    },
    post: (body: unknown) =>
      route.POST(
        new Request(`${RECOVERY_ORIGIN}/api/ai/owner`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      ),
    get: () =>
      route.GET(new Request(`${RECOVERY_ORIGIN}/api/ai/owner`, { headers })),
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("exact campaign recovery, isolated fake evidence only; no live authority/provider/database", () => {
  it("issues a different one-use credential for the SAME identity while old token/revocation/prefix/history remain unchanged", async () => {
    const c = await setup(),
      before = await c.read(),
      proof = await c.activate();
    expect(proof.token).not.toBe(c.oldToken);
    expect(await c.owner.authenticate(proof)).toBe(RECOVERY_SESSION);
    expect(await c.owner.status(proof)).toMatchObject({
      browserAccess: "recovery-active",
      originalBrowserRevoked: true,
      recoveryActive: true,
      used: 63,
      remaining: 237,
      maxRetries: 0,
      concurrency: 1,
      evaluation: { id: RECOVERY_EVALUATION, browserBound: true },
    });
    expect(await c.owner.evaluationQuotaAccess(proof, true)).toBe(true);
    expect(await c.read()).toEqual(before);
    await expect(
      c.owner.authenticate({ ...proof, token: c.oldToken }),
    ).rejects.toThrow("signin_required");
    const subject = key();
    await c.owner.reserve(proof, "customer", subject, true);
    await c.owner.settle(subject, "completed", { httpStatus: 200 });
    const after = await c.read();
    expect(after.sessions).toEqual(before.sessions);
    expect(after.policy).toEqual(before.policy);
    expect(after.evaluation).toEqual(before.evaluation);
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect(
      after.events
        .slice(-2)
        .every((e) => e.allocationId === RECOVERY_EVALUATION),
    ).toBe(true);
    expect(await c.owner.status(proof)).toMatchObject({
      used: 64,
      remaining: 236,
      standingAllocation: { used: 274, remaining: 26 },
      unknown: 1,
    });
    expect(await c.restart().evaluationRecoveryStatus()).toMatchObject({
      active: true,
      sessionId: RECOVERY_SESSION,
      baselineUsed: 63,
      maxAdditional: 237,
      remaining: 236,
      activationSequence: 1,
    });
  });
  it("does not use the revoked AI cookie for challenge identity or authority", async () => {
    const c = await setup();
    await c.prepare();
    const old = { ...c.proof, token: c.oldToken };
    await expect(
      c.owner.requestEvaluationRecovery(
        { ...old, recordsOwnerDigest: undefined },
        await c.evidence(),
      ),
    ).rejects.toThrow();
    const p = await c.owner.requestEvaluationRecovery(old, await c.evidence());
    expect(p.token).not.toBe(c.oldToken);
    expect((await c.read()).sessions).toEqual(c.state.sessions);
  });
  it.each(["records", "agent", "origin", "channel", "old-token"])(
    "denies recovered dispatch with wrong %s",
    async (field) => {
      const c = await setup(),
        proof = await c.activate(),
        bad = { ...proof };
      if (field === "records") bad.recordsOwnerDigest = "0".repeat(64);
      if (field === "agent") bad.agent = "other-agent";
      if (field === "origin") bad.origin = "https://elsewhere.invalid";
      if (field === "channel") bad.channel = undefined;
      if (field === "old-token") bad.token = c.oldToken;
      const before = await c.read();
      await expect(
        c.owner.reserve(bad, "customer", key(), true),
      ).rejects.toThrow();
      expect(await c.read()).toEqual(before);
    },
  );
  it("denies Studio before all GET/start/claim/clear DB work; does not alias the old token namespace", async () => {
    vi.stubEnv("CAREOS_PROVIDER", "subscription");
    const c = await setup(),
      proof = await c.activate();
    await expect(
      c.owner.authenticate(proof, "customer-studio"),
    ).rejects.toThrow("scope_denied");
    await expect(
      c.owner.assertDispatch(proof, "customer-studio", true),
    ).rejects.toThrow();
    const { PostgresStore } =
      await import("../../src/lib/careos/postgres-store");
    const store = new PostgresStore(
      {} as ConstructorParameters<typeof PostgresStore>[0],
    );
    const methods = ["create", "get", "claim", "clear"] as const;
    const calls = methods.map((m) => vi.spyOn(store, m));
    const { careRuntime } = await import("../../src/lib/careos/runtime");
    vi.mocked(careRuntime).mockReturnValue({
      store,
      origin: RECOVERY_ORIGIN,
      config: { mode: "subscription" } as ReturnType<
        typeof careRuntime
      >["config"],
    });
    vi.mocked(careRuntime).mockClear();
    const { assertStandingOwner } =
      await import("../../src/lib/careos/standing-runtime");
    vi.mocked(assertStandingOwner).mockImplementation(
      async (_channel, scope) => {
        await c.owner.authenticate(proof, scope);
        return proof;
      },
    );
    const route =
      await import("../../src/app/api/intelligence/customer/plan/route");
    const init = {
      headers: {
        host: new URL(RECOVERY_ORIGIN).host,
        origin: RECOVERY_ORIGIN,
        "content-type": "application/json",
      },
    };
    const url = `${RECOVERY_ORIGIN}/api/intelligence/customer/plan?conversationId=${randomUUID()}`;
    expect((await route.GET(new Request(url, init))).status).toBe(403);
    expect(
      (
        await route.POST(
          new Request(url, {
            ...init,
            method: "POST",
            body: JSON.stringify({ action: "start" }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await route.DELETE(new Request(url, { ...init, method: "DELETE" })))
        .status,
    ).toBe(403);
    for (const spy of calls) expect(spy).not.toHaveBeenCalled();
    expect(careRuntime).not.toHaveBeenCalled();
  });
  it("rejects legacy Care create/read/turn/delete before any conversation DB work while read-only owner status still recognizes recovery", async () => {
    const c = await setup(),
      proof = await c.activate();
    await expect(
      c.owner.authenticate({ ...proof, channel: undefined }),
    ).rejects.toThrow("scope_denied");
    expect(
      await c.owner.status({ ...proof, channel: undefined }),
    ).toMatchObject({
      remembered: true,
      browserCompletion: "complete",
      recoveryActive: true,
    });
    const { PostgresStore } =
      await import("../../src/lib/careos/postgres-store");
    const store = new PostgresStore(
      {} as ConstructorParameters<typeof PostgresStore>[0],
    );
    const calls = (["create", "get", "claim", "clear", "finish"] as const).map(
      (m) => vi.spyOn(store, m),
    );
    const { careRuntime, assertCustomerRuntimeAccess } =
      await import("../../src/lib/careos/runtime");
    vi.mocked(careRuntime).mockReturnValue({
      store,
      origin: RECOVERY_ORIGIN,
      config: { mode: "subscription" } as ReturnType<
        typeof careRuntime
      >["config"],
    });
    const { assertStandingOwner } =
      await import("../../src/lib/careos/standing-runtime");
    vi.mocked(assertStandingOwner).mockImplementation(
      async (channel, scope) => {
        const p = { ...proof, channel };
        await c.owner.authenticate(p, scope);
        return p;
      },
    );
    const create = await import("../../src/app/api/careos/conversations/route");
    const detail =
      await import("../../src/app/api/careos/conversations/[id]/route");
    const turn =
      await import("../../src/app/api/careos/conversations/[id]/turns/route");
    const id = randomUUID(),
      params = { params: Promise.resolve({ id }) };
    const headers = {
      host: new URL(RECOVERY_ORIGIN).host,
      origin: RECOVERY_ORIGIN,
      "content-type": "application/json",
    };
    const request = (method: string, body?: unknown) =>
      new Request(`${RECOVERY_ORIGIN}/api/careos/conversations/${id}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    expect((await create.POST(request("POST", {}))).status).toBe(403);
    expect((await detail.GET(request("GET"), params)).status).toBe(403);
    expect(
      (
        await turn.POST(
          request("POST", {
            requestId: randomUUID(),
            twinId: null,
            revision: 0,
            message: "legacy care",
          }),
          params,
        )
      ).status,
    ).toBe(403);
    expect((await detail.DELETE(request("DELETE"), params)).status).toBe(403);
    for (const spy of calls) expect(spy).not.toHaveBeenCalled();
    await expect(
      assertCustomerRuntimeAccess(careRuntime().config, "records"),
    ).resolves.toBeUndefined();
  });
  it.each(["pending", "approved"] as const)(
    "HTTP logout cancels %s with the challenge despite invalid AI proof and changed UA",
    async (phase) => {
      const c = await setup(),
        p = phase === "pending" ? await c.pending() : await c.approved(),
        evidence = await c.evidence();
      const h = await ownerHttp(c);
      h.values.set(RECOVERY_COOKIE, p.token);
      h.setProof({
        agent: "changed-agent",
        recordsOwnerDigest: undefined,
        channel: undefined,
      });
      const before = await c.read();
      expect((await h.post({ action: "logout" })).status).toBe(200);
      expect(h.values.get(RECOVERY_COOKIE)).toBe("");
      expect(h.values.get("__Host-palcare-owner")).toBe("");
      expect((await c.read()).events.at(-1)).toMatchObject({
        kind: "logout",
        subject: RECOVERY_SESSION,
      });
      expect((await c.read()).sessions).toEqual(before.sessions);
      expect((await c.recovery.read())?.phase).toBe("disabled");
      expect(
        (await h.post({ action: "evaluation-recovery-finish" })).status,
      ).toBe(403);
      vi.restoreAllMocks();
      await expect(
        c.restart().finishEvaluationRecovery(c.proof, p.token, evidence),
      ).rejects.toThrow();
    },
  );
  it("issued-secret logout still cancels after UA changes and records cookie disappears; owner GET itself remains non-dispatching", async () => {
    const c = await setup(),
      proof = await c.activate(),
      h = await ownerHttp(c);
    h.values.set("__Host-palcare-owner", proof.token);
    expect(await (await h.get()).json()).toMatchObject({
      remembered: true,
      browserCompletion: "complete",
      recoveryActive: true,
    });
    h.setProof({
      agent: "changed-agent",
      recordsOwnerDigest: undefined,
      channel: undefined,
    });
    expect((await h.post({ action: "logout" })).status).toBe(200);
    vi.restoreAllMocks();
    await expect(c.restart().authenticate(proof)).rejects.toThrow();
    expect((await c.read()).events.at(-1)?.kind).toBe("logout");
  });
  it("exact records-identity cancellation works without any AI/challenge secret; another records visitor cannot cancel", async () => {
    const c = await setup(),
      p = await c.approved(),
      h = await ownerHttp(c),
      before = await c.read();
    h.values.set(RECOVERY_COOKIE, "e".repeat(64));
    h.setProof({
      agent: "other",
      recordsOwnerDigest: "f".repeat(64),
      channel: undefined,
    });
    expect((await h.post({ action: "logout" })).status).toBe(200);
    expect(await c.read()).toEqual(before);
    expect((await c.recovery.read())?.phase).toBe("approved");
    h.setProof({
      agent: "changed",
      recordsOwnerDigest: c.proof.recordsOwnerDigest,
      channel: undefined,
    });
    expect((await h.post({ action: "logout" })).status).toBe(200);
    vi.restoreAllMocks();
    await expect(
      c.restart().finishEvaluationRecovery(c.proof, p.token, {
        bindingHash: (await c.recovery.read())!.approval!.bindingHash,
        recordsOwnerDigest: c.proof.recordsOwnerDigest!,
        checkedAt: c.now(),
      }),
    ).rejects.toThrow();
  });
  it.each(["expired", "provider-denied"])(
    "HTTP cancellation is independent of inference eligibility: %s",
    async (reason) => {
      const c = await setup(),
        p = await c.approved();
      if (reason === "expired") c.advance(RECOVERY_DEADLINE - c.now());
      else await c.owner.blockProvider();
      const h = await ownerHttp(c);
      h.values.set(RECOVERY_COOKIE, p.token);
      h.setProof({
        recordsOwnerDigest: undefined,
        agent: "changed",
        channel: undefined,
      });
      expect((await h.post({ action: "logout" })).status).toBe(200);
      expect((await c.read()).events.at(-1)).toMatchObject({
        kind: "logout",
        subject: RECOVERY_SESSION,
      });
      vi.restoreAllMocks();
      expect((await c.restart().evaluationRecoveryStatus()).active).toBe(false);
    },
  );
  it("HTTP cancellation failure still commits journal cutoff before cap-write failure and clears both cookies", async () => {
    const c = await setup(),
      p = await c.approved(),
      evidence = await c.evidence(),
      h = await ownerHttp(c);
    h.values.set(RECOVERY_COOKIE, p.token);
    h.setProof({
      recordsOwnerDigest: undefined,
      agent: "changed",
      channel: undefined,
    });
    c.files.failRecovery = true;
    expect((await h.post({ action: "logout" })).status).toBeGreaterThanOrEqual(
      500,
    );
    expect((await c.recovery.read())?.phase).toBe("approved");
    expect((await c.read()).events.at(-1)).toMatchObject({
      kind: "logout",
      subject: RECOVERY_SESSION,
    });
    expect(h.values.get(RECOVERY_COOKIE)).toBe("");
    expect(h.values.get("__Host-palcare-owner")).toBe("");
    vi.restoreAllMocks();
    await expect(
      c.restart().finishEvaluationRecovery(c.proof, p.token, evidence),
    ).rejects.toThrow();
  });
  it("the old revoked AI secret alone never authorizes cancellation or an upgrade", async () => {
    const c = await setup();
    await c.approved();
    const before = await c.read();
    await expect(
      c.owner.logout({
        ...c.proof,
        token: c.oldToken,
        recordsOwnerDigest: undefined,
        channel: undefined,
      }),
    ).rejects.toThrow("signin_required");
    expect(await c.read()).toEqual(before);
    expect((await c.recovery.read())?.phase).toBe("approved");
  });
  it("does not cancel a bound grant from a different origin even with its challenge", async () => {
    const c = await setup(),
      p = await c.approved(),
      before = await c.read();
    await expect(
      c.owner.logout(
        { ...c.proof, token: c.oldToken, origin: "https://attacker.invalid" },
        p.token,
      ),
    ).rejects.toThrow();
    expect(await c.read()).toEqual(before);
    expect((await c.recovery.read())?.phase).toBe("approved");
  });
  it("retains ordinary valid-session logout when the same browser also owns the bound records identity", async () => {
    const c = await setup();
    await c.activate();
    const s = await c.read(),
      token = "f".repeat(64),
      id = randomUUID();
    s.sessions.push({
      ...s.sessions[0],
      id,
      tokenHash: sha(token),
      revoked: false,
    });
    await c.files.write("owner-state.json", s);
    await c.owner.logout({ ...c.proof, token, channel: undefined });
    const after = await c.read();
    expect(after.sessions.find((x) => x.id === id)?.revoked).toBe(true);
    expect(after.events.slice(-2).map((x) => x.subject)).toEqual([
      RECOVERY_SESSION,
      id,
    ]);
    expect((await c.recovery.read())?.phase).toBe("disabled");
  });
  it("records-bound cancellation is idempotent and cannot fill the shared journal", async () => {
    const c = await setup();
    await c.approved();
    const proof = { ...c.proof, token: c.oldToken, channel: undefined };
    const before = await c.read();
    await c.owner.logout(proof);
    const after = await c.read();
    expect(after.events.length).toBe(before.events.length + 1);
    await c.owner.logout(proof);
    expect(await c.read()).toEqual(after);
  });
  it("verifies every host-fixed owned conversation prefix outside the owner lock, rejecting forged/missing/expired/changed history", async () => {
    const c = await setup();
    await c.prepare();
    const { binding } = await c.owner.evaluationRecoveryBinding();
    const load = vi.fn(async (id: string) =>
      structuredClone(c.histories.get(id)!),
    );
    await checkRecoveryHistory(binding, c.proof, load, c.now);
    expect(load).toHaveBeenCalledTimes(15);
    await expect(
      checkRecoveryHistory(
        binding,
        { ...c.proof, recordsOwnerDigest: "0".repeat(64) },
        load,
        c.now,
      ),
    ).rejects.toThrow();
    const first = c.histories.values().next().value!;
    const original = structuredClone(first);
    first.turns[0].text = "changed old result";
    await expect(c.evidence()).rejects.toThrow();
    Object.assign(first, original);
    first.expiresAt = new Date(c.now()).toISOString();
    await expect(c.evidence()).rejects.toThrow();
    first.expiresAt = original.expiresAt;
    first.turns.pop();
    await expect(c.evidence()).rejects.toThrow();
  });
  it.each([
    "prefix",
    "session",
    "policy",
    "evaluation",
    "unsettled",
    "original-new-reserve",
  ])("denies changed %s after preparation", async (kind) => {
    const c = await setup();
    await c.prepare();
    const evidence = await c.evidence();
    const s = await c.read();
    if (kind === "prefix") s.events[0].subject = "changed";
    if (kind === "session") s.sessions[0].tokenHash = "e".repeat(64);
    if (kind === "policy") s.policy!.requestsPerMinute = 29;
    if (kind === "evaluation") s.evaluation!.baselineEventHash = "e".repeat(64);
    if (kind === "unsettled" || kind === "original-new-reserve")
      s.events.push({
        id: randomUUID(),
        at: c.now(),
        kind: "reserve",
        subject: key(),
        ...(kind === "unsettled" ? { allocationId: RECOVERY_EVALUATION } : {}),
      });
    await c.files.write("owner-state.json", s);
    await expect(
      c.owner.requestEvaluationRecovery(c.proof, evidence),
    ).rejects.toThrow();
  });
  it("requires exact complete63 baseline, never smaller counts, stale history proof or a mismatched release", async () => {
    const c = await setup();
    const s = await c.read();
    s.events.splice(s.events.length - 3, 2);
    await c.files.write("owner-state.json", s);
    await expect(c.prepare()).rejects.toThrow();
    const d = await setup();
    await d.prepare();
    const evidence = await d.evidence();
    d.advance(10001);
    await expect(
      d.owner.requestEvaluationRecovery(d.proof, evidence),
    ).rejects.toThrow();
    const e = await setup();
    await e.prepare();
    e.runtime.release = { ...e.runtime.release, sourceHash: "f".repeat(64) };
    await expect(e.owner.evaluationRecoveryBinding()).rejects.toThrow();
    const f = await setup(),
      later = await f.read();
    later.events.push({
      id: randomUUID(),
      at: f.now(),
      kind: "revoke-session",
      subject: RECOVERY_SESSION,
    });
    await f.files.write("owner-state.json", later);
    f.input.gates.preservationOwnerStateHash = recoveryHash(later);
    await expect(f.prepare()).rejects.toThrow(); // Preserved checkpoint cannot be redefined by a fresh receipt.
  });
  it("persists consumption before response and rejects two finishes, replay and lost Set-Cookie replacement", async () => {
    const c = await setup(),
      p = await c.approved(),
      evidence = await c.evidence();
    const outcomes = await Promise.allSettled([
      c.owner.finishEvaluationRecovery(c.proof, p.token, evidence),
      c.owner.finishEvaluationRecovery(c.proof, p.token, evidence),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const issued = outcomes.find((x) => x.status === "fulfilled");
    if (issued?.status !== "fulfilled")
      throw Error("missing issued credential");
    expect(issued.value.token).not.toBe(p.token);
    expect(JSON.stringify(await c.recovery.read())).not.toContain(p.token);
    expect(JSON.stringify(await c.recovery.read())).not.toContain(
      issued.value.token,
    );
    await expect(
      c.owner.authenticate({ ...c.proof, token: p.token }),
    ).rejects.toThrow();
    expect((await c.recovery.read())?.phase).toBe("active");
    await expect(
      c.owner.finishEvaluationRecovery(c.proof, p.token, evidence),
    ).rejects.toThrow();
    await expect(
      c.owner.requestEvaluationRecovery(c.proof, evidence),
    ).rejects.toThrow();
    await expect(
      c.owner.approveEvaluationRecovery(p.id, evidence.bindingHash),
    ).rejects.toThrow();
    expect((await c.read()).sessions).toEqual(c.state.sessions);
  });
  it("HTTP ignores old AI proof, loads fixed histories without owner lock, and fails closed if Set-Cookie response is lost", async () => {
    const c = await setup();
    await c.prepare();
    vi.spyOn(Date, "now").mockImplementation(c.now);
    vi.stubEnv("CAREOS_STANDING_AI_ENABLED", "true");
    const values = new Map<string, string>([
      ["__Host-palcare-owner", c.oldToken],
    ]);
    let loseCookie = false;
    const jar = {
      get: (name: string) =>
        values.has(name) ? { name, value: values.get(name)! } : undefined,
      set: vi.fn((name: string, value: string) => {
        if (loseCookie && name === "__Host-palcare-owner")
          throw Error("lost Set-Cookie");
        values.set(name, value);
      }),
    };
    const { cookies } = await import("next/headers");
    vi.mocked(cookies).mockResolvedValue(
      jar as unknown as Awaited<ReturnType<typeof cookies>>,
    );
    const { standingProof } =
      await import("../../src/lib/careos/standing-runtime");
    vi.mocked(standingProof).mockImplementation(async () => ({
      ...c.proof,
      token: values.get("__Host-palcare-owner"),
    }));
    const binding = c.owner.evaluationRecoveryBinding.bind(c.owner);
    const request = c.owner.requestEvaluationRecovery.bind(c.owner);
    const finish = c.owner.finishEvaluationRecovery.bind(c.owner);
    vi.spyOn(
      StandingOwner.prototype,
      "assertOriginApproval",
    ).mockResolvedValue();
    vi.spyOn(
      StandingOwner.prototype,
      "evaluationRecoveryBinding",
    ).mockImplementation(binding);
    const requestSpy = vi
      .spyOn(StandingOwner.prototype, "requestEvaluationRecovery")
      .mockImplementation(request);
    vi.spyOn(
      StandingOwner.prototype,
      "finishEvaluationRecovery",
    ).mockImplementation(finish);
    const { recordsRuntime } =
      await import("../../src/lib/careos/records/runtime");
    const get = vi.fn(async (id: string, owner: string) => {
      await expect(
        access(`${c.files.directory}/.owner-access-lock`),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(owner).toBe(c.proof.recordsOwnerDigest);
      return structuredClone(c.histories.get(id)!);
    });
    vi.mocked(recordsRuntime).mockReturnValue({
      origin: RECOVERY_ORIGIN,
      store: { get } as unknown as ReturnType<typeof recordsRuntime>["store"],
    });
    const route = await import("../../src/app/api/ai/owner/route");
    const post = (body: unknown) =>
      route.POST(
        new Request(`${RECOVERY_ORIGIN}/api/ai/owner`, {
          method: "POST",
          headers: {
            host: new URL(RECOVERY_ORIGIN).host,
            origin: RECOVERY_ORIGIN,
            "user-agent": c.proof.agent,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    expect(
      (
        await post({
          action: "evaluation-recovery-request",
          sessionId: RECOVERY_SESSION,
        })
      ).status,
    ).toBe(400);
    expect(requestSpy).not.toHaveBeenCalled();
    const pending = await post({ action: "evaluation-recovery-request" });
    expect(pending.status).toBe(200);
    const json = await pending.json();
    expect(Object.keys(json)).toEqual(["id"]);
    expect(requestSpy.mock.calls[0][0].token).toBeUndefined();
    const challenge = values.get(RECOVERY_COOKIE)!;
    expect(challenge).toHaveLength(64);
    expect(JSON.stringify(json)).not.toContain(challenge);
    const approved = await binding();
    await c.owner.approveEvaluationRecovery(json.id, approved.bindingHash);
    loseCookie = true;
    const failed = await post({ action: "evaluation-recovery-finish" });
    expect(failed.status).toBeGreaterThanOrEqual(400);
    const saved = await c.recovery.read();
    expect(saved?.phase).toBe("active");
    expect(saved?.activation?.tokenHash).not.toBe(sha(challenge));
    expect(saved?.activation?.tokenHash).not.toBe(sha(c.oldToken));
    expect(JSON.stringify(saved)).not.toContain(challenge);
    expect(values.get(RECOVERY_COOKIE)).toBe("");
    expect((await post({ action: "evaluation-recovery-finish" })).status).toBe(
      403,
    );
    expect(saved?.activation?.tokenHash).toBe(
      (await c.recovery.read())?.activation?.tokenHash,
    );
    expect(get).toHaveBeenCalledTimes(45); // request, lost finish, rejected replay: fixed reads only.
    expect((await c.read()).sessions).toEqual(c.state.sessions);
  });
  it.each(["challenge", "deadline"])(
    "denies at the exact %s boundary without renewal",
    async (which) => {
      const c = await setup(),
        p = await c.approved();
      c.advance(which === "challenge" ? 300000 : RECOVERY_DEADLINE - c.now());
      await expect(
        c.owner.finishEvaluationRecovery(c.proof, p.token, {
          bindingHash: (await c.recovery.read())!.approval!.bindingHash,
          recordsOwnerDigest: c.proof.recordsOwnerDigest!,
          checkedAt: c.now(),
        }),
      ).rejects.toThrow();
      await expect(c.prepare()).rejects.toThrow();
    },
  );
  it.each(["revoke", "logout", "provider", "policy"])(
    "durably denies after %s even if recovery-file disable fails, including restart",
    async (which) => {
      const c = await setup(),
        proof = await c.activate();
      c.files.failRecovery = true;
      const action =
        which === "revoke"
          ? c.owner.revokeSession(RECOVERY_SESSION)
          : which === "logout"
            ? c.owner.logout(proof)
            : which === "provider"
              ? c.owner.blockProvider()
              : c.owner.revokePolicy(proof);
      await expect(action).rejects.toThrow("injected_recovery_write_failure");
      expect((await c.recovery.read())?.phase).toBe("active");
      expect((await c.read()).events.at(-1)?.kind).toBe(
        which === "revoke"
          ? "revoke-session"
          : which === "provider"
            ? "provider-block"
            : which === "policy"
              ? "revoke-policy"
              : "logout",
      );
      await expect(
        c.restart().reserve(proof, "customer", key(), true),
      ).rejects.toThrow();
      expect((await c.restart().evaluationRecoveryStatus()).active).toBe(false);
    },
  );
  it("old fallback journal revocation is sufficient even without updating the new recovery file", async () => {
    const c = await setup(),
      proof = await c.activate(),
      s = await c.read();
    s.events.push({
      id: randomUUID(),
      at: c.now(),
      kind: "revoke-session",
      subject: RECOVERY_SESSION,
    });
    await c.files.write("owner-state.json", s);
    await expect(c.restart().authenticate(proof)).rejects.toThrow();
  });
  it("revokes while an inference is pending; never uses provider-lock nesting", async () => {
    const c = await setup(),
      proof = await c.activate();
    const subject = key();
    await c.owner.reserve(proof, "customer", subject, true);
    await c.owner.logout(proof);
    await c.owner.settle(subject, "completed", { httpStatus: 200 });
    await expect(
      c.owner.assertDispatch(proof, "customer", true),
    ).rejects.toThrow();
  });
  it("serializes admission, stops on unknown and does not erase historical unknown or spend original slots", async () => {
    const c = await setup(),
      proof = await c.activate(),
      subject = key();
    await c.owner.reserve(proof, "customer", subject, true);
    await expect(
      c.owner.reserve(proof, "customer", key(), true),
    ).rejects.toThrow();
    await c.owner.settle(subject, "unknown");
    await expect(
      c.owner.reserve(proof, "customer", key(), true),
    ).rejects.toThrow();
    const s = await c.read();
    expect(
      s.events.filter((e) => e.kind === "reserve" && !e.allocationId),
    ).toHaveLength(274);
    expect(s.events.filter((e) => e.kind === "unknown")).toHaveLength(2);
  });
  it("retains the real rolling-minute limit for recovered reservations", async () => {
    const c = await setup(),
      proof = await c.activate(),
      s = await c.read();
    for (let n = 0; n < 30; n++) {
      const subject = key();
      s.events.push(
        {
          id: randomUUID(),
          at: c.now() - 1000,
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
    await expect(
      c.owner.reserve(proof, "customer", key(), true),
    ).rejects.toThrow("rate_limited");
    expect(await c.read()).toEqual(s);
    c.advance(60000);
    const subject = key();
    await c.owner.reserve(proof, "customer", subject, true);
    expect((await c.read()).events.at(-1)?.allocationId).toBe(
      RECOVERY_EVALUATION,
    );
  });
  it("at300 cannot fall back to the separate remaining26", async () => {
    const c = await setup(),
      proof = await c.activate(),
      s = await c.read();
    for (let n = 0; n < 237; n++) {
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
    await expect(
      c.owner.reserve(proof, "customer", key(), true),
    ).rejects.toThrow();
    expect(await c.owner.evaluationRecoveryStatus()).toMatchObject({
      active: false,
      remaining: 0,
    });
    expect(
      (await c.read()).events.filter(
        (e) => e.kind === "reserve" && !e.allocationId,
      ),
    ).toHaveLength(274);
  });
  it("fails closed on malformed/partial files and failed activation write, never issues a token", async () => {
    const c = await setup(),
      p = await c.approved(),
      evidence = await c.evidence();
    c.files.failRecovery = true;
    await expect(
      c.owner.finishEvaluationRecovery(c.proof, p.token, evidence),
    ).rejects.toThrow();
    expect((await c.recovery.read())?.phase).toBe("approved");
    c.files.failRecovery = false;
    await writeFile(
      `${c.files.directory}/${RECOVERY_FILE}`,
      '{"version":1,"phase":"active"}',
      { mode: 0o600 },
    );
    await expect(
      c.owner.authenticate({ ...c.proof, token: "e".repeat(64) }),
    ).rejects.toThrow();
    expect((await c.owner.evaluationRecoveryStatus()).active).toBe(false);
  });
  it("terminal disable survives restart, cannot prepare/approve again, and fallback must stop on failed disable", async () => {
    const c = await setup(),
      proof = await c.activate();
    c.files.failRecovery = true;
    await expect(c.owner.disableEvaluationRecovery()).rejects.toThrow();
    c.files.failRecovery = false;
    await c.owner.disableEvaluationRecovery("fallback-before-switch");
    await expect(c.restart().authenticate(proof)).rejects.toThrow();
    expect(await c.restart().status(proof)).toMatchObject({
      recoveryActive: false,
      originalBrowserRevoked: true,
      requestLimit: 300,
      used: 63,
      remaining: 237,
      standingAllocation: { used: 274, remaining: 26 },
    });
    await expect(
      c.restart().prepareEvaluationRecovery(c.input),
    ).rejects.toThrow();
    expect((await c.recovery.read())?.audit.at(-1)?.action).toBe("disable");
  });
});
