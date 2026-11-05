import { describe, it, expect } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  demoId,
  withTenProductFixtures,
} from "../../src/lib/care/demo/catalog";
import {
  withConsumerDemoFixtures,
  consumerDemoDocuments,
  assertConsumerDemoDocuments,
} from "../../src/lib/care/demo/consumer-evidence";
import { careFeed } from "../../src/lib/care/model";
import { careProductCards, careMilestones } from "../../src/lib/care/summary";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import { querySavedRecords } from "../../src/lib/careos/records/service";
import { consumerProposal } from "../../scripts/care-consumer-plan";

const dataOf = () =>
  withConsumerDemoFixtures(withTenProductFixtures(structuredClone(demoData)));
const feedOf = (data = dataOf()) =>
  careFeed({
    data,
    knowledge: [],
    guardian: emptyOverview(),
    activity: { items: [], unavailable: [] },
    now: new Date("2026-11-05T12:00:00Z"),
  });
describe("consumer Care uses human presentation, never invented authority", () => {
  it("gives all ten saved scenarios different situations and meaningful next steps", () => {
    const feed = feedOf();
    const cards = careProductCards(feed);
    expect(cards).toHaveLength(10);
    const facts = cards.map((c) =>
      c.view!.facts.find((f) => f.topic === c.view!.pill.topic)!,
    );
    expect(new Set(facts.map((f) => f.consumer!.status)).size).toBe(10);
    expect(
      facts.every(
        (f) =>
          f.simulation &&
          !f.verified &&
          f.consumer!.nextStep.length > 40 &&
          !f.consumer!.action.includes("example"),
      ),
    ).toBe(true);
    expect(
      facts.every(
        (f) =>
          !/simulated|recorded|fictional dispatch/i.test(
            f.consumer!.status + " " + f.consumer!.summary,
          ),
      ),
    ).toBe(true);
    expect(careProductCards(feed, "attention")).toHaveLength(5);
    expect(careProductCards(feed, "watching")).toHaveLength(1);
    expect(careProductCards(feed, "protected")).toHaveLength(3);
    expect(careProductCards(feed, "completed")).toHaveLength(1);
    for (const card of cards)
      expect(careMilestones(card.view!)[0].topic).toBe("purchase");
    const boots = cards.find((c) => c.item.purchase.id === demoId(206))!;
    expect(
      careMilestones(boots.view!).filter((f) =>
        ["returns", "return-window"].includes(f.topic),
      ),
    ).toHaveLength(1);
  });
  it("adds three sample sources only; every original purchase/document/pack remains unchanged", () => {
    const before = withTenProductFixtures(structuredClone(demoData));
    const after = withConsumerDemoFixtures(before);
    expect(after.twins).toEqual(before.twins);
    expect(after.products).toEqual(before.products);
    expect(after.events).toEqual(before.events);
    expect(after.demoCare).toEqual(before.demoCare);
    expect(after.documents.slice(0, before.documents.length)).toEqual(
      before.documents,
    );
    expect(after.documents).toHaveLength(before.documents.length + 3);
    expect(
      consumerDemoDocuments.every(
        (d) =>
          d.origin === "sample" &&
          d.content.includes("No real merchant action"),
      ),
    ).toBe(true);
  });
  it("never invents the new states while the additional saved-data capability is off", () => {
    const data = dataOf();
    data.consumerDemo = false;
    const feed = feedOf(data);
    expect(careProductCards(feed, "completed")).toHaveLength(0);
    expect(
      feed.ownership.find((v) => v.twinId === demoId(201))!.pill.topic,
    ).toBe("warranty");
    expect(
      feed.ownership.find((v) => v.twinId === demoId(206))!.pill.topic,
    ).toBe("warranty");
  });
  it.each(["missing", "changed", "wrong-origin", "wrong-twin"])(
    "rejects %s source evidence instead of making a UI state",
    (change) => {
      const data = dataOf();
      const index = data.documents.findIndex(
        (d) => d.id === consumerDemoDocuments[0].id,
      );
      if (change === "missing") data.documents.splice(index, 1);
      if (change === "changed") data.documents[index].content += " altered";
      if (change === "wrong-origin") data.documents[index].origin = "sandbox";
      if (change === "wrong-twin") data.documents[index].twinId = demoId(208);
      expect(() => assertConsumerDemoDocuments(data)).toThrow(
        "consumer_demo_source_missing_or_changed",
      );
      expect(() => feedOf(data)).toThrow(
        "consumer_demo_source_missing_or_changed",
      );
    },
  );
  it("keeps the Pi unpriced and hypothetical, and keeps the lower catalog price separate from retail prices", () => {
    const data = dataOf(),
      feed = feedOf(data);
    const pi = feed.ownership.find((v) => v.twinId === demoId(204))!;
    expect(pi.facts.find((f) => f.consumer)!.consumer!.summary).toContain(
      "purchase price is still missing",
    );
    const headphones = feed.ownership.find((v) => v.twinId === demoId(201))!;
    expect(headphones.facts[0].consumer!.summary).toContain(
      "$20.00 lower demo catalog price",
    );
    expect(headphones.facts[0].consumer!.nextStep).toContain(
      "not eligibility or money saved",
    );
    expect(
      feed.retailReferences.find((r) => r.productId === demoId(101))!
        .priceMinor,
    ).toBe(8999);
    expect(
      querySavedRecords(data, emptyRecordsQuery("2026-11-05")).totals.find(
        (t) => t.origin === "sample",
      )!.amountMinor,
    ).toBe(294294);
  });
  it("a fictional completed refund never becomes verified money recovered or changes paid totals", () => {
    const feed = feedOf();
    const book = feed.ownership.find((v) => v.twinId === demoId(208))!;
    expect(book.facts[0]).toMatchObject({
      topic: "refunds",
      verified: false,
      demoCompletion: true,
    });
    expect(book.facts[0].consumer!.summary).toContain(
      "No real refund was issued",
    );
    expect(feed.purchases.find((p) => p.id === demoId(208))!.amountMinor).toBe(
      2495,
    );
    expect(
      feed.protections.every((p) => !p.policyVerified && !p.monitoring),
    ).toBe(true);
  });
  it.each([
    [201, "price", "Review opportunity"],
    [206, "returns", "View return progress"],
    [208, "refunds", "View refund details"],
    [205, "warranty", "View warranty"],
    [202, "delivery", "Track delivery"],
    [203, "safety", "Check safety details"],
  ] as const)(
    "North shares the exact scenario/source and next step for %i",
    (id, topic, action) => {
      const answer = careStatusAnswer(feedOf(), 1, [demoId(id)], topic);
      expect(answer.steps.join(" ")).toContain("Next:");
      expect(answer.steps.join(" ")).toContain("Demo");
      expect(answer.actions[0].label).toContain(action);
      expect(answer.sources.length).toBeGreaterThan(0);
      expect(answer.context?.twinId).toBe(demoId(id));
    },
  );
  it("retains original warranty facts when a separate return-progress document becomes primary", () => {
    const boots = feedOf().ownership.find((v) => v.twinId === demoId(206))!;
    expect(boots.pill.topic).toBe("returns");
    expect(boots.facts.find((f) => f.topic === "warranty")!.detail).toContain(
      "stitching-defect",
    );
    expect(boots.facts[0].detail).toContain("Inspection pending");
    expect(boots.facts[0].detail).toContain("no refund is confirmed");
  });
  it("the reviewed SQL, source manifest and operator hashes remain exact", async () => {
    expect(await consumerProposal()).toMatchObject({
      sqlHash:
        "d27bf01685e1b424d5ef834e32f2433e1be932a368eb1b34715839633b72f63a",
      dataHash:
        "0088e361009097c7da55bcd6b9c5b5d3f5c5ce46744e989b3b0fa6588a1ca054",
      operatorHash:
        "4385f5902205d01ffd1bab003c9f1a428073003bc877fe2a982a9dbee588d7df",
      planHash:
        "12db0b0716b3b4f8e0e6344633c609e1c0d3913d2cf5efc02bc25425c86df510",
    });
  });
});
