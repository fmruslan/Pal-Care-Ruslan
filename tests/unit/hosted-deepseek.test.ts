import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { hostedDemo } from "../../src/lib/hosted-demo";
import { parseCareConfig } from "../../src/lib/careos/config";
import {
  assertEvaluationAccess,
  evaluationAccessStatus,
  newGuestAccess,
} from "../../src/lib/careos/evaluation-access";
import { ResponsesProvider } from "../../src/lib/careos/providers/responses";
import { pricedDeepSeekUsage } from "../../src/lib/careos/model-policy";
import { studioEvaluationAllowed } from "../../src/lib/intelligence/access";
import { northConversationalPresentation } from "../../src/lib/private-preview-origin";
import { evaluationRefreshDelay } from "../../src/lib/careos/window";
import { accountedCall } from "../../src/lib/careos/accounted-call";

const token = "a".repeat(64);
const env = {
  RENDER: "true",
  PALCARE_HOSTED_DEMO: "true",
  APP_ORIGIN: "https://palcare-judge.onrender.com",
  CAREOS_PROVIDER: "responses",
  CAREOS_MODEL: "deepseek-flash",
  CAREOS_LIVE_ENABLED: "true",
  CAREOS_API_KEY: "test-not-a-real-api-key",
  DEMO_DATA_SOURCE: "database",
  CAREOS_PROVIDER_LIMIT_CONFIRMED: "true",
  CAREOS_DATABASE_URL: "postgres://care:example@db/palcare",
  CAREOS_DAILY_BUDGET_MICRO: "5000000",
  CAREOS_TOTAL_BUDGET_MICRO: "5000000",
  CAREOS_BUDGET_ID: "render-judge",
  CAREOS_EVALUATION_ENABLED: "true",
  CAREOS_EVALUATION_EXPIRES_AT: "2027-01-01T08:00:00Z",
  CAREOS_CUSTOMER_ACCESS_HASH: createHash("sha256").update(token).digest("hex"),
  CAREOS_STUDIO_ACCESS_HASH: createHash("sha256")
    .update("b".repeat(64))
    .digest("hex"),
};
const now = Date.parse("2026-11-11T20:00:00Z");
const schema = z.strictObject({ intent: z.literal("summary") });
const config = {
  apiKey: "test-not-real",
  model: "deepseek-flash",
  baseURL: "https://api.deepseek.com",
};
const usage = {
  input_tokens: 1000,
  output_tokens: 100,
  total_tokens: 1100,
  input_tokens_details: { cached_tokens: 100 },
  output_tokens_details: { reasoning_tokens: 0 },
};
function response(text = '{"intent":"summary"}', extra = {}) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl_test",
      object: "chat.completion",
      model: "deepseek-flash",
      usage: {
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
        prompt_cache_hit_tokens: 100,
        prompt_cache_miss_tokens: 900,
        prompt_tokens_details: { cached_tokens: 100 },
        completion_tokens_details: { reasoning_tokens: 0 },
      },
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_test",
                type: "function",
                function: { name: "test_intent", arguments: text },
              },
            ],
          },
        },
      ],
      ...extra,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
describe("Render-only DeepSeek; injected transport, no live calls", () => {
  it("does not overflow the browser timer for the judging-period access window", () => {
    expect(
      evaluationRefreshDelay(Date.parse(env.CAREOS_EVALUATION_EXPIRES_AT), now),
    ).toBe(2147483647);
    expect(evaluationRefreshDelay(now + 1000, now)).toBe(1050);
    expect(evaluationRefreshDelay(now - 1000, now)).toBe(0);
  });
  it("uses the hosted model only on explicit isolated Render configuration", () => {
    expect(hostedDemo(env)).toBe(true);
    expect(parseCareConfig(env)).toMatchObject({
      mode: "responses",
      model: "deepseek-flash",
      baseURL: "https://api.deepseek.com",
    });
    expect(northConversationalPresentation(env)).toBe(true);
    expect(studioEvaluationAllowed(env, "palcare-judge.onrender.com")).toBe(
      true,
    );
    expect(studioEvaluationAllowed(env, "other.onrender.com")).toBe(false);
    for (const change of [
      { RENDER: "false" },
      { APP_ORIGIN: "https://greatbison.tail9e8802.ts.net:8444" },
      { CAREOS_OWNER_MODE: "true" },
      { PAYPAL_CHECKOUT_ENABLED: "true" },
      { GUARDIAN_REFUNDS_ENABLED: "true" },
    ]) {
      expect(hostedDemo({ ...env, ...change })).toBe(false);
      expect(() => parseCareConfig({ ...env, ...change })).toThrow();
    }
    expect(() =>
      parseCareConfig({ ...env, PALCARE_HOSTED_DEMO: "false" }),
    ).toThrow();
    expect(() =>
      parseCareConfig({
        ...env,
        CAREOS_RESPONSES_BASE_URL: "https://example.com",
      }),
    ).toThrow();
  });
  it("requires independently signed guest capabilities, never legacy shared tokens", () => {
    const guest = newGuestAccess("customer", env, now).token;
    expect(() =>
      assertEvaluationAccess("customer", undefined, env, now),
    ).toThrow();
    expect(() =>
      assertEvaluationAccess("customer", guest, env, now),
    ).not.toThrow();
    expect(() => assertEvaluationAccess("studio", guest, env, now)).toThrow();
    expect(() => assertEvaluationAccess("customer", token, env, now)).toThrow();
    expect(evaluationAccessStatus({}, env, now).scopes).toEqual({
      customer: false,
      studio: false,
    });
    expect(() =>
      assertEvaluationAccess(
        "customer",
        guest,
        env,
        Date.parse(env.CAREOS_EVALUATION_EXPIRES_AT),
      ),
    ).toThrow();
    expect(() =>
      assertEvaluationAccess(
        "customer",
        guest,
        { ...env, CAREOS_EVALUATION_EXPIRES_AT: "2027-01-01T08:00:00.001Z" },
        now,
      ),
    ).toThrow();
  });
  it("covers December 31 Pacific and denies both scopes exactly at the approved deadline", () => {
    const deadline = Date.parse("2027-01-01T08:00:00Z");
    expect(new Date("2026-12-31T23:59:59.999-08:00").getTime()).toBe(
      deadline - 1,
    );
    for (const scope of ["customer", "studio"] as const) {
      const capability = newGuestAccess(scope, env, deadline - 1).token;
      expect(() =>
        assertEvaluationAccess(scope, capability, env, deadline - 1),
      ).not.toThrow();
      expect(() =>
        assertEvaluationAccess(scope, capability, env, deadline),
      ).toThrow();
      expect(() =>
        assertEvaluationAccess(
          scope,
          capability,
          { ...env, RENDER: "false" },
          now,
        ),
      ).toThrow();
    }
  });
  it("does not extend an older configured window or widen private local access", () => {
    const old = {
      ...env,
      CAREOS_EVALUATION_EXPIRES_AT: "2026-12-16T00:00:00Z",
    };
    expect(() =>
      assertEvaluationAccess(
        "customer",
        newGuestAccess("customer", old, now).token,
        old,
        now,
      ),
    ).not.toThrow();
    expect(() =>
      assertEvaluationAccess(
        "customer",
        token,
        old,
        Date.parse(old.CAREOS_EVALUATION_EXPIRES_AT),
      ),
    ).toThrow();
    const local = {
      ...env,
      PALCARE_HOSTED_DEMO: "false",
      RENDER: "false",
      APP_ORIGIN: "http://localhost:3000",
    };
    expect(() =>
      assertEvaluationAccess("customer", token, local, now),
    ).toThrow();
    expect(() =>
      assertEvaluationAccess(
        "customer",
        token,
        {
          ...local,
          CAREOS_EVALUATION_EXPIRES_AT: new Date(now + 86400000).toISOString(),
        },
        now,
      ),
    ).not.toThrow();
    expect(() =>
      assertEvaluationAccess(
        "customer",
        token,
        {
          ...local,
          CAREOS_EVALUATION_EXPIRES_AT: new Date(now + 86400001).toISOString(),
        },
        now,
      ),
    ).toThrow();
  });
  it("sends supported structural schema with trusted instructions and validates the original strict application schema", async () => {
    const fetcher = vi.fn(async () => response());
    const result = await new ResponsesProvider(
      config,
      fetcher as typeof fetch,
    ).structured(
      "original question and owned history",
      schema,
      "test_intent",
      AbortSignal.timeout(1000),
      "Trusted rules",
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(url)).toBe("https://api.deepseek.com/beta/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      stream: false,
      tool_choice: { type: "function", function: { name: "test_intent" } },
    });
    expect(body.messages[1]).toEqual({
      role: "user",
      content: "original question and owned history",
    });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Trusted rules");
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.strict).toBe(true);
    expect(body.tools[0].function.parameters.additionalProperties).toBe(false);
    expect(body.tools[0].function.parameters.properties.intent).toEqual({
      type: "string",
      enum: ["summary"],
    });
    expect(body).not.toHaveProperty("service_tier");
    expect(body).not.toHaveProperty("prompt_cache_options");
    expect(result).toMatchObject({
      value: { intent: "summary" },
      micro: 391,
      usage: { model: "deepseek-flash", reasoning: "none" },
    });
  });
  it("rejects wrong, duplicate or incomplete serialization calls after capturing known usage, without executing or retrying", async () => {
    const call = {
      id: "call_test",
      type: "function",
      function: { name: "test_intent", arguments: '{"intent":"summary"}' },
    };
    for (const [finish_reason, tool_calls] of [
      [
        "tool_calls",
        [{ ...call, function: { ...call.function, name: "arbitrary_tool" } }],
      ],
      ["tool_calls", [call, call]],
      ["length", [call]],
    ] as const) {
      const fetcher = vi.fn(async () =>
        response('{"intent":"summary"}', {
          choices: [
            {
              index: 0,
              finish_reason,
              message: { role: "assistant", content: null, tool_calls },
            },
          ],
        }),
      );
      await expect(
        new ResponsesProvider(config, fetcher as typeof fetch).structured(
          "test",
          schema,
          "test_intent",
          AbortSignal.timeout(1000),
        ),
      ).rejects.toMatchObject({ micro: 391 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("settles measured usage for malformed calls, unexpected prose and multiple choices without raw failures or retries", async () => {
    const call = {
      id: "call_test",
      type: "function",
      function: { name: "test_intent", arguments: '{"intent":"summary"}' },
    };
    const choice = {
      index: 0,
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: null as string | null,
        tool_calls: [call],
      },
    };
    for (const choices of [
      [{ ...choice, message: { ...choice.message, tool_calls: [null] } }],
      [
        {
          ...choice,
          message: { ...choice.message, tool_calls: [{ type: "function" }] },
        },
      ],
      [
        {
          ...choice,
          message: { ...choice.message, content: "Unvalidated prose" },
        },
      ],
      [choice, choice],
    ]) {
      const fetcher = vi.fn(async () =>
        response('{"intent":"summary"}', { choices }),
      );
      const settle = vi.fn(async () => {});
      await expect(
        accountedCall(
          () =>
            new ResponsesProvider(config, fetcher as typeof fetch).structured(
              "test",
              schema,
              "test_intent",
              AbortSignal.timeout(1000),
            ),
          settle,
        ),
      ).rejects.toMatchObject({ code: "careos_model_refused", micro: 391 });
      expect(settle).toHaveBeenCalledExactlyOnceWith(
        391,
        expect.objectContaining({ micro: 391, model: "deepseek-flash" }),
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("retains measured usage when rejecting invalid JSON or unsafe action output", async () => {
    for (const text of ["not JSON", '{"intent":"summary","refund":true}']) {
      const provider = new ResponsesProvider(config, (async () =>
        response(text)) as typeof fetch);
      await expect(
        provider.structured(
          "test",
          schema,
          "test_intent",
          AbortSignal.timeout(1000),
        ),
      ).rejects.toMatchObject({
        code:
          text === "not JSON"
            ? "careos_model_invalid_json"
            : "careos_model_invalid_output",
        micro: 391,
      });
    }
  });
  it("does not retry provider denial, insufficient balance or server failure", async () => {
    for (const status of [401, 402, 429, 503]) {
      const fetcher = vi.fn(
        async () =>
          new Response('{"error":{"message":"provider unavailable"}}', {
            status,
            headers: { "content-type": "application/json" },
          }),
      );
      await expect(
        new ResponsesProvider(config, fetcher as typeof fetch).structured(
          "test",
          schema,
          "test_intent",
          AbortSignal.timeout(1000),
        ),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
  it("exposes only fixed hosted failure categories, never provider response secrets", async () => {
    for (const [status, message, code] of [
      [
        401,
        "secret key incorrect: test-sensitive-value",
        "careos_provider_http_401",
      ],
      [402, "private account balance exhausted", "careos_provider_http_402"],
      [
        400,
        "invalid schema containing private-value",
        "careos_provider_schema_rejected",
      ],
      [
        422,
        "invalid parameter private-value",
        "careos_provider_request_rejected",
      ],
      [429, "private quota details", "careos_provider_http_429"],
      [503, "private upstream details", "careos_provider_http_503"],
    ] as const) {
      const fetcher = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message, type: "invalid_request_error" },
            }),
            { status, headers: { "content-type": "application/json" } },
          ),
      );
      const provider = new ResponsesProvider(config, fetcher as typeof fetch);
      const failure = await provider
        .structured("test", schema, "test_intent", AbortSignal.timeout(1000))
        .catch((e) => e);
      expect(failure).toMatchObject({ code, micro: null, usage: null });
      expect(failure.message).toBe(code);
      expect(JSON.stringify(failure)).not.toContain(message);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("uses conservative peak cost and rejects malformed usage", () => {
    expect(pricedDeepSeekUsage(usage, 10)?.micro).toBe(391);
    expect(
      pricedDeepSeekUsage(
        {
          ...usage,
          input_tokens_details: undefined,
          output_tokens_details: undefined,
        },
        10,
      )?.micro,
    ).toBe(420);
    for (const change of [
      { input_tokens: -1 },
      { total_tokens: 2 },
      { output_tokens: 0.5 },
      { input_tokens_details: { cached_tokens: 1001 } },
    ])
      expect(pricedDeepSeekUsage({ ...usage, ...change }, 10)).toBeNull();
  });
});
