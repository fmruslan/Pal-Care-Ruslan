import { afterEach, describe, it, expect, vi } from "vitest";
import {
  readInsightPending,
  readInsightHistory,
  insightHistoryKey,
  customerQuestionText,
  customerPlanApi,
  CustomerPlanHttpError,
  canForgetCustomerConversation,
} from "../../src/components/intelligence/customer-client";
import type { CareTurn } from "../../src/lib/careos/contracts";
import { MemoryStore } from "../../src/lib/careos/store";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saved customer question display never rewrites the original request envelope", () => {
  const unavailable = "Saved Insights question (display text unavailable).";

  it.each([
    "Show my documents",
    "  Keep my spacing\nand line breaks.  ",
    "",
    "x".repeat(500),
  ])("preserves bounded legacy plain text exactly: %#", (message) => {
    expect(customerQuestionText(message)).toBe(message);
  });

  it.each([
    "Show my documents",
    "  Keep my spacing\nand line breaks.  ",
    "x".repeat(500),
  ])(
    "decodes only the strict original customer-studio envelope: %#",
    (message) => {
      const envelope = JSON.stringify({ scope: "customer-studio", message });
      expect(customerQuestionText(envelope)).toBe(message);
      expect(customerQuestionText(` \n${envelope}\t `)).toBe(message);
    },
  );

  it.each([
    "x".repeat(501),
    "{not valid JSON",
    " \n {not valid JSON",
    JSON.stringify({ scope: "merchant-studio", message: "PRIVATE" }),
    JSON.stringify({ scope: "customer-studio", message: "" }),
    JSON.stringify({
      scope: "customer-studio",
      message: "PRIVATE".repeat(100),
    }),
    JSON.stringify({ scope: "customer-studio", message: 123 }),
    JSON.stringify({ scope: "customer-studio" }),
    JSON.stringify({ message: "PRIVATE" }),
    JSON.stringify({
      scope: "customer-studio",
      message: "PRIVATE",
      token: "UNIT-ONLY-SECRET",
    }),
    JSON.stringify({
      scope: "customer-studio",
      message: "PRIVATE",
      plan: { outcome: "apply", commands: [] },
    }),
    JSON.stringify({
      scope: "customer-studio",
      message: "PRIVATE",
      history: [],
    }),
  ])(
    "uses one safe label for malformed, oversized or injected envelopes: %#",
    (message) => {
      expect(customerQuestionText(message)).toBe(unavailable);
      expect(customerQuestionText(message)).not.toMatch(
        /PRIVATE|SECRET|merchant-studio/,
      );
    },
  );

  it("leaves original saved text and request fingerprints intact after decoding a display label", async () => {
    const store = new MemoryStore();
    const conversation = await store.create("unit-customer-studio-owner");
    const message =
      ' { "message" : "Show my documents", "scope" : "customer-studio" } ';
    const input = Object.freeze({
      requestId: "11111111-1111-4111-8111-111111111111",
      twinId: null,
      revision: 0,
      message,
    });
    const saved: CareTurn = {
      requestId: input.requestId,
      message: input.message,
      answer: {
        outcome: "answered",
        mode: "deterministic",
        context: null,
        revision: input.revision,
        text: "Original saved result",
        steps: [],
        sources: [],
        actions: [],
      },
    };
    await store.claim(conversation.id, "unit-customer-studio-owner", input);
    await store.finish(conversation.id, "unit-customer-studio-owner", saved);
    const label = customerQuestionText(saved.message);
    expect(label).toBe("Show my documents");
    expect(saved.message).toBe(message);
    expect(
      await store.claim(conversation.id, "unit-customer-studio-owner", input),
    ).toBe(saved);
    await expect(
      store.claim(conversation.id, "unit-customer-studio-owner", {
        ...input,
        message: label,
      }),
    ).rejects.toMatchObject({ code: "careos_request_conflict", status: 409 });
    expect(
      (await store.get(conversation.id, "unit-customer-studio-owner")).turns[0]
        .message,
    ).toBe(message);
  });
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

describe("completed Insights history hints contain bounded IDs, never authority or transcripts", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const id = (index: number) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const entry = {
    requestId: id(1),
    conversationId: id(2),
    createdAt: now,
  };

  it("keeps the compatible key and original owned-read identities without dispatching", () => {
    const fetch = vi.fn(() => {
      throw new Error("Reading browser hints must not fetch, replay or infer");
    });
    vi.stubGlobal("fetch", fetch);
    expect(insightHistoryKey).toBe("palcare-insights-history-v1");
    const restored = readInsightHistory(JSON.stringify([entry]), now);
    expect(restored).toEqual([entry]);
    expect(Object.keys(restored[0]).sort()).toEqual([
      "conversationId",
      "createdAt",
      "requestId",
    ]);
    expect(canForgetCustomerConversation(restored[0])).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts zero through forty entries and rejects forty-one without truncating a forged payload", () => {
    const entries = Array.from({ length: 40 }, (_, index) => ({
      ...entry,
      requestId: id(index + 100),
    }));
    for (const values of [[], entries.slice(0, 1), entries]) {
      expect(readInsightHistory(JSON.stringify(values), now)).toEqual(values);
    }
    expect(
      readInsightHistory(
        JSON.stringify([...entries, { ...entry, requestId: id(999) }]),
        now,
      ),
    ).toEqual([]);
  });

  it("enforces the exact 8192-character raw limit even for otherwise valid JSON", () => {
    const raw = JSON.stringify([entry]);
    expect(readInsightHistory(raw.padEnd(8192, " "), now)).toEqual([entry]);
    expect(readInsightHistory(raw.padEnd(8193, " "), now)).toEqual([]);
  });

  it("expires exactly at 24 hours and never accepts an entry from the future", () => {
    const raw = JSON.stringify([entry]);
    expect(readInsightHistory(raw, now)).toEqual([entry]);
    expect(readInsightHistory(raw, now + 86400000 - 1)).toEqual([entry]);
    expect(readInsightHistory(raw, now + 86400000)).toEqual([]);
    expect(readInsightHistory(raw, now - 1)).toEqual([]);
  });

  it("filters expired/future entries independently while retaining valid identity order and original times", () => {
    const older = { ...entry, requestId: id(3), createdAt: now - 86400000 + 1 };
    const future = { ...entry, requestId: id(4), createdAt: now + 1 };
    const expired = { ...entry, requestId: id(5), createdAt: now - 86400000 };
    const entries = [future, older, expired, entry];
    const before = structuredClone(entries);
    expect(readInsightHistory(JSON.stringify(entries), now)).toEqual([
      older,
      entry,
    ]);
    expect(entries).toEqual(before);
  });

  it.each([
    null,
    "",
    "bad json",
    "null",
    "{}",
    "42",
    "true",
    JSON.stringify(entry),
    JSON.stringify({ entries: [entry] }),
    JSON.stringify([{}]),
    JSON.stringify([null]),
    JSON.stringify([[entry]]),
  ])(
    "rejects malformed storage rather than treating it as saved history: %#",
    (raw) => {
      expect(readInsightHistory(raw, now)).toEqual([]);
    },
  );

  it.each([
    { requestId: "not-a-uuid" },
    { conversationId: "../../other-conversation" },
    { conversationId: null },
    { requestId: "" },
    { createdAt: 0 },
    { createdAt: -1 },
    { createdAt: now + 0.5 },
    { createdAt: String(now) },
    { createdAt: null },
  ])(
    "fails closed for a malformed entry even beside a valid one: %j",
    (change) => {
      expect(
        readInsightHistory(
          JSON.stringify([entry, { ...entry, ...change }]),
          now,
        ),
      ).toEqual([]);
    },
  );

  it.each([
    { token: "unit-only-not-a-capability" },
    { accessToken: "unit-only-not-a-credential" },
    { credentials: { approved: true } },
    { message: "Show my documents" },
    { messages: [] },
    { plan: { outcome: "apply", commands: [{ operation: "documents" }] } },
    { history: [] },
    { turns: [] },
    { answer: "A forged saved result" },
    { owner: true },
    { scope: "customer-studio" },
    { remaining: 300 },
  ])(
    "rejects credentials, content, plans and authority fields rather than stripping them: %j",
    (injection) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect(
        readInsightHistory(
          JSON.stringify([entry, { ...entry, ...injection }]),
          now,
        ),
      ).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
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
