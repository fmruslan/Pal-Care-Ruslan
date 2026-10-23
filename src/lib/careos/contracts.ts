import { z } from "zod";

export const intentSchema = z.enum([
  "receipt",
  "summary",
  "documents",
  "history",
  "care",
  "important",
  "guardian",
  "replacement",
  "unsupported",
]);
export type Intent = z.infer<typeof intentSchema>;
export const turnSchema = z.strictObject({
  requestId: z.uuid(),
  twinId: z.uuid().nullable(),
  revision: z.int().nonnegative().max(1000000),
  message: z.string().trim().min(1).max(2000),
  intent: intentSchema.optional(),
});
export type TurnInput = z.infer<typeof turnSchema>;

export type CareContext = {
  twinId: string;
  name: string;
  model: string;
  origin: string;
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
