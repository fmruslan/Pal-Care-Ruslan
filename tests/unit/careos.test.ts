import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { demoData } from "../../src/lib/demo/fixtures";
import { deterministicAnswer, interpret } from "../../src/lib/careos/tools";
import { MemoryStore } from "../../src/lib/careos/store";
import { assertOrigin, readTurn } from "../../src/lib/careos/security";

const input = () => ({
  requestId: randomUUID(),
  twinId: demoData.twins[0].id,
  revision: 1,
  message: "Where’s my receipt?",
});
describe("CareOS receipt vertical slice", () => {
  it("finds the actual scoped receipt with sample provenance and no model", () => {
    const answer = deterministicAnswer(demoData, input());
    expect(answer.mode).toBe("deterministic");
    expect(answer.actions[0].href).toBe(
      `/documents/${demoData.documents[0].id}`,
    );
    expect(answer.sources[1].label).toBe("Fictional sample document");
  });
  it("never borrows a receipt from a different Twin", () => {
    const answer = deterministicAnswer(demoData, {
      ...input(),
      twinId: demoData.twins[2].id,
    });
    expect(answer.outcome).toBe("missing");
    expect(answer.actions).toEqual([]);
  });
  it("requires a purchase selection for ambiguous requests", () => {
    expect(
      deterministicAnswer(demoData, { ...input(), twinId: null }).outcome,
    ).toBe("selection");
  });
  it("does not offer payments or invent replacement results", () => {
    expect(interpret("refund this purchase")).toBe("unsupported");
    expect(
      deterministicAnswer(demoData, {
        ...input(),
        message: "Find a replacement",
      }).text,
    ).toContain("later stage");
  });
  it("cookie-scopes conversations, deduplicates completed requests and limits in-flight turns", async () => {
    const store = new MemoryStore();
    const c = await store.create("owner");
    await expect(store.get(c.id, "other")).rejects.toMatchObject({
      status: 404,
    });
    const turn = input();
    expect(await store.claim(c.id, "owner", turn)).toBeNull();
    await expect(store.claim(c.id, "owner", input())).rejects.toMatchObject({
      status: 409,
    });
    const saved = {
      requestId: turn.requestId,
      message: turn.message,
      answer: deterministicAnswer(demoData, turn),
    };
    await store.finish(c.id, "owner", saved);
    expect(await store.claim(c.id, "owner", turn)).toEqual(saved);
    await store.clear(c.id, "owner");
    await expect(store.get(c.id, "owner")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("rejects foreign origins, extra fields and oversized inputs", async () => {
    expect(() =>
      assertOrigin(
        new Request("http://localhost", {
          headers: { Origin: "http://evil.test" },
        }),
        "http://localhost",
      ),
    ).toThrow();
    const request = (data: unknown) =>
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    await expect(
      readTurn(request({ ...input(), customerId: "forged" })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readTurn(request({ ...input(), message: "a".repeat(17000) })),
    ).rejects.toMatchObject({ status: 413 });
  });
});
