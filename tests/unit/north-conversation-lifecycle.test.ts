import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConversation } from "../../src/components/careos/use-conversation";
import {
  contextOf,
  type CareTurn,
  type Conversation,
  type TurnInput,
} from "../../src/lib/careos/contracts";
import { demoData } from "../../src/lib/demo/fixtures";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = contextOf({
  twin: demoData.twins[0],
  product: demoData.products[0],
});
const input = (n: number): TurnInput => ({
  requestId: id(n),
  twinId: context.twinId,
  revision: 1,
  message: `Question ${n}`,
});
function turn(value: TurnInput): CareTurn {
  return {
    requestId: value.requestId,
    message: value.message,
    answer: {
      context,
      revision: 1,
      text: "Saved answer",
      outcome: "answered",
      mode: "fixture",
      steps: [],
      sources: [],
      actions: [],
    },
  };
}
function mount(channel: "care" | "records" = "care") {
  let hook!: ReturnType<typeof useConversation>;
  function Host() {
    hook = useConversation(channel);
    return null;
  }
  // No effects or DOM needed: exercise transport/ref guards, not rendered UX.
  renderToString(createElement(Host));
  return hook;
}
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}
afterEach(() => vi.unstubAllGlobals());

describe("North non-destructive conversation lifecycle", () => {
  it.each(["care", "records"] as const)(
    "starts %s lazily, isolates server history and restores by GET without DELETE",
    async (channel) => {
      storage();
      const saved = new Map<string, Conversation>();
      const requests: { method: string; path: string }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          const method = init.method ?? "GET";
          requests.push({ method, path: url });
          const parts = url.split("/");
          let value: Conversation | CareTurn;
          if (method === "POST" && parts.at(-1) === "conversations") {
            const key = id(100 + saved.size);
            value = {
              id: key,
              expiresAt: "2026-11-11T00:00:00.000Z",
              turns: [],
            };
            saved.set(key, value);
          } else if (method === "POST") {
            const conversation = saved.get(parts.at(-2)!)!;
            value = turn(JSON.parse(init.body as string));
            conversation.turns.push(value);
          } else value = saved.get(parts.at(-1)!)!;
          return new Response(JSON.stringify(value), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );
      const hook = mount(channel);
      expect(hook.start()).toBe(true);
      expect(requests).toEqual([]);
      expect(await hook.restore(false)).toBeNull();
      expect(requests).toEqual([]);
      expect(await hook.send(input(1), context)).toBe(true);
      const original = structuredClone(saved.get(id(100))!);
      expect(hook.detach()).toBe(true);
      const beforeNew = requests.length;
      expect(await hook.restore(false)).toBeNull();
      expect(requests).toHaveLength(beforeNew);
      expect(await hook.send(input(2), context)).toBe(true);
      expect(saved.get(id(101))?.turns.map((value) => value.requestId)).toEqual(
        [id(2)],
      );
      expect(saved.get(id(100))).toEqual(original);
      expect(hook.detach()).toBe(true);
      const beforeRestore = requests.length;
      expect(await hook.restore(id(100))).toEqual(original);
      expect(requests.slice(beforeRestore)).toEqual([
        {
          method: "GET",
          path: `/api/careos/${channel === "records" ? "records/" : ""}conversations/${id(100)}`,
        },
      ]);
      expect(requests.some((request) => request.method === "DELETE")).toBe(
        false,
      );
    },
  );

  it("blocks detach and other-chat restore after dispatch uncertainty, retaining the original GET-only envelope", async () => {
    const hints = storage();
    const conversation: Conversation = {
      id: id(100),
      expiresAt: "2026-11-11T00:00:00.000Z",
      turns: [],
    };
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push(`${init.method} ${url}`);
        if (url.endsWith("/turns"))
          throw new Error("uncertain network response");
        return new Response(JSON.stringify(conversation), { status: 200 });
      }),
    );
    const hook = mount();
    await hook.send(input(1), context);
    const original = hints.get("palcare-careos-pending-v1");
    expect(original).toBeDefined();
    expect(hook.canDetach()).toBe(false);
    expect(hook.detach()).toBe(false);
    expect(await hook.restore(id(101))).toBeNull();
    const count = requests.length;
    await hook.check();
    expect(requests.slice(count)).toEqual([
      `GET /api/careos/conversations/${id(100)}`,
    ]);
    expect(hints.get("palcare-careos-pending-v1")).toBe(original);
    expect(requests.filter((value) => value.includes("/turns"))).toHaveLength(
      1,
    );
  });

  it("reloads an unknown original ID through GET and allows detachment only after its saved turn is found", async () => {
    const hints = storage();
    hints.set(
      "palcare-careos-pending-v1",
      JSON.stringify({
        input: input(1),
        context,
        conversationId: id(100),
        createdAt: Date.now(),
      }),
    );
    const saved: Conversation = {
      id: id(100),
      expiresAt: "2026-11-11T00:00:00.000Z",
      turns: [turn(input(1))],
    };
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("GET");
      return new Response(JSON.stringify(saved), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const hook = mount();
    expect(hook.detach()).toBe(false);
    expect(await hook.restore(id(100))).toEqual(saved);
    expect(hints.has("palcare-careos-pending-v1")).toBe(false);
    expect(hook.detach()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
