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
    // Records follow-ups reference an owned saved turn, never client history.
    // Keep this optional field last: legacy serialized fingerprints stay intact.
    followupRequestId: z.uuid().optional(),
  })
  .refine(
    (value) => !(value.example && value.twinId),
    "Choose a purchase or a labeled example, never both.",
  );
export type TurnInput = z.infer<typeof turnSchema>;

export const careContextSchema = z.strictObject({
  twinId: z.uuid().nullable(),
  example: z.literal("insignia").optional(),
  name: z.string().min(1).max(200),
  model: z.string().max(200),
  origin: z.string().max(40),
  purchasedOn: z.iso.date().optional(),
});
export type CareContext = z.infer<typeof careContextSchema>;
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
  /** Server-derived immutable ownership snapshot metadata; never write authority. */
  ownershipAsOf?: string;
  ownershipPresentation?: {
    twinId: string;
    topic: import("../care/ownership").OwnershipTopic;
    revision: string;
  };
  /** Exact server-derived Care selection, retained only in owned saved history. */
  careSelection?: string[];
  /** Retained bounded live tool plan; application facts/identity remain final. */
  conversationPlan?: import("./records/conversation-service").ConversationPlan;
  /** Application-computed saved-record result; never model-supplied facts. */
  recordsResult?: import("./records/contracts").RecordsResult;
  recordsTopic?: "reset";
  /** Strict model proposal retained for individual evaluation, never proof of
   * provider completion or financial authority. Runtime accounting is separate. */
  recordsInterpretation?: {
    version: "north-records-intent-v1";
    proposal: import("./records/interpretation").RecordsInterpretation;
  };
  /** Effective scope of this answer, never the persistent browser product context. */
  questionScope?: "library" | "purchase" | "general";
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
  twin: { id: string; origin: string; purchasedOn?: string };
  product: { name: string; model: string };
}): CareContext {
  return {
    twinId: record.twin.id,
    name: record.product.name,
    model: record.product.model,
    origin: record.twin.origin,
    ...(record.twin.purchasedOn
      ? { purchasedOn: record.twin.purchasedOn }
      : {}),
  };
}
