import { describe, expect, it } from "vitest";
import {
  navigationIntent,
  purchaseNavigationSchema,
} from "../../src/lib/careos/navigation";
import { purchaseNavigation } from "../../src/lib/careos/navigation-record";
import { demoData } from "../../src/lib/demo/fixtures";

describe("resolved North navigation without inference", () => {
  it.each([
    "Now take me there.",
    "open it",
    "show me that purchase",
    "Please open that one",
  ])("uses selected purchase for %s", (message) => {
    expect(navigationIntent(message)).toBe("purchase");
  });
  it.each([
    ["show me its receipt", "receipt"],
    ["open my receipt", "receipt"],
    ["open its care details", "care"],
    ["open its warranty", "warranty"],
    ["show me its return policy", "returns"],
    ["show this in Insights", "insights"],
    ["go back", "back"],
    ["the other one", "other"],
  ])("resolves %s to %s", (message, destination) => {
    expect(navigationIntent(message)).toBe(destination);
  });
  it.each([
    "what is its warranty?",
    "show me its receipt and refund it",
    "open https://evil.example",
    "open the kettle",
    "take me to my headphones",
    "don't open it",
    "how do I open it?",
  ])("leaves interpretation of %s to the existing flow", (message) => {
    expect(navigationIntent(message)).toBeNull();
  });
  it("only resolves a named navigation request after explicit dated choice", () => {
    expect(navigationIntent("show my headphones documents", true)).toBe(
      "documents",
    );
    expect(navigationIntent("Take me to my headphones", true)).toBe("purchase");
    expect(
      navigationIntent("Take me to my headphones and refund them", true),
    ).toBeNull();
  });
  it("resolves exact records beyond the picker display window", () => {
    const data = structuredClone(demoData);
    const original = data.twins[0];
    data.twins = [
      ...Array.from({ length: 101 }, (_, i) => ({
        ...original,
        id: `00000000-0000-4000-8000-${String(600 + i).padStart(12, "0")}`,
      })),
      ...data.twins,
    ];
    expect(purchaseNavigation(data, original.id)?.context.twinId).toBe(
      original.id,
    );
  });
  it("resolves exact purchase/document IDs without mutating records or accepting arbitrary targets", () => {
    const data = structuredClone(demoData),
      before = structuredClone(data);
    const id = data.twins[0].id;
    const navigation = purchaseNavigation(data, id)!;
    expect(navigation.context.twinId).toBe(id);
    expect(
      navigation.actions.find((a) => a.destination === "receipt")?.href,
    ).toBe(
      `/documents/${data.documents.find((d) => d.twinId === id && d.kind === "receipt")!.id}`,
    );
    expect(
      navigation.actions.find((a) => a.destination === "warranty")?.href,
    ).toBe(`/vault/${id}?milestone=warranty`);
    expect(navigation.actions.find((a) => a.destination === "care")?.href).toBe(
      `/vault/${id}#care-heading`,
    );
    expect(data).toEqual(before);
    expect(purchaseNavigation(data, "https://evil.example")).toBeNull();
    expect(
      purchaseNavigation(data, "00000000-0000-4000-8000-999999999999"),
    ).toBeNull();
    expect(
      purchaseNavigationSchema.safeParse({
        ...navigation,
        actions: [
          { destination: "purchase", label: "open", href: "//evil.example" },
        ],
      }).success,
    ).toBe(false);
  });
  it("does not guess a receipt when absent or ambiguous, or accept a foreign/conflicting purchase", () => {
    const data = structuredClone(demoData),
      id = data.twins[0].id;
    const receipt = data.documents.find(
      (d) => d.twinId === id && d.kind === "receipt",
    )!;
    data.documents.push({
      ...receipt,
      id: "00000000-0000-4000-8000-999999999998",
    });
    expect(
      purchaseNavigation(data, id)!.actions.some(
        (a) => a.destination === "receipt",
      ),
    ).toBe(false);
    data.documents = data.documents.filter((d) => d.twinId !== id);
    expect(
      purchaseNavigation(data, id)!.actions.some(
        (a) => a.destination === "receipt",
      ),
    ).toBe(false);
    data.twins[0].customerId = "00000000-0000-4000-8000-999999999997";
    expect(purchaseNavigation(data, id)).toBeNull();
  });
});
