import { z } from "zod";

export const intentSchema = z.enum([
  "identity",
  "receipt",
  "summary",
  "documents",
  "policy",
  "history",
  "care",
  "important",
  "guardian",
  "recall",
  "replacement",
  "unsupported",
]);
export type Intent = z.infer<typeof intentSchema>;
export const turnSchema = z
  .strictObject({
    requestId: z.uuid(),
    twinId: z.uuid().nullable(),
    revision: z.int().nonnegative().max(1000000),
    message: z.string().trim().min(1).max(2000),
    intent: intentSchema.optional(),
    example: z.literal("insignia").optional(),
  })
  .refine(
    (value) => !(value.example && value.twinId),
    "Choose a purchase or a labeled example, never both.",
  );
export type TurnInput = z.infer<typeof turnSchema>;

export type CareContext = {
  twinId: string | null;
  example?: "insignia";
  name: string;
  model: string;
  origin: string;
};
export type PurchaseChoice = {
  context: CareContext;
  purchasedOn: string;
  provenance: "Sample" | "Verified Sandbox";
};
export type CareAction = { label: string; href: string };
export type Evidence = {
  id: string;
  title: string;
  label: string;
  href: string;
  excerpt?: string;
};
export type CareAnswer = {
  resolution?: import("./resolution").CareResolution;
  presentation?: import("../intelligence/commands").DashboardPlan;
  customerPresentation?: import("../intelligence/customer-commands").CustomerPlan;
  outcome:
    | "answered"
    | "selection"
    | "missing"
    | "conflict"
    | "unsupported"
    | "unavailable";
  mode: "deterministic" | "fixture" | "live";
  context: CareContext | null;
  revision: number;
  text: string;
  steps: string[];
  sources: Evidence[];
  actions: CareAction[];
  // Server-derived choices. Choosing one requires a new turn, not a replay.
  purchaseChoices?: PurchaseChoice[];
};
export type CareTurn = {
  requestId: string;
  message: string;
  answer: CareAnswer;
};
export type Conversation = { id: string; expiresAt: string; turns: CareTurn[] };

export class CareError extends Error {
  constructor(
    public code: string,
    public status = 503,
  ) {
    super(code);
  }
}

export function contextOf(record: {
  twin: { id: string; origin: string };
  product: { name: string; model: string };
}): CareContext {
  return {
    twinId: record.twin.id,
    name: record.product.name,
    model: record.product.model,
    origin: record.twin.origin,
  };
}
