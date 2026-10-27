import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  MODEL,
  pricedUsage,
  SOL_RESERVATION_MICRO,
  MODEL_REQUEST_BYTES,
  MODEL_OUTPUT_TOKENS,
} from "../../src/lib/careos/model-policy";
import {
  ResponsesProvider,
  ModelFailure,
} from "../../src/lib/careos/providers/responses";
import { accountedCall } from "../../src/lib/careos/accounted-call";
import { assertEvaluationAccess } from "../../src/lib/careos/evaluation-access";
import { parseCareConfig } from "../../src/lib/careos/config";
import { adjustmentResolution } from "../../src/lib/careos/resolution";
import {
  evidencePacket,
  selectedEvidence,
} from "../../src/lib/careos/evidence-selection";
import {
  planDashboard,
  validateDashboardPlan,
} from "../../src/lib/intelligence/planner";
import { illustrativeDataset } from "../../src/lib/intelligence/model";
import type { GuardianView } from "../../src/lib/price-guardian/contracts";
import { deterministicAnswer } from "../../src/lib/careos/tools";
import { demoData } from "../../src/lib/demo/fixtures";
import { resolveTurn } from "../../src/lib/careos/service";
const usage = {
  input_tokens: 1000,
  output_tokens: 200,
  total_tokens: 1200,
  input_tokens_details: { cached_tokens: 400, cache_write_tokens: 100 },
  output_tokens_details: { reasoning_tokens: 150 },
};
const cfg = {
  apiKey: "unit-only",
  model: MODEL,
  baseURL: "https://api.openai.com/v1",
  projectId: "proj_unit",
};
function response(value: unknown, extra = {}) {
  return {
    id: "resp_unit",
    model: MODEL,
    service_tier: "default",
    status: "completed",
    usage,
    output: [
      {
        type: "message",
        id: "msg",
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
describe("Sol medium bounded interpretation (injected transport, no paid calls)", () => {
  it("keeps ambiguous network/cancelled usage reserved and never retries", async () => {
    const fetcher = vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new Error("aborted"));
            return;
          }
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const settle = vi.fn(async () => {}),
      model = new ResponsesProvider(cfg, fetcher);
    await expect(
      accountedCall(
        () => model.classify("unit", AbortSignal.timeout(30)),
        settle,
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(settle).not.toHaveBeenCalled();
  });
  it("prices cached/cache-write/input and reasoning-inclusive output once", () => {
    expect(pricedUsage(usage, 42)).toMatchObject({
      micro: 3290,
      reasoningTokens: 150,
      latencyMs: 42,
    });
    expect(
      (MODEL_REQUEST_BYTES + 2048) * 2.5 + MODEL_OUTPUT_TOKENS * 10,
    ).toBeLessThan(SOL_RESERVATION_MICRO);
    for (const u of [
      { ...usage, input_tokens: -1 },
      { ...usage, total_tokens: 0 },
      {
        ...usage,
        input_tokens_details: { cached_tokens: 1001, cache_write_tokens: 0 },
      },
      { ...usage, input_tokens_details: { cached_tokens: 0 } },
      { ...usage, output_tokens_details: { reasoning_tokens: 201 } },
      null,
    ])
      expect(pricedUsage(u, 0)).toBeNull();
  });
  it.each(["incomplete", "refusal", "schema", "tier", "usage"])(
    "handles %s with no retry and conservative settlement",
    async (kind) => {
      const fetcher = vi.fn(async () =>
        Response.json(
          response(
            { intent: kind === "schema" ? "approve-every-refund" : "receipt" },
            {
              ...(kind === "incomplete" ? { status: "incomplete" } : {}),
              ...(kind === "tier" ? { service_tier: "priority" } : {}),
              ...(kind === "usage" ? { usage: null } : {}),
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
          ),
        ),
      );
      const model = new ResponsesProvider(cfg, fetcher),
        settle = vi.fn(async () => {});
      const work = accountedCall(
        () => model.classify("unit", AbortSignal.timeout(1000)),
        settle,
      );
      if (kind === "usage") {
        await expect(work).resolves.toEqual({ intent: "receipt" });
        expect(settle).not.toHaveBeenCalled();
      } else {
        await expect(work).rejects.toBeInstanceOf(ModelFailure);
        if (kind !== "tier")
          expect(settle).toHaveBeenCalledWith(
            3290,
            expect.objectContaining({ reasoningTokens: 150 }),
          );
        else expect(settle).not.toHaveBeenCalled();
      }
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it("rejects whole-request overhead before dispatch and never substitutes model/endpoint", async () => {
    const transport = vi.fn();
    const model = new ResponsesProvider(cfg, transport);
    await expect(
      model.classify("x".repeat(19999), AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: "careos_context_too_large" });
    expect(transport).not.toHaveBeenCalled();
    expect(
      () =>
        new ResponsesProvider(
          { ...cfg, model: "gpt-5.4-mini-2026-03-17" },
          transport,
        ),
    ).toThrow();
  });
  it("keeps customer and Studio access independent, expiring and private", () => {
    const customer = "a".repeat(64),
      studio = "b".repeat(64),
      digest = (v: string) => createHash("sha256").update(v).digest("hex");
    const env = {
      APP_ORIGIN: "http://localhost:3000",
      CAREOS_EVALUATION_ENABLED: "true",
      CAREOS_EVALUATION_EXPIRES_AT: new Date(Date.now() + 60000).toISOString(),
      CAREOS_CUSTOMER_ACCESS_HASH: digest(customer),
      CAREOS_STUDIO_ACCESS_HASH: digest(studio),
    };
    expect(() =>
      assertEvaluationAccess("customer", customer, env),
    ).not.toThrow();
    expect(() => assertEvaluationAccess("studio", studio, env)).not.toThrow();
    for (const scope of ["customer", "studio"] as const) {
      expect(() => assertEvaluationAccess(scope, undefined, env)).toThrow();
      expect(() =>
        assertEvaluationAccess(
          scope,
          scope === "customer" ? studio : customer,
          env,
        ),
      ).toThrow();
    }
    expect(() =>
      assertEvaluationAccess("customer", customer, {
        ...env,
        APP_ORIGIN: "https://public.example",
      }),
    ).toThrow();
    expect(() =>
      assertEvaluationAccess("customer", customer, env, Date.now() + 120000),
    ).toThrow();
    expect(() =>
      parseCareConfig({
        CAREOS_PROVIDER: "responses",
        CAREOS_TOTAL_BUDGET_MICRO: "5000001",
      }),
    ).toThrow();
  });
  it("requires the reviewed project, model, provider-limit confirmation and $5 cap", () => {
    const env = {
      CAREOS_PROVIDER: "responses",
      CAREOS_LIVE_ENABLED: "true",
      DEMO_DATA_SOURCE: "database",
      CAREOS_API_KEY: "unit-only-not-a-real-api-key",
      CAREOS_PROJECT_ID: "proj_unit",
      CAREOS_PROVIDER_LIMIT_CONFIRMED: "true",
      CAREOS_DAILY_BUDGET_MICRO: "500000",
      CAREOS_TOTAL_BUDGET_MICRO: "5000000",
      CAREOS_BUDGET_ID: "fixed-test-budget",
      CAREOS_DATABASE_URL: "postgresql://localhost/sol_unit",
    };
    expect(parseCareConfig(env)).toMatchObject({
      model: "gpt-6.1-sol",
      mode: "responses",
    });
    for (const patch of [
      { CAREOS_MODEL: "gpt-5.4-mini-2026-03-17" },
      { CAREOS_PROJECT_ID: "" },
      { CAREOS_PROVIDER_LIMIT_CONFIRMED: "false" },
      { CAREOS_TOTAL_BUDGET_MICRO: "5000001" },
      { CAREOS_DAILY_BUDGET_MICRO: "5000001" },
      { CAREOS_TOTAL_BUDGET_MICRO: "119999" },
      { CAREOS_RESPONSES_BASE_URL: "http://localhost/provider" },
    ])
      expect(() => parseCareConfig({ ...env, ...patch })).toThrow();
  });
  it("preserves authoritative pending/verified state even when AI selects unrelated evidence", () => {
    const item = {
      state: "pending",
      providerStatus: "PENDING",
      verifiedAt: null,
      refundId: null,
    } as GuardianView;
    expect(adjustmentResolution(item).next).toContain(
      "Do not send a second refund",
    );
    expect(
      adjustmentResolution({
        ...item,
        state: "completed",
        verifiedAt: "2026-10-26",
      }).known,
    ).toContain("not a completed refund");
    expect(
      adjustmentResolution({
        ...item,
        state: "completed",
        providerStatus: "COMPLETED",
        verifiedAt: "2026-10-26",
        refundId: "unit",
      }).known,
    ).toContain("independently verified");
    const base = {
      ...deterministicAnswer(
        demoData,
        {
          requestId: crypto.randomUUID(),
          twinId: demoData.twins[0].id,
          revision: 1,
          message: "Explain refund",
        },
        "guardian",
      ),
      resolution: adjustmentResolution(item),
    };
    const selected = selectedEvidence(base, { factIds: ["fact-0"] });
    expect(selected.resolution).toEqual(base.resolution);
    expect(selected.text).toEqual(base.text);
    expect(() => selectedEvidence(base, { factIds: ["fact-999"] })).toThrow();
    expect(() =>
      selectedEvidence(base, { factIds: ["fact-0"], text: "Refund completed" }),
    ).toThrow();
    expect(evidencePacket(base)[0].text).not.toContain("SECRET");
  });
  it("uses the same Sol medium transport to plan multiple presentation-only commands", async () => {
    let body: Record<string, unknown> = {};
    const model = new ResponsesProvider(cfg, async (_url, init) => {
      body = JSON.parse(String(init!.body));
      return Response.json(
        response({
          outcome: "apply",
          commands: [
            { operation: "reset" },
            { operation: "add-summary" },
            { operation: "evidence" },
          ],
        }),
      );
    });
    const result = await planDashboard(
      model,
      "Separate pending adjustments and show evidence for verified refunds",
      illustrativeDataset,
      AbortSignal.timeout(1000),
    );
    expect(validateDashboardPlan(result.value).commands).toHaveLength(3);
    expect(body).toMatchObject({
      model: MODEL,
      reasoning: { effort: "medium" },
      store: false,
    });
    expect(body).not.toHaveProperty("tools");
    expect(JSON.stringify(body)).toContain("illustrative");
    for (const raw of [
      { outcome: "apply", commands: [{ operation: "approve" }] },
      { outcome: "apply", commands: [] },
      { outcome: "unsupported", commands: [{ operation: "reset" }] },
      {
        outcome: "apply",
        commands: [{ operation: "reset" }, { operation: "reset" }],
      },
    ])
      expect(() => validateDashboardPlan(raw)).toThrow();
    expect(() =>
      planDashboard(
        model,
        "Approve every refund",
        illustrativeDataset,
        AbortSignal.timeout(1000),
      ),
    ).toThrow();
  });
  it("answers an ambiguous next-step question from scoped facts without turning customer statements into payment evidence", async () => {
    const model = {
      classify: vi.fn(async () => ({
        value: { intent: "guardian" as const },
        micro: 1,
      })),
      explain: vi.fn(),
      selectEvidence: vi.fn(async () => ({
        value: { factIds: ["fact-1", "fact-2"] },
        micro: 1,
      })),
    };
    const answer = await resolveTurn({
      data: demoData,
      input: {
        requestId: crypto.randomUUID(),
        twinId: demoData.twins[0].id,
        revision: 1,
        message: "Do I need to do anything?",
      },
      sources: [],
      history: [],
      mode: "responses",
      model,
      call: async (work) => (await work(AbortSignal.timeout(1000))).value,
    });
    expect(answer.mode).toBe("live");
    expect(answer.resolution?.known).toContain("No recorded adjustment");
    expect(model.explain).not.toHaveBeenCalled();
    expect(model.selectEvidence).toHaveBeenCalledOnce();
  });
});
