import { afterEach, describe, it, expect, vi } from "vitest";
import {
  readInsightPending,
  customerPlanApi,
  CustomerPlanHttpError,
  canForgetCustomerConversation,
} from "../../src/components/intelligence/customer-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("per-tab Insights recovery hint is not authority", () => {
  const now = Date.now();
  const value = {
    requestId: "11111111-1111-4111-8111-111111111111",
    conversationId: "22222222-2222-4222-8222-222222222222",
    message: "Show my documents",
    createdAt: now,
  };
  it("retains original request and conversation identity without dispatching", () => {
    expect(readInsightPending(JSON.stringify(value), now)).toEqual(value);
  });
  it("retains only a strict bounded permitted plan for explicit replay", () => {
    const plan = { outcome: "apply", commands: [{ operation: "documents" }] };
    expect(
      readInsightPending(JSON.stringify({ ...value, plan }), now)?.plan,
    ).toEqual(plan);
    expect(
      readInsightPending(
        JSON.stringify({
          ...value,
          plan: {
            outcome: "apply",
            commands: [{ operation: "refund", amount: 2000 }],
          },
        }),
        now,
      ),
    ).toBeNull();
    expect(
      readInsightPending(
        JSON.stringify({ ...value, token: "not-a-capability" }),
        now,
      ),
    ).toBeNull();
  });
  it("rejects expired, future, oversized or malformed stored hints", () => {
    for (const raw of [
      "bad",
      "x".repeat(8193),
      JSON.stringify({ ...value, createdAt: now + 1 }),
      JSON.stringify({ ...value, createdAt: now - 86400000 }),
      JSON.stringify({ ...value, message: "x".repeat(501) }),
      JSON.stringify({ ...value, conversationId: "not-a-uuid" }),
    ])
      expect(readInsightPending(raw, now)).toBeNull();
  });
});

describe("customer planning HTTP failures and explicit forgetting", () => {
  const missing = "careos_conversation_not_found";
  const conversationId = "22222222-2222-4222-8222-222222222222";

  it("permits only a typed, confirmed missing-conversation 404", () => {
    expect(
      canForgetCustomerConversation(new CustomerPlanHttpError(404, missing)),
    ).toBe(true);
    for (const error of [
      new CustomerPlanHttpError(403, missing),
      new CustomerPlanHttpError(409, missing),
      new CustomerPlanHttpError(503, missing),
      new CustomerPlanHttpError(404),
      new CustomerPlanHttpError(404, "unknown_error"),
      new Error("Network unavailable"),
      new DOMException("The request was aborted", "AbortError"),
      { status: 404, code: missing },
      null,
    ])
      expect(canForgetCustomerConversation(error)).toBe(false);
  });

  it.each([404, 403, 409, 429, 503])(
    "preserves HTTP %s without echoing arbitrary server errors",
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "PRIVATE postgresql://secret" }, { status }),
        );
      vi.stubGlobal("fetch", fetch);
      const error = await customerPlanApi(
        "DELETE",
        undefined,
        conversationId,
      ).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(CustomerPlanHttpError);
      expect(error).toMatchObject({
        status,
        code: "customer_plan_unavailable",
        message: "customer_plan_unavailable",
      });
      expect(JSON.stringify(error)).not.toMatch(/PRIVATE|postgresql:|secret/);
      expect(canForgetCustomerConversation(error)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("recognizes the bounded exact authenticated-route 404 body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: missing }, { status: 404 })),
    );
    const error = await customerPlanApi(
      "DELETE",
      undefined,
      conversationId,
    ).catch((error: unknown) => error);
    expect(error).toMatchObject({ status: 404, code: missing });
    expect(canForgetCustomerConversation(error)).toBe(true);
  });

  it.each([
    () =>
      new Response("<html>Missing</html>", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      }),
    () =>
      new Response("bad JSON", {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    () =>
      Response.json(
        { error: missing, arbitrary: "server detail" },
        { status: 404 },
      ),
    () =>
      new Response(`${JSON.stringify({ error: missing })}${" ".repeat(1024)}`, {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("Interrupted body"));
          },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
  ])(
    "does not treat an unknown/malformed/oversized/interrupted 404 as permission to forget",
    async (response) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
      const error = await customerPlanApi(
        "DELETE",
        undefined,
        conversationId,
      ).catch((error: unknown) => error);
      expect(error).toMatchObject({
        status: 404,
        code: "customer_plan_unavailable",
      });
      expect(canForgetCustomerConversation(error)).toBe(false);
    },
  );

  it("keeps network ambiguity distinct and never retries", async () => {
    const network = new TypeError("Failed to fetch");
    const fetch = vi.fn().mockRejectedValue(network);
    vi.stubGlobal("fetch", fetch);
    await expect(
      customerPlanApi("DELETE", undefined, conversationId),
    ).rejects.toBe(network);
    expect(canForgetCustomerConversation(network)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains the 60-second deadline, caller cancellation and request envelope", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValue(Response.json({ cleared: true }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      customerPlanApi("DELETE", undefined, conversationId, controller.signal),
    ).resolves.toEqual({ cleared: true });
    expect(timeout).toHaveBeenCalledWith(60000);
    expect(fetch).toHaveBeenCalledWith(
      `/api/intelligence/customer/plan?conversationId=${conversationId}`,
      expect.objectContaining({
        method: "DELETE",
        cache: "no-store",
        body: undefined,
      }),
    );
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });
});
