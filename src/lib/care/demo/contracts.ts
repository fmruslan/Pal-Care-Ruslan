import { z } from "zod";

const text = z.string().min(1).max(1000);
const minor = z.int().positive().max(10000000);
export const demoPackSchema = z.strictObject({
  id: z.uuid(),
  version: z.literal("care-ten-v1"),
  asOf: z.iso.datetime({ offset: true }),
});
export const retailReferenceSchema = z.strictObject({
  id: z.uuid(),
  productId: z.uuid(),
  kind: z.literal("retail-reference"),
  retailer: text,
  seller: text,
  url: z.url().refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      [
        "www.pishop.us",
        "electronics.sony.com",
        "fellowproducts.com",
        "www.walmart.com",
        "www.homedepot.com",
        "www.timberland.com",
        "www.porchlightbooks.com",
        "www.apple.com",
      ].includes(u.hostname)
    );
  }, "Unapproved retail source"),
  brand: text,
  model: text,
  variant: text,
  match: z.enum(["model-variant", "comparable"]),
  matchReason: text,
  priceMinor: minor,
  currency: z.literal("USD"),
  checkedAt: z.iso.datetime({ offset: true }),
  retrieval: z.enum(["direct-page", "retailer-search-extract"]),
  quote: text,
  limitations: text,
});
const scenarioBase = {
  id: z.uuid(),
  twinId: z.uuid(),
  productId: z.uuid(),
  documentId: z.uuid(),
  simulated: z.literal(true),
};
const window = {
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  terms: text,
};
export const demoScenarioSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...scenarioBase,
    kind: z.literal("warranty"),
    ...window,
    extended: z.boolean(),
  }),
  z.strictObject({
    ...scenarioBase,
    kind: z.literal("return-window"),
    ...window,
    condition: z.enum(["unknown", "unopened"]),
    requiresUnopened: z.boolean(),
  }),
  z.strictObject({
    ...scenarioBase,
    kind: z.literal("delivery"),
    updates: z
      .array(
        z.strictObject({
          at: z.iso.datetime({ offset: true }),
          status: z.enum(["prepared", "dispatched", "in-transit"]),
        }),
      )
      .min(1)
      .max(10),
    estimatedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    ...scenarioBase,
    kind: z.literal("safety"),
    officialMatch: z.literal(false),
    terms: text,
  }),
  z.strictObject({
    ...scenarioBase,
    kind: z.literal("price"),
    ...window,
    hypotheticalPurchaseMinor: minor,
    observations: z
      .array(
        z.strictObject({
          at: z.iso.datetime({ offset: true }),
          priceMinor: minor,
          variant: text,
        }),
      )
      .length(2),
    monitoringExample: z.boolean(),
  }),
  z.strictObject({ ...scenarioBase, kind: z.literal("gap"), terms: text }),
]);
export type RetailReference = z.infer<typeof retailReferenceSchema>;
export type DemoScenario = z.infer<typeof demoScenarioSchema>;
export type DemoCarePack = z.infer<typeof demoPackSchema> & {
  references: RetailReference[];
  scenarios: DemoScenario[];
};
