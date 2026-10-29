import { describe, expect, it } from "vitest";
import {
  customerPlanSchema,
  orderedCustomerCommands,
  validateCustomerPlan,
  type CustomerCommand,
  type CustomerPlan,
} from "../../src/lib/intelligence/customer-commands";

// Pure command validation/ordering only: no models, mocks, stores or dispatch.
const baseCommands: CustomerCommand[] = [
  { operation: "reset" },
  { operation: "purchases" },
  { operation: "category" },
  { operation: "documents" },
  { operation: "care" },
  { operation: "attention" },
  { operation: "verified-adjustments" },
  { operation: "find", query: "headphones", verifiedOnly: true },
];
const origin: CustomerCommand = {
  operation: "filter",
  field: "origin",
  value: "sandbox",
};
const category: CustomerCommand = {
  operation: "filter",
  field: "category",
  value: "Computing",
};
const widget: CustomerCommand = {
  operation: "widget",
  widget: "purchase-grid",
};
const evidence: CustomerCommand = { operation: "evidence" };
const apply = (commands: CustomerCommand[]): CustomerPlan => ({
  outcome: "apply",
  commands,
});

function permutations(commands: CustomerCommand[]): CustomerCommand[][] {
  if (commands.length < 2) return [commands];
  return commands.flatMap((command, index) =>
    permutations(commands.filter((_, other) => index !== other)).map((rest) => [
      command,
      ...rest,
    ]),
  );
}

describe("customer command execution order (pure)", () => {
  it.each(baseCommands.map((base) => [base.operation, base] as const))(
    "%s precedes compatible filters regardless of model order",
    (_operation, base) => {
      for (const commands of permutations([origin, base])) {
        const plan = validateCustomerPlan(apply(commands));
        expect(orderedCustomerCommands(plan)).toEqual([base, origin]);
        // Validation preserves the saved plan; only the execution helper sorts.
        expect(plan.commands).toEqual(commands);
      }
    },
  );

  it("orders all care/filter/widget permutations without losing the origin predicate", () => {
    const care: CustomerCommand = { operation: "care" };
    for (const commands of permutations([origin, care, widget]))
      expect(orderedCustomerCommands(apply(commands))).toEqual([
        care,
        origin,
        widget,
      ]);
  });

  it("treats category as a purchases base, with filters before evidence", () => {
    const base: CustomerCommand = { operation: "category" };
    for (const commands of permutations([evidence, origin, base]))
      expect(orderedCustomerCommands(apply(commands))).toEqual([
        base,
        origin,
        evidence,
      ]);
  });

  it("preserves a useful explicit reset baseline plus filter and widget", () => {
    const reset: CustomerCommand = { operation: "reset" };
    for (const commands of permutations([widget, category, reset]))
      expect(orderedCustomerCommands(apply(commands))).toEqual([
        reset,
        category,
        widget,
      ]);
  });

  it("canonicalizes independent field filters without inserting or clearing a base", () => {
    const from: CustomerCommand = {
      operation: "filter",
      field: "from",
      value: "2026-01-01",
    };
    const to: CustomerCommand = {
      operation: "filter",
      field: "to",
      value: "2026-12-31",
    };
    for (const commands of permutations([from, category, origin]))
      expect(orderedCustomerCommands(apply(commands))).toEqual([
        origin,
        category,
        from,
      ]);
    for (const commands of permutations([to, from, { operation: "care" }]))
      expect(orderedCustomerCommands(apply(commands))).toEqual([
        { operation: "care" },
        from,
        to,
      ]);
  });

  it("orders presentation-only widgets before evidence and preserves the current view", () => {
    const chart: CustomerCommand = {
      operation: "widget",
      widget: "category-chart",
    };
    for (const commands of permutations([evidence, chart, widget]))
      expect(orderedCustomerCommands(apply(commands))).toEqual([
        widget,
        chart,
        evidence,
      ]);
    for (const commands of permutations([evidence, origin, widget]))
      expect(orderedCustomerCommands(apply(commands))).toEqual([
        origin,
        widget,
        evidence,
      ]);
  });

  it("returns a fresh list without mutating a frozen saved plan and is idempotent", () => {
    const plan = apply([widget, origin, { operation: "care" }]);
    const original = structuredClone(plan);
    for (const command of plan.commands) Object.freeze(command);
    Object.freeze(plan.commands);
    Object.freeze(plan);
    const ordered = orderedCustomerCommands(plan);
    expect(plan).toEqual(original);
    expect(ordered).not.toBe(plan.commands);
    expect(orderedCustomerCommands(apply(ordered))).toEqual(ordered);
    expect(
      orderedCustomerCommands({ outcome: "unsupported", commands: [] }),
    ).toEqual([]);
  });

  it.each(
    baseCommands.flatMap((left, index) =>
      baseCommands
        .filter((_, other) => index !== other)
        .map(
          (right) => [left.operation, right.operation, left, right] as const,
        ),
    ),
  )(
    "rejects ambiguous %s + %s through schema, validation and ordering",
    (_left, _right, left, right) => {
      const plan = apply([left, right]);
      expect(customerPlanSchema.safeParse(plan).success).toBe(false);
      expect(() => validateCustomerPlan(plan)).toThrow();
      expect(() => orderedCustomerCommands(plan)).toThrow();
    },
  );

  it.each(["origin", "category", "from", "to"] as const)(
    "rejects repeated/conflicting %s filters in either order",
    (field) => {
      const values =
        field === "origin"
          ? ["sample", "sandbox"]
          : field === "category"
            ? ["Computing", "Audio"]
            : ["2026-01-01", "2026-12-31"];
      const first: CustomerCommand = {
        operation: "filter",
        field,
        value: values[0],
      };
      const second: CustomerCommand = {
        operation: "filter",
        field,
        value: values[1],
      };
      for (const commands of [
        [first, first],
        [first, second],
        [second, first],
      ]) {
        const plan = apply(commands);
        expect(customerPlanSchema.safeParse(plan).success).toBe(false);
        expect(() => validateCustomerPlan(plan)).toThrow();
        expect(() => orderedCustomerCommands(plan)).toThrow();
      }
    },
  );

  it("revalidates malformed outcomes/commands and retains the three-command ceiling", () => {
    for (const raw of [
      { outcome: "apply", commands: [] },
      { outcome: "unsupported", commands: [origin] },
      { outcome: "apply", commands: [origin, category, widget, evidence] },
      {
        outcome: "apply",
        commands: [{ operation: "refund", amountMinor: 100 }],
      },
    ]) {
      expect(() => validateCustomerPlan(raw)).toThrow();
      expect(() => orderedCustomerCommands(raw as CustomerPlan)).toThrow();
    }
  });
});
