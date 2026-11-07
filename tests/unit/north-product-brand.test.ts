import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { DemoData } from "../../src/db/schema";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  answerConversationTurn,
  conversationPlanSchema,
  type ConversationPlan,
} from "../../src/lib/careos/records/conversation-service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import { referenceSource } from "../../src/lib/careos/knowledge";

const day = "2026-11-07";
const sampleId = demoData.twins[0].id;
const sandboxId = "00000000-0000-4000-8000-000000000901";

// Test-only saved evidence; no real provider or financial operation.
function purchases(): DemoData {
  return {
    ...demoData,
    twins: [
      ...demoData.twins,
      {
        ...demoData.twins[0],
        id: sandboxId,
        purchasedOn: "2026-10-22",
        origin: "sandbox",
        checkoutOrderId: "00000000-0000-4000-8000-000000000902",
        paypalOrderId: "TESTORDER12345",
        paypalCaptureId: "TESTCAPTURE12345",
        verifiedAt: "2026-10-22T12:00:00Z",
        productSnapshot: {
          ...demoData.products[0],
          currency: "USD",
          priceMinor: demoData.twins[0].purchasePriceMinor,
          merchantName: demoData.merchant.name,
        },
      },
    ],
  };
}

function setup(
  productSearch = "Forma headphones",
  query: Partial<ConversationPlan["query"]> = {},
  data = purchases(),
) {
  const {
    version: _version,
    referenceDate: _referenceDate,
    timezone: _timezone,
    ...filters
  } = emptyRecordsQuery(day);
  void _version;
  void _referenceDate;
  void _timezone;
  const proposal = conversationPlanSchema.parse({
    task: "product",
    relation: "fresh",
    query: { ...filters, outcome: "query", origin: "sample", ...query },
    comparison: null,
    productSearch,
    productAction: "manual",
    careQuestion: "",
    clarification: "",
  });
  return {
    input: {
      requestId: randomUUID(),
      message: "Now show the manufacturer manual for Sample Forma headphones",
      twinId: demoData.twins[3].id,
      revision: 0,
    },
    history: [],
    load: vi.fn(async () => data),
    interpret: vi.fn(async () => proposal),
    knowledge: vi.fn(async () => [referenceSource]),
    model: { classify: vi.fn(), explain: vi.fn() },
    call: vi.fn(async () => {
      throw new Error("No care-model dispatch is allowed for manual lookup");
    }),
    now: () => new Date(`${day}T12:00:00Z`),
  };
}

describe("North product brand lookup — injected plans, no provider calls", () => {
  it.each(["Forma headphones", "Forma headphones F-01"])(
    "finds the exact Sample branded headphones but honestly reports the manual missing: %s",
    async (search) => {
      const options = setup(search);
      const answer = await answerConversationTurn(options);

      expect(answer.context).toMatchObject({
        twinId: sampleId,
        origin: "sample",
        purchasedOn: "2026-10-18",
        name: "Everyday headphones",
        model: "F-01",
      });
      expect(answer.outcome).toBe("missing");
      expect(answer.text).toContain(
        "No manufacturer manual is available for Forma F-01",
      );
      expect(
        answer.sources.some((source) => source.id === referenceSource.id),
      ).toBe(false);
      expect(
        answer.actions.some((action) => action.href.endsWith("/care")),
      ).toBe(false);
      expect(options.call).not.toHaveBeenCalled();
      expect(options.model.explain).not.toHaveBeenCalled();
    },
  );

  it.each([
    "Forma headphones F-99",
    "Unknownbrand headphones",
    "Forma headphones unknownterm",
  ])(
    "does not drop unknown identity terms or fall back to the selected Pi: %s",
    async (search) => {
      const options = setup(search);
      const answer = await answerConversationTurn(options);

      expect(answer.context).toBeNull();
      expect(answer.text).toContain("I couldn't identify that product");
      expect(answer.purchaseChoices ?? []).toEqual([]);
      expect(options.knowledge).not.toHaveBeenCalled();
      expect(options.call).not.toHaveBeenCalled();
    },
  );

  it("retains explicit Sandbox provenance instead of substituting Sample", async () => {
    const options = setup("Forma headphones", { origin: "sandbox" });
    const answer = await answerConversationTurn(options);
    expect(answer.context).toMatchObject({
      twinId: sandboxId,
      origin: "sandbox",
    });
    expect(answer.outcome).toBe("missing");

    const absent = await answerConversationTurn(
      setup("Forma headphones", { origin: "sandbox" }, demoData),
    );
    expect(absent.context).toBeNull();
    expect(absent.text).toContain("I couldn't identify that product");
  });

  it("preserves dated ambiguity and applies explicit date and category filters", async () => {
    const ambiguous = await answerConversationTurn(
      setup("Forma headphones", { origin: "all" }),
    );
    expect(ambiguous.outcome).toBe("selection");
    expect(
      ambiguous.purchaseChoices?.map((choice) => choice.context.twinId).sort(),
    ).toEqual([sampleId, sandboxId].sort());

    const dated = await answerConversationTurn(
      setup("Forma headphones", {
        origin: "all",
        from: "2026-10-22",
        to: "2026-10-22",
      }),
    );
    expect(dated.context?.twinId).toBe(sandboxId);

    for (const filters of [
      { origin: "sample" as const, from: "2026-10-22", to: "2026-10-22" },
      { categories: ["Kitchen"] as ConversationPlan["query"]["categories"] },
    ]) {
      const answer = await answerConversationTurn(
        setup("Forma headphones", filters),
      );
      expect(answer.context).toBeNull();
      expect(answer.text).toContain("I couldn't identify that product");
    }
  });

  it("matches the purchased snapshot brand rather than a changed catalog brand", async () => {
    const data = purchases();
    data.products = data.products.map((product) => ({
      ...product,
      brand: "Newbrand",
    }));
    const saved = await answerConversationTurn(
      setup("Forma headphones", { origin: "sandbox" }, data),
    );
    expect(saved.context?.twinId).toBe(sandboxId);
    expect(saved.text).toContain(
      "No manufacturer manual is available for Forma F-01",
    );

    const current = await answerConversationTurn(
      setup("Newbrand headphones", { origin: "sandbox" }, data),
    );
    expect(current.context).toBeNull();
    expect(current.text).toContain("I couldn't identify that product");
  });
});
