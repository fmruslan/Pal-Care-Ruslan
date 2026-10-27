import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { DemoData, PurchaseTwin } from "../../src/db/schema";
import {
  contextOf,
  turnSchema,
  type CareTurn,
  type TurnInput,
} from "../../src/lib/careos/contracts";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { resolveTurn } from "../../src/lib/careos/service";
import { MemoryStore } from "../../src/lib/careos/store";
import { demoData } from "../../src/lib/demo/fixtures";

const input = (message: string, twinId: string | null = null): TurnInput => ({
  requestId: randomUUID(),
  twinId,
  revision: 1,
  message,
});
const ask = (data: DemoData, turn: TurnInput) =>
  resolveTurn({ data, input: turn, sources: [], history: [], mode: "fixture" });

function sameModelData() {
  const data = structuredClone(demoData);
  // Synthetic unit-only evidence. Nothing is persisted or sent to a provider.
  const sandbox: PurchaseTwin = {
    ...data.twins[0],
    id: randomUUID(),
    purchasedOn: "2026-10-22",
    purchasePriceMinor: 12900,
    origin: "sandbox",
    checkoutOrderId: randomUUID(),
    paypalOrderId: "UNIT-ONLY-ORDER",
    paypalCaptureId: "UNIT-ONLY-CAPTURE",
    verifiedAt: "2026-10-22T23:05:00Z",
    createdAt: "2026-10-27T08:00:00Z",
    productSnapshot: {
      ...data.products[0],
      currency: "USD",
      merchantName: data.merchant.name,
    },
  };
  data.twins.push(sandbox);
  const receipt = {
    id: randomUUID(),
    twinId: sandbox.id,
    title: "Isolated-test Sandbox receipt",
    kind: "receipt",
    origin: "sandbox",
    content:
      "Synthetic completed-payment evidence for isolated unit tests only.",
  };
  data.documents.push(receipt);
  return { data, sandbox, receipt };
}

describe("CareOS server-derived purchase choices", () => {
  it("keeps same-model purchases distinct by authorized context, original date and provenance", async () => {
    const { data, sandbox } = sameModelData();
    const answer = await ask(data, input("Find my headphones receipt"));
    expect(answer.outcome).toBe("selection");
    expect(answer.mode).toBe("deterministic");
    expect(answer.context).toBeNull();
    expect(answer.purchaseChoices).toEqual([
      {
        context: contextOf({ twin: data.twins[0], product: data.products[0] }),
        purchasedOn: "2026-10-18",
        provenance: "Sample",
      },
      {
        context: contextOf({ twin: sandbox, product: data.products[0] }),
        purchasedOn: "2026-10-22",
        provenance: "Verified Sandbox",
      },
    ]);
    expect(answer.sources).toEqual([]);
    expect(answer.steps).toEqual([]);
    expect(answer.actions.map((a) => a.href)).toEqual([
      `/vault/${data.twins[0].id}`,
      `/vault/${sandbox.id}`,
    ]);
    expect(answer.actions[1].label).toContain("Oct 22, 2026");
    expect(answer.actions[1].label).toContain("Verified Sandbox");
  });

  it("uses the original purchase snapshot rather than a renamed catalog product", async () => {
    const { data, sandbox } = sameModelData();
    data.products[0].name = "Renamed catalog item";
    data.products[0].model = "F-99";
    const answer = await ask(data, input("Find my receipt"));
    const choice = answer.purchaseChoices?.find(
      (c) => c.context.twinId === sandbox.id,
    );
    expect(choice?.context.name).toBe("Everyday headphones");
    expect(choice?.context.model).toBe("F-01");
    expect(choice?.purchasedOn).toBe(sandbox.purchasedOn);
    expect(choice?.provenance).toBe("Verified Sandbox");
  });

  it("filters product matches before the eight-choice limit without silently switching context", async () => {
    const { data, sandbox } = sameModelData();
    const headphones = data.twins[0];
    const kettle = data.twins[1];
    data.twins = [
      ...Array.from({ length: 10 }, () => ({ ...kettle, id: randomUUID() })),
      headphones,
      sandbox,
    ];
    const turn = input("Find my headphones receipt", data.twins[0].id);
    const fail = vi.fn(async () => {
      throw new Error("Selection must not load evidence or dispatch a model");
    });
    const answer = await resolveTurn({
      data,
      input: turn,
      sources: [],
      history: [],
      mode: "responses",
      model: { classify: fail, explain: fail },
      call: fail,
      load: { knowledge: fail, guardian: fail, recall: fail },
    });
    expect(answer.outcome).toBe("selection");
    expect(answer.context?.twinId).toBe(turn.twinId);
    expect(answer.purchaseChoices?.map((c) => c.context.twinId)).toEqual([
      headphones.id,
      sandbox.id,
    ]);
    expect(answer.actions.map((a) => a.href)).toEqual([
      `/vault/${headphones.id}`,
      `/vault/${sandbox.id}`,
    ]);
    expect(answer.sources).toEqual([]);
    expect(fail).not.toHaveBeenCalled();
  });

  it("checks customer, merchant and product scope before limiting choices", async () => {
    const data = structuredClone(demoData);
    const twin = data.twins[0];
    const unauthorized = [
      { ...twin, id: randomUUID(), customerId: randomUUID() },
      { ...twin, id: randomUUID(), merchantId: randomUUID() },
      { ...twin, id: randomUUID(), productId: randomUUID() },
    ];
    const authorized = Array.from({ length: 10 }, () => ({
      ...twin,
      id: randomUUID(),
    }));
    data.twins = [...unauthorized, ...authorized];
    const answer = await ask(data, input("Find my receipt"));
    expect(answer.purchaseChoices).toHaveLength(8);
    expect(answer.purchaseChoices?.map((c) => c.context.twinId)).toEqual(
      authorized.slice(0, 8).map((t) => t.id),
    );
  });

  it.each(["Show Forma F-03 receipt", "Find my F-03 receipt"])(
    "offers a matching model without substituting its receipt: %s",
    async (message) => {
      const answer = await ask(demoData, input(message, demoData.twins[0].id));
      expect(answer.outcome).toBe("selection");
      expect(answer.context?.twinId).toBe(demoData.twins[0].id);
      expect(answer.purchaseChoices?.map((c) => c.context.twinId)).toEqual([
        demoData.twins[2].id,
      ]);
      expect(answer.sources).toEqual([]);
      expect(answer.actions.map((a) => a.href)).toEqual([
        `/vault/${demoData.twins[2].id}`,
      ]);
    },
  );

  it.each([
    "Find my JBL Tune 770NC receipt",
    "Show proof of payment for JBL headphones",
    "Find my Insignia NS-AF34D2 receipt",
  ])("offers no unrelated receipt or choices for %s", async (message) => {
    const answer = await ask(demoData, input(message, demoData.twins[0].id));
    expect(answer.outcome).toBe("selection");
    expect(answer.purchaseChoices).toEqual([]);
    expect(answer.sources).toEqual([]);
    expect(answer.steps).toEqual([]);
    expect(answer.actions).toEqual([
      { label: "Review saved purchases", href: "/vault" },
    ]);
  });

  it("answers only a new deliberate follow-up under the chosen purchase, preserving the original question", async () => {
    const { data, sandbox, receipt } = sameModelData();
    const turn = input("Find my headphones receipt");
    const selection = await ask(data, turn);
    const savedSelection = structuredClone(selection);
    const choice = selection.purchaseChoices!.find(
      (c) => c.context.twinId === sandbox.id,
    )!;
    const followUp: TurnInput = {
      ...turn,
      requestId: randomUUID(),
      twinId: choice.context.twinId,
      revision: turn.revision + 1,
    };
    expect(followUp.requestId).not.toBe(turn.requestId);
    expect(followUp.message).toBe(turn.message);
    expect(turn.twinId).toBeNull();
    const answer = await ask(data, followUp);
    expect(answer.outcome).toBe("answered");
    expect(answer.context?.twinId).toBe(sandbox.id);
    expect(answer.purchaseChoices).toBeUndefined();
    expect(answer.actions).toEqual([
      { label: "Open receipt", href: `/documents/${receipt.id}` },
    ]);
    expect(answer.sources.map((s) => s.id)).toEqual([sandbox.id, receipt.id]);
    expect(answer.sources[1].label).toBe("Verified Sandbox receipt");
    expect(selection).toEqual(savedSelection);
  });

  it("never borrows another purchase's receipt even when both purchases have the same model", async () => {
    const { data, sandbox, receipt } = sameModelData();
    const sample = await ask(data, input("Find my receipt", data.twins[0].id));
    expect(sample.actions.map((a) => a.href)).toEqual([
      `/documents/${data.documents[0].id}`,
    ]);
    data.documents = data.documents.filter((d) => d.id !== receipt.id);
    const missing = await ask(data, input("Find my receipt", sandbox.id));
    expect(missing.outcome).toBe("missing");
    expect(missing.actions).toEqual([]);
    expect(missing.sources.map((s) => s.id)).toEqual([sandbox.id]);
  });

  it.each(["Show the manufacturer manual", "How do I clean these?"])(
    "provides a saved-documents next step when exact-model guidance is missing: %s",
    async (message) => {
      const answer = await resolveTurn({
        data: demoData,
        input: input(message, demoData.twins[0].id),
        sources: [referenceSource],
        history: [],
        mode: "fixture",
      });
      expect(answer.outcome).toBe("missing");
      expect(answer.text).toContain("saved documents");
      expect(answer.actions[0].href).toBe(
        `/vault/${demoData.twins[0].id}#documents-heading`,
      );
      expect(answer.sources.map((s) => s.id)).toEqual([demoData.twins[0].id]);
    },
  );

  it("leads with saved dates and amounts while retaining sample and Sandbox payment provenance", async () => {
    const { data, sandbox } = sameModelData();
    const sampleDate = await ask(
      data,
      input("When did I buy this?", data.twins[0].id),
    );
    expect(sampleDate.text).toBe(
      "Purchase date: Oct 18, 2026. This is a fictional sample purchase, not a verified payment.",
    );
    const sandboxDate = await ask(
      data,
      input("When did I buy this?", sandbox.id),
    );
    expect(sandboxDate.text).toBe(
      "Purchase date: Oct 22, 2026. Payment was verified server-side in PayPal Sandbox; no real money was used.",
    );
    const amount = await ask(data, input("How much did I pay?", sandbox.id));
    expect(amount.text).toBe(
      "Saved purchase total: $129.00. Payment was verified server-side in PayPal Sandbox; no real money was used.",
    );
    const both = await ask(
      data,
      input("When did I buy this and how much did I pay?", sandbox.id),
    );
    expect(both.text).toBe(
      "Purchase date: Oct 22, 2026. Saved purchase total: $129.00. Payment was verified server-side in PayPal Sandbox; no real money was used.",
    );
    const payment = await ask(
      data,
      input("When was this payment captured?", sandbox.id),
    );
    expect(payment.text).toContain("not a fresh PayPal status check");
  });

  it("keeps choice metadata server-only and replays historical turns without the optional field", async () => {
    const turn = input("Find my receipt");
    expect(turnSchema.safeParse({ ...turn, purchaseChoices: [] }).success).toBe(
      false,
    );
    const store = new MemoryStore();
    const conversation = await store.create("owner");
    const legacy: CareTurn = {
      requestId: turn.requestId,
      message: turn.message,
      answer: {
        outcome: "selection",
        mode: "deterministic",
        context: null,
        revision: turn.revision,
        text: "Choose a purchase.",
        steps: [],
        sources: [],
        actions: [{ label: "Choose a purchase", href: "/vault" }],
      },
    };
    await store.claim(conversation.id, "owner", turn);
    await store.finish(conversation.id, "owner", legacy);
    expect(await store.claim(conversation.id, "owner", turn)).toEqual(legacy);
    expect(legacy.answer).not.toHaveProperty("purchaseChoices");
  });
});
