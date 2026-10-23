import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { demoData } from "../../src/lib/demo/fixtures";
import { deterministicAnswer, interpret } from "../../src/lib/careos/tools";
import { MemoryStore } from "../../src/lib/careos/store";
import { assertOrigin, readTurn } from "../../src/lib/careos/security";
import {
  referenceSource,
  retrievePassages,
  sourceSchema,
} from "../../src/lib/careos/knowledge";
import { fixtureCare } from "../../src/lib/careos/providers/fixture";
import { buildBriefing } from "../../src/lib/careos/briefing";

const input = () => ({
  requestId: randomUUID(),
  twinId: demoData.twins[0].id,
  revision: 1,
  message: "Where’s my receipt?",
});
describe("CareOS receipt vertical slice", () => {
  it("permits only reviewed official HTTPS source destinations", () => {
    expect(sourceSchema.safeParse(referenceSource).success).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "https://evil.example/documentation/",
      "https://www.raspberrypi.com.evil.example/documentation/",
      "http://www.raspberrypi.com/documentation/",
      "https://user:password@www.raspberrypi.com/documentation/",
    ])
      expect(sourceSchema.safeParse({ ...referenceSource, url }).success).toBe(
        false,
      );
  });
  it("never presents the reference sample's zero placeholder as a real product price", () => {
    const answer = deterministicAnswer(demoData, {
      ...input(),
      twinId: demoData.twins[3].id,
      message: "How much did I pay?",
    });
    expect(answer.text).toContain("not a product price");
    expect(answer.text).not.toContain("$0.00");
  });
  it("builds only source-backed briefing suggestions and never promotes sample events to monitoring", () => {
    const items = buildBriefing(demoData, [referenceSource]);
    expect(items).toHaveLength(2);
    expect(items[0].provenance).toContain("sample");
    expect(items[1].sourceHref).toContain(referenceSource.id);
    expect(
      buildBriefing({ ...demoData, twins: [], documents: [] }, []),
    ).toEqual([]);
  });
  it("retrieves exact-model relevant evidence, never a different product's manual", () => {
    expect(
      retrievePassages([referenceSource], demoData.products[0], "care")
        .passages,
    ).toEqual([]);
    const evidence = retrievePassages(
      [referenceSource],
      demoData.products[3],
      "How do I shut it down?",
    );
    expect(evidence.passages).toHaveLength(1);
    const answer = fixtureCare(
      deterministicAnswer(demoData, {
        ...input(),
        twinId: demoData.twins[3].id,
        message: "Product care",
      }),
      evidence.passages,
    );
    expect(answer.mode).toBe("fixture");
    expect(answer.text).toContain("Raspberry Pi OS");
    expect(answer.sources[0].excerpt).toContain("Raspberry Pi 5");
    expect(
      retrievePassages(
        [referenceSource],
        demoData.products[3],
        "clean with water",
      ).passages,
    ).toEqual([]);
    expect(
      retrievePassages(
        [{ ...referenceSource, status: "conflicting" }],
        demoData.products[3],
        "care",
      ).conflict,
    ).toBe(true);
    expect(
      retrievePassages(
        [{ ...referenceSource, status: "withdrawn" }],
        demoData.products[3],
        "care",
      ).passages,
    ).toEqual([]);
  });
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
