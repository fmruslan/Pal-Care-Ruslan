import { describe, expect, it } from "vitest";
import type { DemoData, PurchaseTwin } from "../../src/db/schema";
import { careContextSchema } from "../../src/lib/careos/contracts";
import { contextChoices } from "../../src/lib/careos/context-choices";
import { demoData } from "../../src/lib/demo/fixtures";

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

function sandboxTwin(data: DemoData): PurchaseTwin {
  // Synthetic unit-only evidence, never persisted or sent to PayPal.
  return {
    ...data.twins[0],
    id: id(205),
    purchasedOn: "2026-10-22",
    purchasePriceMinor: 12900,
    origin: "sandbox",
    checkoutOrderId: id(501),
    paypalOrderId: "UNITORDER00000001",
    paypalCaptureId: "UNITCAPTURE000001",
    verifiedAt: "2026-10-22T23:05:00Z",
    createdAt: "2026-10-22T23:05:00Z",
    productSnapshot: {
      ...data.products[0],
      currency: "USD",
      merchantName: data.merchant.name,
    },
  };
}

describe("North context choices: bounded public fictional records only", () => {
  it("returns dated, schema-valid contexts without record internals or payment references", () => {
    const data = structuredClone(demoData);
    const before = structuredClone(data);
    const choices = contextChoices(data);
    expect(choices.map((choice) => choice.context.twinId)).toEqual(
      data.twins.map((twin) => twin.id),
    );
    for (const [index, choice] of choices.entries()) {
      expect(choice).toEqual({
        context: {
          twinId: data.twins[index].id,
          name: data.products[index].name,
          model: data.products[index].model,
          origin: "sample",
          purchasedOn: data.twins[index].purchasedOn,
        },
        purchasedOn: data.twins[index].purchasedOn,
        provenance: "Sample",
      });
      expect(careContextSchema.safeParse(choice.context).success).toBe(true);
    }
    expect(JSON.stringify(choices)).not.toMatch(
      /customerId|merchantId|productId|checkoutOrderId|paypal|verifiedAt|content|purchasePriceMinor/,
    );
    expect(data).toEqual(before);
  });

  it("keeps two dated purchases of the same model distinct and uses the original Sandbox snapshot", () => {
    const data = structuredClone(demoData);
    const sandbox = sandboxTwin(data);
    data.twins.push(sandbox);
    data.products[0].name = "Renamed catalog item";
    data.products[0].model = "F-99";
    const choices = contextChoices(data);
    expect(choices).toHaveLength(5);
    expect(
      choices.find((choice) => choice.context.twinId === sandbox.id),
    ).toEqual({
      context: {
        twinId: sandbox.id,
        name: "Everyday headphones",
        model: "F-01",
        origin: "sandbox",
        purchasedOn: "2026-10-22",
      },
      purchasedOn: "2026-10-22",
      provenance: "Verified Sandbox",
    });
    expect(
      choices.some((choice) => choice.context.twinId === data.twins[0].id),
    ).toBe(true);
    expect(JSON.stringify(choices)).not.toContain("UNITCAPTURE");
    expect(JSON.stringify(choices)).not.toContain("UNITORDER");
  });

  it.each(["customer-id", "customer-kind", "merchant-id", "merchant-kind"])(
    "rejects a forged root scope even when its records agree: %s",
    (change) => {
      const data = structuredClone(demoData);
      if (change === "customer-id") {
        data.customer.id = id(900);
        data.twins.forEach((twin) => {
          twin.customerId = data.customer.id;
        });
      } else if (change === "merchant-id") {
        data.merchant.id = id(900);
        data.twins.forEach((twin) => {
          twin.merchantId = data.merchant.id;
        });
        data.products.forEach((product) => {
          product.merchantId = data.merchant.id;
        });
      } else if (change === "customer-kind") data.customer.kind = "real";
      else data.merchant.kind = "real";
      expect(contextChoices(data)).toEqual([]);
    },
  );

  it("validates customer, merchant, product association and UUID before applying the cap", () => {
    const data = structuredClone(demoData);
    const twin = data.twins[0];
    const authorized = Array.from({ length: 105 }, (_, index) => ({
      ...twin,
      id: id(1000 + index),
    }));
    data.products.push({
      ...data.products[0],
      id: id(999),
      merchantId: id(900),
    });
    data.twins = [
      { ...twin, id: id(901), customerId: id(900) },
      { ...twin, id: id(902), merchantId: id(900) },
      { ...twin, id: id(903), productId: id(998) },
      { ...twin, id: id(904), productId: id(999) },
      { ...twin, id: "../../private" },
      { ...twin, id: id(905), origin: "production" },
      ...authorized.flatMap((record) => [record, structuredClone(record)]),
    ];
    const choices = contextChoices(data);
    expect(choices).toHaveLength(100);
    expect(choices.map((choice) => choice.context.twinId)).toEqual(
      authorized.slice(0, 100).map((record) => record.id),
    );
    expect(new Set(choices.map((choice) => choice.context.twinId)).size).toBe(
      100,
    );
  });

  it.each([
    "",
    "not-a-date",
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-1-01",
    "2026-10-22T00:00:00Z",
  ])(
    "does not offer a purchase with an invalid calendar date: %s",
    (purchasedOn) => {
      const data = structuredClone(demoData);
      data.twins = [{ ...data.twins[0], purchasedOn }];
      expect(contextChoices(data)).toEqual([]);
    },
  );

  it("retains a valid leap-day date without converting it through a timezone", () => {
    const data = structuredClone(demoData);
    data.twins = [{ ...data.twins[0], purchasedOn: "2024-02-29" }];
    expect(contextChoices(data)[0]).toMatchObject({
      purchasedOn: "2024-02-29",
      context: { purchasedOn: "2024-02-29" },
    });
  });

  it.each([
    { name: "" },
    { name: "x".repeat(201) },
    { model: "x".repeat(201) },
  ])(
    "does not return context text that the browser schema cannot accept: %j",
    (change) => {
      const data = structuredClone(demoData);
      data.twins = [data.twins[0]];
      Object.assign(data.products[0], change);
      expect(contextChoices(data)).toEqual([]);
    },
  );

  it.each([
    { checkoutOrderId: null },
    { paypalOrderId: null },
    { paypalCaptureId: null },
    { verifiedAt: null },
    { verifiedAt: "not-a-time" },
    { productSnapshot: null },
    { purchasePriceMinor: 9900 },
    { currency: "EUR" },
  ])("does not label incomplete Sandbox evidence Verified: %j", (change) => {
    const data = structuredClone(demoData);
    data.twins = [{ ...sandboxTwin(data), ...change }];
    expect(contextChoices(data)).toEqual([]);
  });

  it.each(["id", "merchantId"] as const)(
    "rejects a Sandbox snapshot belonging to a different %s",
    (field) => {
      const data = structuredClone(demoData);
      const twin = sandboxTwin(data);
      twin.productSnapshot![field] = id(900);
      data.twins = [twin];
      expect(contextChoices(data)).toEqual([]);
    },
  );

  it("does not choose an arbitrary date from contradictory duplicate identities", () => {
    const data = structuredClone(demoData);
    const twin = data.twins[0];
    data.twins = [twin, { ...twin, purchasedOn: "2026-10-19" }, data.twins[1]];
    expect(contextChoices(data).map((choice) => choice.context.twinId)).toEqual(
      [data.twins[2].id],
    );
  });
});
