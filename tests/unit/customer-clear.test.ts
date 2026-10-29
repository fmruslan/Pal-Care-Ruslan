import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useInsightsConversation,
  type InsightsRun,
} from "../../src/components/intelligence/use-insights-conversation";
import { insightPendingKey } from "../../src/components/intelligence/customer-client";

// Inject only the hook's state/ref storage. This exercises Clear's actual control
// flow without a browser, renderer dependency, database or model call.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", () => ({
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] =
          typeof value === "function" ? value(hooks.values[index]) : value;
      },
    ];
  },
}));

const conversationId = "22222222-2222-4222-8222-222222222222";
const requestId = "11111111-1111-4111-8111-111111111111";
const missing = "careos_conversation_not_found";
const pending = () => ({
  requestId,
  conversationId,
  message: "Show my documents",
  createdAt: Date.now(),
});
let storage: Map<string, string>;
const reset = { current: vi.fn() };
const handler = { current: vi.fn<InsightsRun>() };
function Render() {
  return useInsightsConversation(handler, reset);
}
function render() {
  hooks.cursor = 0;
  return Render();
}

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  reset.current.mockReset();
  handler.current.mockReset();
  storage = new Map([["accounting-untouched", "unknown reservation retained"]]);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit customer Clear after a missing/expired conversation", () => {
  it("does not clear on GET 404, then clears the hint on an explicit authenticated DELETE 404", async () => {
    const original = JSON.stringify(pending());
    storage.set(insightPendingKey, original);
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ error: missing }, { status: 404 }),
      );
    vi.stubGlobal("fetch", fetch);
    render().restore();
    expect(render().pending?.input.requestId).toBe(requestId);
    await render().check();
    expect(storage.get(insightPendingKey)).toBe(original);
    expect(reset.current).not.toHaveBeenCalled();
    await render().clear();
    expect(storage.has(insightPendingKey)).toBe(false);
    expect(render()).toMatchObject({
      pending: null,
      conversation: null,
      recoverable: null,
      phase: "idle",
      error: "",
    });
    expect(reset.current).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual([
      "GET",
      "DELETE",
    ]);
    expect(handler.current).not.toHaveBeenCalled();
    expect(storage.get("accounting-untouched")).toBe(
      "unknown reservation retained",
    );
  });

  it("clears transcript/recovery state and the remembered server ID, without another dispatch", async () => {
    handler.current.mockImplementation(
      async (_message, _id, _signal, recovery) => {
        recovery.planning(conversationId);
        return {
          outcome: "answered",
          mode: "fixture",
          context: null,
          revision: 0,
          text: "Synthetic saved view",
          steps: [],
          sources: [],
          actions: [],
        };
      },
    );
    await render().send("Show my purchases");
    expect(render().conversation?.turns).toHaveLength(1);
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ error: missing }, { status: 404 }),
      );
    vi.stubGlobal("fetch", fetch);
    await render().clear();
    expect(render().conversation).toBeNull();
    expect(reset.current).toHaveBeenCalledTimes(1);
    await render().clear();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
    expect(handler.current).toHaveBeenCalledTimes(1);
    expect(storage.get("accounting-untouched")).toBe(
      "unknown reservation retained",
    );
  });

  it.each([403, 409, "network", "unknown-404"] as const)(
    "retains the original hint on DELETE %s despite an earlier GET 404",
    async (failure) => {
      const original = JSON.stringify(pending());
      storage.set(insightPendingKey, original);
      const fetch = vi.fn().mockImplementation(async (_url, options) => {
        if (options.method === "GET")
          return Response.json({ error: missing }, { status: 404 });
        if (failure === "network") throw new TypeError("Failed to fetch");
        return Response.json(
          { error: failure === "unknown-404" ? "unknown" : missing },
          { status: failure === "unknown-404" ? 404 : failure },
        );
      });
      vi.stubGlobal("fetch", fetch);
      render().restore();
      await render().check();
      await render().clear();
      expect(storage.get(insightPendingKey)).toBe(original);
      expect(render().pending?.input.requestId).toBe(requestId);
      expect(render().error).toContain("could not be cleared");
      expect(reset.current).not.toHaveBeenCalled();
      expect(handler.current).not.toHaveBeenCalled();
      expect(fetch.mock.calls.map(([, options]) => options.method)).toEqual([
        "GET",
        "DELETE",
      ]);
    },
  );
});
