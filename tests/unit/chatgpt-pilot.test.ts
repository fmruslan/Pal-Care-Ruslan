import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  mkdir,
  mkdtemp,
  rm,
  chmod,
  symlink,
  readFile,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  PilotFiles,
  type Registration,
} from "../../scripts/chatgpt-pilot/files";
import {
  smallJson,
  AUTHORIZE,
  ISSUER,
  JWKS,
  RESOURCE,
  TOKEN,
  REVOKE,
  authorizeRequest,
  callbackResult,
  exchange,
  importRegistration,
  accessToken,
  signIn,
  signOut,
  verifyIdentity,
} from "../../scripts/chatgpt-pilot/auth";
import {
  preparePilot,
  runPilot,
  streamStructured,
  subscriptionUsage,
  safeFailure,
} from "../../scripts/chatgpt-pilot/inference";
import { classificationSchema } from "../../src/lib/careos/providers/responses";
import { referenceSource } from "../../src/lib/careos/knowledge";

const roots: string[] = [];
async function files() {
  await mkdir("/tmp/opencode", { recursive: true });
  const root = await mkdtemp("/tmp/opencode/careos-pilot-unit-");
  roots.push(root);
  const result = new PilotFiles(root);
  await result.prepare();
  return result;
}
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: { keys: Record<string, unknown>[] };
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  jwks = {
    keys: [
      { ...(await exportJWK(keys.publicKey)), kid: "unit-key", alg: "RS256" },
    ],
  };
});
async function idToken(
  nonce = "unit-nonce",
  subject = "unit-owner",
  clientId = "unit-client",
  expiration = "1h",
) {
  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: "RS256", kid: "unit-key" })
    .setIssuer(ISSUER)
    .setAudience(clientId)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(keys.privateKey);
}
const jwksTransport: typeof fetch = async (url) => {
  expect(String(url)).toBe(JWKS);
  return Response.json(jwks);
};
async function registration(f: PilotFiles) {
  const r: Registration = {
    format: "palcare-chatgpt-pilot-v1",
    clientId: "unit-client",
    subject: "unit-owner",
    tokens: {
      idToken: await idToken(),
      nonce: "unit-nonce",
      accessToken: "unit-subscription-access",
      refreshToken: "unit-refresh",
      scopes: ["openid", "resource.invoke", "chatgpt.tokens.use.direct"],
      expiresAt: Date.now() + 3600000,
      savedAt: Date.now(),
    },
  };
  await f.write("registration.json", r);
  return r;
}
const usage = {
  input_tokens: 100,
  output_tokens: 30,
  total_tokens: 130,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 20 },
};
function completed(value: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: "resp_unit",
    status: "completed",
    model: "gpt-6.1-sol",
    reasoning: { effort: "medium" },
    service_tier: "default",
    usage,
    output: [
      {
        id: "msg_unit",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: JSON.stringify(value), annotations: [] },
        ],
      },
    ],
    ...extra,
  };
}
function sse(events: unknown[]) {
  return new Response(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
      "data: [DONE]\n\n",
    {
      headers: {
        "Content-Type": "text/event-stream",
        "x-request-id": "req_unit",
      },
    },
  );
}
function stream(value: unknown, extra?: Record<string, unknown>) {
  return sse([
    {
      type: "response.output_text.delta",
      delta: JSON.stringify(value),
      sequence_number: 1,
    },
    {
      type: "response.completed",
      response: completed(value, extra),
      sequence_number: 2,
    },
  ]);
}

describe("CareOS subscription pilot — synthetic OAuth/SSE only, no live authority", () => {
  it("uses fresh PKCE/state/nonce, official loopback URI, own app registration and stable host ID", async () => {
    const f = await files();
    const host = await f.hostId();
    expect(await f.hostId()).toBe(host);
    const a = authorizeRequest(host, "http://127.0.0.1:1455/auth/callback");
    const b = authorizeRequest(host, "http://127.0.0.1:1455/auth/callback");
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier).not.toBe(b.verifier);
    const url = new URL(a.url);
    expect(url.origin + url.pathname).toBe(AUTHORIZE);
    expect(url.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(url.searchParams.get("agent_name_hint")).toBe("Pal Care — CareOS");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain(
      "chatgpt.tokens.use.direct",
    );
    expect(url.searchParams.get("resource")).toBe(RESOURCE);
    const returning = new URL(
      authorizeRequest(host, a.redirectUri, "unit-client").url,
    );
    expect(returning.searchParams.has("agent_name_hint")).toBe(false);
    expect(returning.searchParams.has("id_token_hint")).toBe(false);
  });
  it("rejects wrong state, duplicate params, declined consent and changed returning client IDs", () => {
    const p = authorizeRequest(
      "urn:uuid:unit",
      "http://127.0.0.1:1455/auth/callback",
      "unit-client",
    );
    for (const query of [
      "state=wrong&code=abc",
      `state=${p.state}&error=access_denied`,
      `state=${p.state}&code=a&code=b`,
      `state=${p.state}&code=a&client_id=other`,
      `state=${p.state}&code=a&client_id=dynamic_agent_client`,
      `state=${"é".repeat(p.state.length)}&code=a`,
    ])
      expect(() =>
        callbackResult(new URL(p.redirectUri + "?" + query), p),
      ).toThrow();
    expect(
      callbackResult(new URL(p.redirectUri + `?state=${p.state}&code=a`), p),
    ).toEqual({ code: "a", clientId: "unit-client" });
  });
  it("verifies ID signature, issuer, audience, expiry and nonce", async () => {
    await expect(
      verifyIdentity(
        await idToken(),
        "unit-client",
        "unit-nonce",
        jwksTransport,
      ),
    ).resolves.toBe("unit-owner");
    for (const [jwt, clientId, nonce] of [
      [await idToken(), "other-client", "unit-nonce"],
      [await idToken(), "unit-client", "wrong-nonce"],
      [
        await idToken("unit-nonce", "unit-owner", "unit-client", "-1h"),
        "unit-client",
        "unit-nonce",
      ],
      ["not.a.token", "unit-client", "unit-nonce"],
    ])
      await expect(
        verifyIdentity(jwt, clientId, nonce, jwksTransport),
      ).rejects.toThrow();
  });
  it("retains issued client ID before exchange, rejects identity-only grants and never receives an API key", async () => {
    const f = await files(),
      p = authorizeRequest(
        await f.hostId(),
        "http://127.0.0.1:1455/auth/callback",
      );
    const calls: string[] = [];
    await expect(
      exchange(
        f,
        p,
        { code: "unit-code", clientId: "unit-client" },
        async (url, init) => {
          calls.push(String(url));
          expect(String(url)).toBe(TOKEN);
          expect((await f.registration())?.clientId).toBe("unit-client");
          expect(String(init!.body)).toContain("code_verifier=");
          expect(String(init!.body)).not.toContain("client_secret");
          expect(init?.redirect).toBe("error");
          return Response.json({
            access_token: "unit-access",
            refresh_token: "unit-refresh",
            token_type: "Bearer",
            id_token: await idToken(p.nonce),
            scope: "openid",
            expires_in: 3600,
          });
        },
      ),
    ).rejects.toMatchObject({ code: "pilot_plan_permission_missing" });
    expect(calls).toHaveLength(1);
    expect((await f.registration())?.tokens).toBeUndefined();
  });
  it("completes an actual loopback callback using injected OpenAI endpoints, without inference", async () => {
    const f = await files();
    let callback: Promise<Response> | undefined;
    let nonce = "";
    await signIn(
      f,
      (authorization) => {
        const url = new URL(authorization);
        nonce = url.searchParams.get("nonce")!;
        const target = new URL(url.searchParams.get("redirect_uri")!);
        target.search = new URLSearchParams({
          state: url.searchParams.get("state")!,
          client_id: "unit-client",
          code: "unit-code",
        }).toString();
        callback = fetch(target); // Only a test-created local listener, never a provider.
      },
      async (url, init) => {
        if (String(url) === JWKS) return Response.json(jwks);
        expect(String(url)).toBe(TOKEN);
        const body = init!.body as URLSearchParams;
        // The private verifier is only sent to the token endpoint, not callback.
        expect(body.get("redirect_uri")).toMatch(
          /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/,
        );
        return Response.json({
          access_token: "unit-access",
          refresh_token: "unit-refresh",
          token_type: "Bearer",
          id_token: await idToken(nonce),
          scope: "openid resource.invoke chatgpt.tokens.use.direct",
          expires_in: 3600,
        });
      },
    );
    await expect(callback).resolves.toHaveProperty("status", 200);
    expect((await f.registration())?.subject).toBe("unit-owner");
    expect(await f.read("pilot.json")).toBeNull();
  });
  it("uses protected atomic files, excludes symlinks/broad permissions, serializes CLI work", async () => {
    const f = await files();
    await registration(f);
    expect(
      (await stat(join(f.directory, "registration.json"))).mode & 0o777,
    ).toBe(0o600);
    await expect(
      f.locked(() => f.locked(async () => {})),
    ).rejects.toMatchObject({ code: "pilot_locked_inspect_before_recovery" });
    await chmod(join(f.directory, "registration.json"), 0o644);
    await expect(f.registration()).rejects.toMatchObject({
      code: "pilot_unsafe_file",
    });
    await chmod(join(f.directory, "registration.json"), 0o600);
    await symlink(
      join(f.directory, "registration.json"),
      join(f.directory, "incoming.json"),
    );
    await expect(f.read("incoming.json")).rejects.toMatchObject({
      code: "pilot_unsafe_file",
    });
  });
  it("imports only CareOS's own record and preserves the VM host, without refreshing or inferring", async () => {
    const mac = await files(),
      vm = await files();
    const macHost = await mac.hostId(),
      vmHost = await vm.hostId();
    await vm.write("incoming.json", await registration(mac));
    await importRegistration(vm, jwksTransport);
    expect(await vm.hostId()).toBe(vmHost);
    expect(vmHost).not.toBe(macHost);
    expect(await vm.read("incoming.json")).toBeNull();
    expect((await vm.registration())?.clientId).toBe("unit-client");
    await vm.write("incoming.json", await mac.registration());
    await expect(importRegistration(vm, jwksTransport)).rejects.toMatchObject({
      code: "pilot_already_imported_do_not_overwrite",
    });
  });
  it("rotates tokens atomically and never retries an ambiguous refresh", async () => {
    const f = await files(),
      r = await registration(f);
    r.tokens!.expiresAt = Date.now() - 1;
    await f.write("registration.json", r);
    const transport = vi.fn(async (url: unknown) => {
      expect(String(url)).toBe(TOKEN);
      expect((await f.registration())?.refreshPending).toBe(true);
      return Response.json({
        access_token: "unit-new-access",
        refresh_token: "unit-new-refresh",
        token_type: "Bearer",
        scope: "openid resource.invoke chatgpt.tokens.use.direct",
        expires_in: 3600,
      });
    });
    await expect(accessToken(f, transport)).resolves.toBe("unit-new-access");
    expect((await f.registration())?.tokens?.refreshToken).toBe(
      "unit-new-refresh",
    );
    const rotated = (await f.registration())!;
    rotated.tokens!.expiresAt = Date.now() - 1;
    await f.write("registration.json", rotated);
    const fail = vi.fn(async () => {
      throw new Error("secret provider diagnostics");
    });
    await expect(accessToken(f, fail)).rejects.toThrow();
    await expect(accessToken(f, fail)).rejects.toMatchObject({
      code: "pilot_refresh_unknown_reauthorize",
    });
    expect(fail).toHaveBeenCalledOnce();
  });
  it("revokes on disconnect, clears local tokens, retains registration/host and reports failed revocation", async () => {
    const f = await files();
    await registration(f);
    const host = await f.hostId();
    const revoke = vi.fn(async (url: unknown) => {
      expect(String(url)).toBe(REVOKE);
      return new Response(null, { status: 200 });
    });
    expect(await signOut(f, revoke)).toBe(true);
    expect((await f.registration())?.tokens).toBeUndefined();
    expect(await f.hostId()).toBe(host);
    await registration(f);
    expect(
      await signOut(f, async () => {
        throw new Error("network");
      }),
    ).toBe(false);
    expect((await f.registration())?.tokens).toBeUndefined();
  });
  it("requires approval and a no-paid-credit attestation before any model discovery or inference", async () => {
    const f = await files(),
      transport = vi.fn();
    for (const approval of [
      { approved: false, creditsDisabled: true },
      { approved: true, creditsDisabled: false },
    ])
      await expect(runPilot(f, approval, transport)).rejects.toMatchObject({
        code: "pilot_approval_and_no_credit_confirmation_required",
      });
    expect(transport).not.toHaveBeenCalled();
  });
  it("streams the public Responses endpoint with fixed Sol medium and no unsupported parameters/API credentials", async () => {
    vi.stubEnv("OPENAI_API_KEY", "never-use-this-paid-key");
    vi.stubEnv("OPENAI_ADMIN_KEY", "never-use-admin");
    vi.stubEnv("OPENAI_BASE_URL", "https://invalid.example");
    vi.stubEnv("OPENAI_PROJECT_ID", "paid-project");
    const before = vi.fn(async () => {}),
      observe = vi.fn();
    const transport = vi.fn(async (url, init) => {
      expect(String(url)).toBe(`${RESOURCE}/responses`);
      expect(before).toHaveBeenCalledOnce();
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-6.1-sol",
        reasoning: { effort: "medium" },
        stream: true,
        store: false,
        text: { format: { type: "json_schema", strict: true } },
      });
      for (const key of [
        "max_output_tokens",
        "service_tier",
        "prompt_cache_options",
        "previous_response_id",
        "metadata",
        "tools",
        "conversation",
      ])
        expect(body).not.toHaveProperty(key);
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(
        "Bearer unit-subscription-access",
      );
      expect(headers.has("openai-project")).toBe(false);
      expect(headers.has("openai-organization")).toBe(false);
      expect(init?.redirect).toBe("error");
      return stream({ intent: "care" });
    });
    expect(
      (
        await streamStructured({
          accessToken: "unit-subscription-access",
          payload: "unit",
          schema: classificationSchema,
          name: "careos_intent",
          beforeDispatch: before,
          observe,
          transport,
        })
      ).value,
    ).toEqual({ intent: "care" });
    expect(transport).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        events: 2,
        outputShape: [{ type: "message", contentTypes: ["output_text"] }],
        usage: expect.objectContaining({
          reasoningTokens: 20,
          outputTokens: 30,
        }),
      }),
    );
  });
  it.each([
    "partial",
    "incomplete",
    "limit",
    "invalid",
    "usage",
    "model",
    "effort",
    "refusal",
    "late-error",
    "network",
  ])("stops on %s, never retries or falls back", async (kind) => {
    const transport = vi.fn(async () => {
      if (kind === "network") throw new Error("private raw error");
      if (kind === "partial")
        return sse([
          {
            type: "response.output_text.delta",
            delta: "{",
            sequence_number: 1,
          },
        ]);
      if (kind === "incomplete")
        return sse([
          {
            type: "response.incomplete",
            response: completed({}, { status: "incomplete" }),
            sequence_number: 1,
          },
        ]);
      if (kind === "limit")
        return sse([
          {
            type: "response.failed",
            response: completed(
              {},
              {
                status: "failed",
                error: { code: "subscription_sharing_usage_limit_exceeded" },
              },
            ),
            sequence_number: 1,
          },
        ]);
      if (kind === "late-error")
        return sse([
          {
            type: "response.completed",
            response: completed({ intent: "care" }),
            sequence_number: 1,
          },
          {
            type: "error",
            code: "subscription_sharing_usage_unavailable",
            message: "secret",
            sequence_number: 2,
          },
        ]);
      return stream(
        { intent: kind === "invalid" ? "refund" : "care" },
        {
          ...(kind === "usage" ? { usage: null } : {}),
          ...(kind === "model" ? { model: "other" } : {}),
          ...(kind === "effort" ? { reasoning: { effort: "low" } } : {}),
          ...(kind === "refusal"
            ? {
                output: [
                  {
                    type: "message",
                    content: [{ type: "refusal", refusal: "No" }],
                  },
                ],
              }
            : {}),
        },
      );
    });
    await expect(
      streamStructured({
        accessToken: "unit",
        payload: "unit",
        schema: classificationSchema,
        name: "unit",
        beforeDispatch: async () => {},
        observe: () => {},
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    expect(safeFailure(new Error("secret"))).not.toContain("secret");
  });
  it.each([401, 403, 429, 503])(
    "preserves HTTP %s diagnostics without raw bodies or retries",
    async (status) => {
      const observe = vi.fn();
      const transport = vi.fn(async () =>
        Response.json(
          { detail: "PRIVATE-RAW-ERROR" },
          { status, headers: { "x-request-id": "req_unit" } },
        ),
      );
      try {
        await streamStructured({
          accessToken: "unit",
          payload: "unit",
          schema: classificationSchema,
          name: "unit",
          beforeDispatch: async () => {},
          observe,
          transport,
        });
        throw new Error("Expected failure");
      } catch (error) {
        expect(safeFailure(error)).not.toContain("PRIVATE");
      }
      expect(observe).toHaveBeenCalledWith({
        httpStatus: status,
        requestId: "req_unit",
      });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it("honors cancellation and bounds oversized streamed output", async () => {
    const controller = new AbortController();
    const transport = vi.fn(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          );
          controller.abort();
        }),
    );
    await expect(
      streamStructured({
        accessToken: "unit",
        payload: "unit",
        schema: classificationSchema,
        name: "unit",
        signal: controller.signal,
        beforeDispatch: async () => {},
        observe: () => {},
        transport,
      }),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    const oversized = vi.fn(async () =>
      sse([
        {
          type: "response.output_text.delta",
          delta: "x".repeat(16001),
          sequence_number: 1,
        },
      ]),
    );
    await expect(
      streamStructured({
        accessToken: "unit",
        payload: "unit",
        schema: classificationSchema,
        name: "unit",
        beforeDispatch: async () => {},
        observe: () => {},
        transport: oversized,
      }),
    ).rejects.toMatchObject({ code: "pilot_output_too_large" });
    expect(oversized).toHaveBeenCalledOnce();
  });
  it("clears unusable refresh tokens and rejects a missing plan scope before networking", async () => {
    const f = await files(),
      r = await registration(f);
    r.tokens!.expiresAt = Date.now() - 1;
    await f.write("registration.json", r);
    await expect(
      accessToken(f, async () =>
        Response.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    ).rejects.toMatchObject({ code: "pilot_oauth_invalid_grant" });
    expect((await f.registration())?.tokens).toBeUndefined();
    const missing = await registration(f);
    missing.tokens!.scopes = ["openid"];
    await f.write("registration.json", missing);
    const transport = vi.fn();
    await expect(accessToken(f, transport)).rejects.toMatchObject({
      code: "pilot_plan_permission_missing",
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it("allows bounded rich model catalogs without increasing OAuth/JWKS response limits", async () => {
    const transport: typeof fetch = async () =>
      Response.json({ models: [], metadata: "x".repeat(300000) });
    await expect(
      smallJson(`${RESOURCE}/models`, {}, transport),
    ).resolves.toHaveProperty("models");
    for (const url of [TOKEN, JWKS, `${RESOURCE}/models?other=1`])
      await expect(smallJson(url, {}, transport)).rejects.toMatchObject({
        code: "pilot_http_response_too_large",
      });
    await expect(
      smallJson(`${RESOURCE}/models`, {}, async () =>
        Response.json({ metadata: "x".repeat(2097152) }),
      ),
    ).rejects.toMatchObject({ code: "pilot_http_response_too_large" });
  });
  it("reconstructs completed output items when terminal output is empty, excluding commentary", async () => {
    const final = completed({ intent: "care" }).output[0];
    const commentary = {
      ...final,
      id: "msg_commentary",
      phase: "commentary",
      content: [
        {
          type: "output_text",
          text: "Looking at your question.",
          annotations: [],
        },
      ],
    };
    const response = await streamStructured({
      accessToken: "unit",
      payload: "unit",
      schema: classificationSchema,
      name: "unit",
      beforeDispatch: async () => {},
      observe: () => {},
      transport: async () =>
        sse([
          {
            type: "response.output_item.done",
            output_index: 0,
            item: commentary,
            sequence_number: 1,
          },
          {
            type: "response.output_item.done",
            output_index: 1,
            item: { ...final, phase: "final_answer" },
            sequence_number: 2,
          },
          {
            type: "response.completed",
            response: completed({}, { output: [] }),
            sequence_number: 3,
          },
        ]),
    });
    expect(response.value).toEqual({ intent: "care" });
  });
  it("bounds input and does not present subscription tokens as API-dollar spend", async () => {
    const transport = vi.fn();
    await expect(
      streamStructured({
        accessToken: "unit",
        payload: "x".repeat(20000),
        schema: classificationSchema,
        name: "unit",
        beforeDispatch: async () => {},
        observe: () => {},
        transport,
      }),
    ).rejects.toMatchObject({ code: "pilot_request_too_large" });
    expect(transport).not.toHaveBeenCalled();
    expect(subscriptionUsage(usage)).not.toHaveProperty("micro");
    expect(() => subscriptionUsage({ ...usage, total_tokens: 0 })).toThrow();
    expect(() =>
      subscriptionUsage({
        ...usage,
        output_tokens_details: { reasoning_tokens: 31 },
      }),
    ).toThrow();
  });
  it("runs three fixed scenarios through existing CareOS grounding and Studio contracts with durable attempts", async () => {
    const f = await files();
    await registration(f);
    await preparePilot(f);
    const headersSeen: string[] = [];
    const transport = vi.fn(async (url, init) => {
      headersSeen.push(String(url));
      if (String(url).endsWith("/models"))
        return Response.json({
          models: [{ slug: "gpt-6.1-sol", visibility: "list" }],
        });
      expect(String(url)).toBe(`${RESOURCE}/responses`);
      const journal = (await f.read("pilot.json")) as { attempts: unknown[] };
      expect(journal.attempts.length).toBe(
        headersSeen.filter((u) => u.endsWith("/responses")).length,
      );
      const body = JSON.parse(String(init?.body));
      switch (body.text.format.name) {
        case "careos_intent":
          return stream({ intent: "care" });
        case "careos_care":
          return stream({
            outcome: "answered",
            steps: [
              {
                text: "Use Shutdown before disconnecting power.",
                sourceId: referenceSource.id,
                quote:
                  "Use this option before disconnecting your Raspberry Pi from power.",
              },
            ],
          });
        case "careos_dashboard":
          return stream({
            outcome: "apply",
            commands: [
              { operation: "reset" },
              { operation: "add-summary" },
              { operation: "evidence" },
            ],
          });
        default:
          throw new Error("Unexpected request");
      }
    });
    const result = await f.locked(() =>
      runPilot(f, { approved: true, creditsDisabled: true }, transport),
    );
    expect(result).toMatchObject({
      status: "PASS",
      databaseCalls: 0,
      financialCalls: 0,
      webRuntimeEnabled: false,
    });
    expect(result.attempts).toHaveLength(3);
    await expect(
      runPilot(f, { approved: true, creditsDisabled: true }, transport),
    ).rejects.toMatchObject({
      code: "pilot_already_attempted_inspect_no_retry",
    });
    expect(transport).toHaveBeenCalledTimes(4); // Catalog + three POSTs, no retries.
    const journal = await readFile(join(f.directory, "pilot.json"), "utf8");
    expect(journal).toContain("CC BY-SA");
    expect(journal).not.toContain("unit-subscription-access");
    expect(journal).not.toContain("unit-owner");
  });
  it("retains an unknown dispatch and stops the whole pilot, even across restarts", async () => {
    const f = await files();
    await registration(f);
    const transport = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/models"))
        return Response.json({
          models: [{ slug: "gpt-6.1-sol", visibility: "list" }],
        });
      throw new Error("network ambiguity");
    });
    await expect(
      runPilot(f, { approved: true, creditsDisabled: true }, transport),
    ).rejects.toThrow();
    expect(await f.read("pilot.json")).toMatchObject({
      status: "FAIL",
      attempts: [{ state: "unknown" }],
    });
    await expect(
      runPilot(
        new PilotFiles(f.directory),
        { approved: true, creditsDisabled: true },
        transport,
      ),
    ).rejects.toMatchObject({
      code: "pilot_already_attempted_inspect_no_retry",
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("stops without inference if the actual subscription catalog lacks Sol", async () => {
    const f = await files();
    await registration(f);
    const transport = vi.fn(async () =>
      Response.json({ models: [{ slug: "other", visibility: "list" }] }),
    );
    await expect(
      runPilot(f, { approved: true, creditsDisabled: true }, transport),
    ).rejects.toMatchObject({ code: "pilot_sol_unavailable_stop" });
    expect(transport).toHaveBeenCalledOnce();
  });
});
