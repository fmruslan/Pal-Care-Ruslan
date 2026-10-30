import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  StandingOwner,
  OWNER_IDLE,
  OWNER_MAX_AGE,
  OWNER_ORIGIN,
  assertOwnerRequest,
} from "../../src/lib/careos/standing-owner";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import { standingStructured } from "../../src/lib/careos/subscription/standing";
import { accessToken } from "../../src/lib/careos/subscription/auth";
import { z } from "zod";

const roots: string[] = [];
async function setup(limit = 5) {
  await mkdir("/tmp/opencode", { recursive: true });
  const directory = await mkdtemp("/tmp/opencode/palcare-standing-test-");
  roots.push(directory);
  const files = new PilotFiles(directory);
  let now = Date.now();
  const owner = new StandingOwner(files, () => now);
  const pair = await owner.pair("test-browser");
  const proof = { token: pair.token, agent: "test-browser" };
  const policy = {
    id: randomUUID(),
    approvedAt: now,
    provider: "chatgpt-subscription",
    model: "gpt-6.1-sol",
    reasoning: "medium",
    origin: OWNER_ORIGIN,
    scopes: ["customer", "customer-studio"],
    requestLimit: limit,
    concurrency: 1,
    requestsPerMinute: 10,
    creditsDisabledConfirmed: true,
    providerPermissionConfirmed: true,
    historicalJournalHash: createHash("sha256").update("null").digest("hex"),
  };
  await owner.approve(pair.id);
  return {
    files,
    owner,
    proof,
    pair,
    policy,
    advance: (ms: number) => (now += ms),
  };
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("remembered private owner and independent standing permission (no live provider)", () => {
  it("atomically rejects simultaneous reservations beyond the remaining total even with four slots", async () => {
    const { owner, files, proof, policy } = await setup(3);
    await owner.installPolicy({
      ...policy,
      concurrency: 4,
      requestsPerMinute: 30,
      maxRetries: 1,
    });
    const outcomes = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        new StandingOwner(files).reserve(
          proof,
          "customer",
          `parallel-${i}`,
          true,
        ),
      ),
    );
    expect(outcomes.filter((v) => v.status === "fulfilled")).toHaveLength(3);
    expect(await owner.status(proof)).toMatchObject({ used: 3, remaining: 0 });
  });
  it("enforces the approved rolling 30/minute independently of the 300 total cap", async () => {
    const { owner, proof, policy, advance } = await setup(300);
    await owner.installPolicy({
      ...policy,
      concurrency: 4,
      requestsPerMinute: 30,
      maxRetries: 1,
    });
    for (let i = 0; i < 30; i++) {
      await owner.reserve(proof, "customer", `rate-${i}`, true);
      await owner.settle(`rate-${i}`, "completed");
    }
    await expect(
      owner.reserve(proof, "customer", "rate-30", true),
    ).rejects.toThrow("rate_limited");
    advance(60001);
    await owner.reserve(proof, "customer", "rate-30", true);
    expect(await owner.status(proof)).toMatchObject({
      used: 31,
      remaining: 269,
    });
  });
  it("remembers a browser after reconstruction but does not authorize AI", async () => {
    const { owner, files, proof } = await setup();
    expect(await new StandingOwner(files).authenticate(proof)).toBeTruthy();
    await expect(owner.assertDispatch(proof, "customer", true)).rejects.toThrow(
      "ai_disabled",
    );
    const raw = await readFile(`${files.directory}/owner-state.json`, "utf8");
    expect(raw).not.toContain(proof.token);
  });
  it("rejects a copied token with a different browser binding and a public request ID", async () => {
    const { owner, proof, pair } = await setup();
    await expect(
      owner.authenticate({ ...proof, agent: "different" }),
    ).rejects.toThrow("signin_required");
    await expect(
      owner.authenticate({ ...proof, token: pair.id }),
    ).rejects.toThrow("signin_required");
  });
  it("requires explicit approval within five minutes; approval is single-use", async () => {
    const { owner, advance } = await setup();
    const pair = await owner.pair("other");
    await expect(
      owner.authenticate({ token: pair.token, agent: "other" }),
    ).rejects.toThrow("signin_required");
    advance(300000);
    await expect(owner.approve(pair.id)).rejects.toThrow("pair_expired");
  });
  it("cannot approve the same browser twice", async () => {
    const { owner, pair } = await setup();
    await expect(owner.approve(pair.id)).rejects.toThrow("pair_expired");
  });
  it("expires inactive sessions at the exact boundary", async () => {
    const { owner, proof, advance } = await setup();
    advance(OWNER_IDLE);
    await expect(owner.authenticate(proof)).rejects.toThrow("signin_required");
  });
  it("never slides absolute lifetime even with daily use", async () => {
    const { owner, proof, advance } = await setup();
    for (let day = 0; day < 29; day++) {
      advance(86400000);
      await owner.authenticate(proof);
    }
    advance(OWNER_MAX_AGE - 29 * 86400000);
    await expect(owner.authenticate(proof)).rejects.toThrow("signin_required");
  });
  it.each(["logout", "revoke"])(
    "denies a logged-out/revoked cookie: %s",
    async (action) => {
      const { owner, proof, pair } = await setup();
      if (action === "logout") await owner.logout(proof);
      else await owner.revokeSession(pair.id);
      await expect(owner.authenticate(proof)).rejects.toThrow(
        "signin_required",
      );
    },
  );
  it("requires both immutable approval and enabled runtime; policy revocation wins", async () => {
    const { owner, proof, policy } = await setup();
    await owner.installPolicy(policy);
    await expect(owner.installPolicy(policy)).rejects.toThrow(
      "policy_already_set",
    );
    await expect(
      owner.assertDispatch(proof, "customer", false),
    ).rejects.toThrow("ai_disabled");
    await owner.assertDispatch(proof, "customer", true);
    await owner.revokePolicy(proof);
    await expect(owner.assertDispatch(proof, "customer", true)).rejects.toThrow(
      "ai_disabled",
    );
  });
  it("rejects merchant scope and unsupported providers or paid credits", async () => {
    const { owner, policy } = await setup();
    for (const value of [
      { ...policy, scopes: ["studio"] },
      { ...policy, provider: "paid-api" },
      { ...policy, creditsDisabledConfirmed: false },
    ])
      await expect(owner.installPolicy(value)).rejects.toThrow();
  });
  it("charges unknown/failed outcomes permanently and preserves the event prefix", async () => {
    const { owner, files, proof, policy } = await setup(2);
    await owner.installPolicy(policy);
    await owner.reserve(proof, "customer", "a", true);
    const before = (await files.read("owner-state.json")) as {
      events: unknown[];
    };
    await owner.settle("a", "unknown");
    await owner.reserve(proof, "customer-studio", "b", true);
    await owner.settle("b", "failed");
    await expect(owner.reserve(proof, "customer", "c", true)).rejects.toThrow(
      "quota_exhausted",
    );
    const after = (await files.read("owner-state.json")) as {
      events: unknown[];
    };
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect(await owner.status(proof)).toMatchObject({
      used: 2,
      remaining: 0,
      unknown: 1,
    });
  });
  it("does not auto-release a crashed active reservation or double-settle", async () => {
    const { owner, files, proof, policy, advance } = await setup();
    await owner.installPolicy(policy);
    await owner.reserve(proof, "customer", "a", true);
    advance(3600000);
    await expect(
      new StandingOwner(files).reserve(proof, "customer", "b", true),
    ).rejects.toThrow("busy");
    await owner.settle("a", "unknown");
    await expect(owner.settle("a", "completed")).rejects.toThrow(
      "settlement_conflict",
    );
    await expect(owner.reserve(proof, "customer", "a", true)).rejects.toThrow(
      "already_dispatched",
    );
  });
  it("only admits one concurrent reservation across instances", async () => {
    const { owner, files, proof, policy } = await setup();
    await owner.installPolicy(policy);
    const results = await Promise.allSettled([
      owner.reserve(proof, "customer", "a", true),
      new StandingOwner(files).reserve(proof, "customer", "b", true),
    ]);
    expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect((await owner.status(proof)).used).toBe(1);
  });
  it("persists a global per-minute limit independently of browser identity", async () => {
    const { owner, proof, policy, advance } = await setup();
    await owner.installPolicy({ ...policy, requestsPerMinute: 1 });
    await owner.reserve(proof, "customer", "a", true);
    await owner.settle("a", "completed");
    await expect(owner.reserve(proof, "customer", "b", true)).rejects.toThrow(
      "rate_limited",
    );
    advance(60001);
    await owner.reserve(proof, "customer", "b", true);
  });
  it("requires the exact original historical journal link", async () => {
    const { owner, policy } = await setup();
    await owner.installPolicy(policy);
    await owner.assertHistoricalJournal(null);
    await expect(
      owner.assertHistoricalJournal({ attempts: [] }),
    ).rejects.toThrow("history_mismatch");
  });
  it.each([
    { host: "greatbison.tail9e8802.ts.net:8443", origin: OWNER_ORIGIN },
    { host: new URL(OWNER_ORIGIN).host, origin: "https://evil.invalid" },
    { host: new URL(OWNER_ORIGIN).host },
    {
      host: new URL(OWNER_ORIGIN).host,
      origin: OWNER_ORIGIN,
      "sec-fetch-site": "cross-site",
    },
  ])(
    "rejects wrong HTTPS port, foreign/missing origin and cross-site requests: %j",
    (headers) => {
      expect(() =>
        assertOwnerRequest(
          new Request(OWNER_ORIGIN, {
            headers: Object.fromEntries(
              Object.entries(headers).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            ),
          }),
          true,
        ),
      ).toThrow("origin_rejected");
    },
  );
  it("accepts exact HTTPS mutations and originless same-host reads only", () => {
    expect(() =>
      assertOwnerRequest(
        new Request(OWNER_ORIGIN, {
          headers: { host: new URL(OWNER_ORIGIN).host, origin: OWNER_ORIGIN },
        }),
        true,
      ),
    ).not.toThrow();
    expect(() =>
      assertOwnerRequest(
        new Request(OWNER_ORIGIN, {
          headers: { host: new URL(OWNER_ORIGIN).host },
        }),
        false,
      ),
    ).not.toThrow();
  });
});

async function credentials(files: PilotFiles, expired = false) {
  await files.write("registration.json", {
    format: "palcare-chatgpt-pilot-v1",
    clientId: "synthetic-client",
    subject: "synthetic-owner",
    tokens: {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
      idToken: "synthetic-id",
      nonce: "nonce",
      scopes: ["openid", "resource.invoke", "chatgpt.tokens.use.direct"],
      expiresAt: expired ? 1 : Date.now() + 3600000,
      savedAt: Date.now(),
    },
  });
}
describe("standing adapter guards refresh and dispatch with injected transports only", () => {
  it("runs four genuine transport calls concurrently, never a fifth", async () => {
    const { files, owner, proof, policy } = await setup(300);
    await credentials(files);
    await owner.installPolicy({
      ...policy,
      concurrency: 4,
      requestsPerMinute: 30,
      maxRetries: 1,
    });
    let release!: () => void,
      entered = 0,
      allStarted!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const started = new Promise<void>((r) => {
      allStarted = r;
    });
    const transport = vi.fn(async () => {
      if (++entered === 4) allStarted();
      await held;
      throw new Error("synthetic uncertain response");
    });
    const run = () =>
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer" as const,
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.timeout(2000),
        transport,
      });
    const active = Promise.allSettled([run(), run(), run(), run()]);
    try {
      await started;
      await expect(run()).rejects.toThrow("busy");
      expect(await owner.status(proof)).toMatchObject({
        used: 4,
        remaining: 296,
      });
    } finally {
      release();
    }
    await active;
    expect(transport).toHaveBeenCalledTimes(4);
    expect(await owner.status(proof)).toMatchObject({ used: 4, unknown: 4 });
  });
  it("allows one accounted retry only for explicit temporary pre-stream admission rejection", async () => {
    const { files, owner, proof, policy } = await setup();
    await credentials(files);
    await owner.installPolicy({ ...policy, maxRetries: 1 });
    const transport = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "subscription_sharing_usage_unavailable",
            message: "synthetic temporary admission rejection",
          },
        },
        { status: 503 },
      ),
    );
    await expect(
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.timeout(5000),
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(await owner.status(proof)).toMatchObject({
      used: 2,
      unknown: 0,
      remaining: 3,
    });
  });
  it("charges an arbitrary 503 as unknown without automatic retry", async () => {
    const { files, owner, proof, policy } = await setup();
    await credentials(files);
    await owner.installPolicy({ ...policy, maxRetries: 1 });
    const transport = vi.fn(async () =>
      Response.json(
        { detail: "synthetic unknown infrastructure failure" },
        { status: 503 },
      ),
    );
    await expect(
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.timeout(2000),
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    expect(await owner.status(proof)).toMatchObject({ used: 1, unknown: 1 });
  });
  it("cannot exceed quota through the retry path", async () => {
    const { files, owner, proof, policy } = await setup(1);
    await credentials(files);
    await owner.installPolicy({ ...policy, maxRetries: 1 });
    const transport = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "subscription_sharing_usage_unavailable",
            message: "synthetic",
          },
        },
        { status: 503 },
      ),
    );
    await expect(
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.timeout(5000),
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    expect((await owner.status(proof)).remaining).toBe(0);
  });
  it("rechecks policy revocation before a safe retry", async () => {
    const { files, owner, proof, policy } = await setup();
    await credentials(files);
    await owner.installPolicy({ ...policy, maxRetries: 1 });
    const transport = vi.fn(async () => {
      await owner.revokePolicy(proof);
      return Response.json(
        {
          error: {
            code: "subscription_sharing_usage_unavailable",
            message: "synthetic",
          },
        },
        { status: 503 },
      );
    });
    await expect(
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.timeout(5000),
        transport,
      }),
    ).rejects.toThrow("ai_disabled");
    expect(transport).toHaveBeenCalledOnce();
    expect((await owner.status(proof)).used).toBe(1);
  });
  it("never dispatches an already-cancelled request", async () => {
    const { files, owner, proof, policy } = await setup();
    await credentials(files);
    await owner.installPolicy({ ...policy, maxRetries: 1 });
    const transport = vi.fn();
    await expect(
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.abort(),
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect((await owner.status(proof)).used).toBe(0);
  });
  it("settles successful SSE usage without modifying the historical journal", async () => {
    const { files, owner, proof, policy } = await setup();
    await credentials(files);
    await owner.installPolicy(policy);
    const response = {
      id: "synthetic-response",
      status: "completed",
      model: "gpt-6.1-sol",
      reasoning: { effort: "medium" },
      output: [
        {
          id: "synthetic-message",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            { type: "output_text", text: '{"ok":true}', annotations: [] },
          ],
        },
      ],
      usage: {
        input_tokens: 5,
        output_tokens: 3,
        total_tokens: 8,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 1 },
      },
    };
    const transport = vi.fn(
      async () =>
        new Response(
          `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response, sequence_number: 0 })}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const result = await standingStructured({
      files,
      owner,
      proof,
      scope: "customer",
      enabled: () => true,
      requestId: randomUUID(),
      payload: "synthetic",
      schema: z.object({ ok: z.boolean() }),
      name: "test",
      signal: AbortSignal.timeout(1000),
      transport,
    });
    expect(result.value).toEqual({ ok: true });
    expect(await owner.status(proof)).toMatchObject({
      used: 1,
      unknown: 0,
      remaining: 4,
    });
    expect(JSON.stringify(await files.read("owner-state.json"))).toContain(
      '"totalTokens":8',
    );
    expect(await files.read("session.json")).toBeNull();
  });
  it("pauses future dispatch after provider quota denial without clearing credentials", async () => {
    const { files, owner, proof, policy } = await setup();
    await credentials(files);
    await owner.installPolicy(policy);
    const transport = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "subscription_sharing_usage_limit_exceeded",
            message: "synthetic",
          },
        },
        { status: 429 },
      ),
    );
    await expect(
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.timeout(1000),
        transport,
      }),
    ).rejects.toThrow();
    await expect(owner.assertDispatch(proof, "customer", true)).rejects.toThrow(
      "provider_unavailable",
    );
    expect((await files.registration())?.tokens).toBeTruthy();
  });
  it("fails closed after a lost refresh response and refuses a concurrent refresh", async () => {
    const { files } = await setup();
    await credentials(files, true);
    const transport = vi.fn(async () => {
      await expect(
        files.locked(() => accessToken(files, vi.fn())),
      ).rejects.toThrow("locked");
      throw new Error("synthetic lost response");
    });
    await expect(
      files.locked(() => accessToken(files, transport)),
    ).rejects.toThrow();
    await expect(
      files.locked(() => accessToken(files, transport)),
    ).rejects.toThrow("refresh_unknown");
    expect(transport).toHaveBeenCalledOnce();
    expect((await files.registration())?.tokens).toBeTruthy();
  });
  it("never refreshes or dispatches without approved policy", async () => {
    const { files, owner, proof } = await setup();
    await credentials(files, true);
    const transport = vi.fn();
    await expect(
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.timeout(1000),
        transport,
      }),
    ).rejects.toThrow("ai_disabled");
    expect(transport).not.toHaveBeenCalled();
  });
  it("records unknown before one POST and never repeats it", async () => {
    const { files, owner, proof, policy } = await setup();
    await credentials(files);
    await owner.installPolicy(policy);
    const transport = vi.fn(async () => {
      expect((await owner.status(proof)).used).toBe(1);
      throw new Error("synthetic network failure");
    });
    const options = {
      files,
      owner,
      proof,
      scope: "customer" as const,
      enabled: () => true,
      requestId: randomUUID(),
      payload: "synthetic",
      schema: z.object({ ok: z.boolean() }),
      name: "test",
      signal: AbortSignal.timeout(1000),
      transport,
    };
    await expect(standingStructured(options)).rejects.toThrow();
    await expect(standingStructured(options)).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    expect(await owner.status(proof)).toMatchObject({ used: 1, unknown: 1 });
  });
  it("rechecks revocation after a successful serialized refresh before POST", async () => {
    const { files, owner, proof, policy } = await setup();
    await credentials(files, true);
    await owner.installPolicy(policy);
    const transport = vi.fn(async () => {
      await owner.revokePolicy(proof);
      return Response.json({
        access_token: "new-synthetic-access",
        refresh_token: "new-synthetic-refresh",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "openid resource.invoke chatgpt.tokens.use.direct",
      });
    });
    await expect(
      standingStructured({
        files,
        owner,
        proof,
        scope: "customer",
        enabled: () => true,
        requestId: randomUUID(),
        payload: "synthetic",
        schema: z.object({ ok: z.boolean() }),
        name: "test",
        signal: AbortSignal.timeout(1000),
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    expect((await owner.status(proof)).used).toBe(0);
  });
  it.each(["invalid_grant", "invalid_refresh_token", "refresh_token_reused"])(
    "clears only terminal refresh credentials: %s",
    async (code) => {
      const { files } = await setup();
      await credentials(files, true);
      await expect(
        files.locked(() =>
          accessToken(files, async () =>
            Response.json({ error: code }, { status: 400 }),
          ),
        ),
      ).rejects.toThrow();
      expect((await files.registration())?.tokens).toBeUndefined();
      expect((await files.registration())?.clientId).toBe("synthetic-client");
    },
  );
  it.each([400, 429, 503])(
    "preserves credentials and unknown-refresh marker after nonterminal HTTP %s",
    async (status) => {
      const { files } = await setup();
      await credentials(files, true);
      const transport = vi.fn(async () =>
        Response.json(
          { error: status === 400 ? "invalid_client" : "temporary" },
          { status },
        ),
      );
      await expect(
        files.locked(() => accessToken(files, transport)),
      ).rejects.toThrow();
      expect((await files.registration())?.tokens?.refreshToken).toBe(
        "synthetic-refresh",
      );
      expect((await files.registration())?.refreshPending).toBe(true);
      await expect(
        files.locked(() => accessToken(files, transport)),
      ).rejects.toThrow("refresh_unknown");
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("does not unnecessarily refresh an unexpired access token", async () => {
    const { files } = await setup();
    await credentials(files);
    const transport = vi.fn();
    expect(await files.locked(() => accessToken(files, transport))).toBe(
      "synthetic-access",
    );
    expect(transport).not.toHaveBeenCalled();
  });
});
