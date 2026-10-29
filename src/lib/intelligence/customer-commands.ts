import { z } from "zod";

// This vocabulary can change browser presentation only. It cannot carry record
// identities, links, amounts, policy text, SQL or a financial instruction.
export const customerWidgets = [
  "purchase-grid",
  "category-chart",
  "documents-care",
  "attention",
  "adjustments",
] as const;

export function customerRequestAllowed(message: string): boolean {
  const text = message.normalize("NFKC");
  return (
    text.trim().length > 0 &&
    message.length <= 500 &&
    !/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(
      text,
    ) &&
    !/\b(approve|execute|issue|send|capture|pay|buy|transfer|withdraw|cancel|delete|insert|update|drop|truncate|alter|grant|revoke|sql|password|secret|credentials?|tokens?|api[ -]?keys?)\b|\b(?:refund|purchase)\s+(me|us|now|this|that|it|my|the|all|an?)\b|\brefund\s+[$€£\d]|^\s*(?:please\s+)?refund\s*$|\b(create|make|process|request|start|initiate|trigger|submit|perform|authorize|reconcile)\b[\s\S]{0,60}\b(refund|payment|adjustment|claim|checkout|order)\b|\b(change|edit|override|rewrite|set)\b[\s\S]{0,60}\b(policy|price|amount|status|budget|limit|verified)\b|\b(activate|enable|renew|extend|increase|reset|bypass)\b[\s\S]{0,80}\b(credits?|billing|api|budget|allowance|limits?|scope|expiry|session|authorization)\b/i.test(
      text,
    ) &&
    !/ignore\b[\s\S]{0,80}\b(rules|instructions|previous|above)|\b(system|developer)\s+(prompt|message|instructions)|\b(act|pretend)\s+as\b|```|<\/?(?:script|system|developer|iframe)\b|\bselect\b[\s\S]*\bfrom\b|\bselect\s+(?:\*|\d)|\bunion\s+select\b/i.test(
      text,
    ) &&
    !/\b[a-z][a-z0-9+.-]*:\/\/|\b(?:https?|javascript|data|file|mailto):|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|dev)\b|(?:^|\s)\/(?:api|etc|proc|home)\//i.test(
      text,
    )
  );
}

const filterSchema = z
  .strictObject({
    operation: z.literal("filter"),
    field: z.enum(["origin", "category", "from", "to"]),
    value: z.string().min(1).max(80),
  })
  .superRefine((command, context) => {
    const valid =
      command.field === "origin"
        ? ["sample", "sandbox", "all"].includes(command.value)
        : command.field === "from" || command.field === "to"
          ? z.iso.date().safeParse(command.value).success
          : customerRequestAllowed(command.value);
    if (!valid)
      context.addIssue({ code: "custom", message: "Invalid customer filter." });
  });

export const customerCommandSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("reset") }),
  z.strictObject({ operation: z.literal("purchases") }),
  z.strictObject({ operation: z.literal("category") }),
  z.strictObject({ operation: z.literal("documents") }),
  z.strictObject({ operation: z.literal("care") }),
  z.strictObject({ operation: z.literal("attention") }),
  z.strictObject({ operation: z.literal("verified-adjustments") }),
  z.strictObject({ operation: z.literal("evidence") }),
  z.strictObject({
    operation: z.literal("find"),
    query: z
      .string()
      .min(1)
      .max(120)
      .refine(customerRequestAllowed)
      .refine(
        (query) =>
          !/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i.test(
            query,
          ),
        "Use search words, not record identities.",
      ),
    verifiedOnly: z.boolean(),
  }),
  filterSchema,
  z.strictObject({
    operation: z.literal("widget"),
    widget: z.enum(customerWidgets),
  }),
]);
export type CustomerCommand = z.infer<typeof customerCommandSchema>;

// A base selects the view and/or replaces its saved-record predicate. Category
// also selects My Purchases; evidence/widgets only affect presentation. Even a
// reset plus another base is rejected rather than choosing which intent wins.
const customerBaseOperations = new Set<CustomerCommand["operation"]>([
  "reset",
  "purchases",
  "category",
  "documents",
  "care",
  "attention",
  "verified-adjustments",
  "find",
]);
const customerFilterOrder = ["origin", "category", "from", "to"] as const;

export const customerPlanSchema = z
  .strictObject({
    outcome: z.enum(["apply", "unsupported"]),
    commands: z.array(customerCommandSchema).max(3),
  })
  .superRefine((plan, context) => {
    const keys = plan.commands.map((command) =>
      command.operation === "filter"
        ? `filter:${command.field}`
        : command.operation === "widget"
          ? `widget:${command.widget}`
          : command.operation,
    );
    if (
      (plan.outcome === "apply") !== plan.commands.length > 0 ||
      new Set(keys).size !== keys.length ||
      plan.commands.filter((command) =>
        customerBaseOperations.has(command.operation),
      ).length > 1
    )
      context.addIssue({ code: "custom", message: "Invalid customer plan." });
  });
export type CustomerPlan = z.infer<typeof customerPlanSchema>;

export function validateCustomerPlan(raw: unknown): CustomerPlan {
  return customerPlanSchema.parse(raw);
}

function customerCommandOrder(command: CustomerCommand): number {
  if (command.operation === "filter")
    return 10 + customerFilterOrder.indexOf(command.field);
  if (command.operation === "widget")
    return 20 + customerWidgets.indexOf(command.widget);
  if (command.operation === "evidence") return 30;
  return 0;
}

/**
 * Revalidate, then return a fresh execution list: optional single base first,
 * origin/category/from/to filters next, allowlisted widgets, then evidence.
 * No implicit base/reset is added: filter/presentation-only plans preserve the
 * current view. Unsupported returns []; invalid/conflicting plans throw.
 * The original saved plan/order is not mutated and nothing is executed here.
 */
export function orderedCustomerCommands(plan: CustomerPlan): CustomerCommand[] {
  const validated = validateCustomerPlan(plan);
  return [...validated.commands].sort(
    (left, right) => customerCommandOrder(left) - customerCommandOrder(right),
  );
}

export const customerScriptedPrompts = [
  ["Show my purchases", { operation: "purchases" }],
  ["Break down my purchases by category", { operation: "category" }],
  ["Show my documents", { operation: "documents" }],
  ["Which purchases have product care?", { operation: "care" }],
  ["What needs my attention?", { operation: "attention" }],
  ["Show verified adjustments", { operation: "verified-adjustments" }],
  ["Show the evidence", { operation: "evidence" }],
  [
    "Find my PayPal receipt",
    { operation: "find", query: "PayPal", verifiedOnly: true },
  ],
] as const satisfies ReadonlyArray<readonly [string, CustomerCommand]>;

const variants: ReadonlyArray<readonly [string, CustomerCommand]> = [
  ["Show me my purchases.", { operation: "purchases" }],
  ["Show me my purchases", { operation: "purchases" }],
  ["Show me my saved purchases", { operation: "purchases" }],
  ["Show my purchases by category", { operation: "category" }],
  ["Which purchases have documents?", { operation: "documents" }],
  ["Which purchases have documents I can open?", { operation: "documents" }],
  ["What products need my attention?", { operation: "attention" }],
  ["Which purchases need attention?", { operation: "attention" }],
  ["Which purchases have care instructions?", { operation: "care" }],
  [
    "Have I received any verified price adjustments?",
    { operation: "verified-adjustments" },
  ],
  [
    "What price adjustments have actually been verified?",
    { operation: "verified-adjustments" },
  ],
  ["Show me where that number came from.", { operation: "evidence" }],
  ["Show me where that number came from", { operation: "evidence" }],
  ["Show me the evidence behind that number.", { operation: "evidence" }],
  [
    "Find my PayPal headphones receipt.",
    { operation: "find", query: "headphones", verifiedOnly: true },
  ],
  [
    "Find my PayPal headphones receipt",
    { operation: "find", query: "headphones", verifiedOnly: true },
  ],
  [
    "Find my verified PayPal headphones purchase",
    { operation: "find", query: "headphones", verifiedOnly: true },
  ],
  ["Show all purchases", { operation: "purchases" }],
  ["Show purchase categories", { operation: "category" }],
  ["Show purchases by category", { operation: "category" }],
  ["Show documents and care", { operation: "documents" }],
  ["Show available care", { operation: "care" }],
  ["Show purchases needing attention", { operation: "attention" }],
  ["Show verified refunds", { operation: "verified-adjustments" }],
  ["Show my verified adjustments", { operation: "verified-adjustments" }],
  ["Show purchase evidence", { operation: "evidence" }],
  [
    "Find the PayPal receipt",
    { operation: "find", query: "PayPal", verifiedOnly: true },
  ],
  [
    "Show my PayPal receipt",
    { operation: "find", query: "PayPal", verifiedOnly: true },
  ],
  ["Reset this dashboard", { operation: "reset" }],
  ["Reset my dashboard", { operation: "reset" }],
];

// An exact, case-insensitive fixture grammar, not semantic understanding or live AI.
export function scriptedCustomerPlan(message: string): CustomerPlan | null {
  if (!customerRequestAllowed(message)) return null;
  const match = [...customerScriptedPrompts, ...variants].find(
    ([prompt]) => prompt.toLowerCase() === message.trim().toLowerCase(),
  );
  return match
    ? validateCustomerPlan({ outcome: "apply", commands: [{ ...match[1] }] })
    : null;
}
