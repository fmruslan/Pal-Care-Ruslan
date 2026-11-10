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
import { consumerScenario } from "../../src/lib/care/demo/consumer";

const dataOf = () =>
  withConsumerDemoFixtures(withTenProductFixtures(structuredClone(demoData)));
const feedOf = (data = dataOf(), clock = "2026-11-05T12:00:00Z") =>
  careFeed({
    data,
    knowledge: [],
    guardian: emptyOverview(),
    activity: { items: [], unavailable: [] },
    now: new Date(clock),
  });
describe("consumer Care uses human presentation, never invented authority", () => {
  it("formats the actual saved return deadline in UTC and keeps expired windows closed", () => {
    const scenario = dataOf().demoCare!.scenarios.find(
      (s) => s.kind === "return-window",
    )!;
    if (scenario.kind !== "return-window")
      throw Error("return fixture required");
    const shifted = { ...scenario, endsAt: "2026-12-02T23:30:00-05:00" };
    expect(consumerScenario(shifted, true, "2026-11-09T12:00:00Z").status).toBe(
      "Return ends Dec 3",
    );
    expect(
      consumerScenario(shifted, false, "2026-12-03T04:30:00Z").status,
    ).toBe("Return window closed");
    expect(scenario.endsAt).not.toBe(shifted.endsAt);
  });
  it("uses concise labels derived from saved deadlines and never calls a sample refund complete", () => {
    const feed = feedOf();
    for (const [id, label] of [
      [201, "Illustrative price comparison"],
      [202, "Delivery expected"],
      [203, "Safety review"],
      [204, "Price review example"],
      [205, "Warranty details"],
      [206, "Return progress example"],
      [207, "Return ends Nov 8"],
      [208, "Refund example"],
      [209, "Price check example"],
      [210, "Return ends Nov 7"],
    ] as const) {
      const view = feed.ownership.find((v) => v.twinId === demoId(id))!;
      expect(
        view.facts.find((f) => f.topic === view.pill.topic)!.consumer!.status,
      ).toBe(label);
      expect(view.pill.verified).toBe(false);
    }
    const book = feed.ownership.find((v) => v.twinId === demoId(208))!;
    expect(book.facts[0].consumer!.summary).toContain(
      "No PayPal refund was issued",
    );
  });
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
          !/Price watch active|Price drop found|Protected|Refund complete/i.test(
            f.consumer!.status + " " + f.consumer!.summary,
          ),
      ),
    ).toBe(true);
    expect(careProductCards(feed, "attention")).toHaveLength(5);
    expect(careProductCards(feed, "watching")).toHaveLength(0);
    expect(careProductCards(feed, "protected")).toHaveLength(3);
    expect(careProductCards(feed, "completed")).toHaveLength(0);
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
      "paid price is missing",
    );
    const headphones = feed.ownership.find((v) => v.twinId === demoId(201))!;
    expect(headphones.facts[0].consumer!.summary).toContain(
      "example catalog price is $20.00 lower",
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
      "No PayPal refund was issued",
    );
    expect(feed.purchases.find((p) => p.id === demoId(208))!.amountMinor).toBe(
      2495,
    );
    expect(
      feed.protections.every((p) => !p.policyVerified && !p.monitoring),
    ).toBe(true);
  });
  it.each([
    [201, "price", "Compare saved prices"],
    [206, "returns", "View return progress"],
    [208, "refunds", "View refund details"],
    [205, "warranty", "View warranty"],
    [202, "delivery", "View delivery details"],
    [203, "safety", "Check safety details"],
  ] as const)(
    "North shares the exact scenario/source and next step for %i",
    (id, topic, action) => {
      const answer = careStatusAnswer(feedOf(), 1, [demoId(id)], topic);
      expect(answer.steps.join(" ")).toContain("Next:");
      expect(answer.steps.join(" ")).toContain("· Example.");
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
    expect(boots.facts[0].detail).toContain(
      "It is not live tracking or a confirmed refund",
    );
  });
  it.each([207, 210])(
    "evaluates the exact exclusive return cutoff for %i, not the frozen pack date",
    (id) => {
      const data = dataOf();
      const scenario = data.demoCare!.scenarios.find(
        (s) => s.twinId === demoId(id),
      )!;
      if (scenario.kind !== "return-window")
        throw Error("return fixture required");
      for (const offset of [-1, 0, 1]) {
        const clock = new Date(
          Date.parse(scenario.endsAt) + offset,
        ).toISOString();
        const feed = feedOf(data, clock);
        const view = feed.ownership.find((v) => v.twinId === demoId(id))!;
        const fact = view.facts.find((f) => f.topic === "return-window")!;
        expect(fact.state).toBe(offset < 0 ? "attention" : "expired");
        expect(fact.consumer!.status).toBe(
          offset < 0
            ? `Return ends Nov ${id === 207 ? 8 : 7}`
            : "Return window closed",
        );
        expect(fact.date).toBe(scenario.endsAt);
        expect(fact.simulation!.asOf).toBe(data.demoCare!.asOf);
        expect(view.asOf).toBe(clock);
        expect(fact.detail).toContain(
          offset < 0 ? "demo days remaining" : "Example window closed",
        );
        const card = careProductCards(feed).find(
          (c) => c.item.purchase.id === demoId(id),
        )!;
        expect(card.item.status).toBe(fact.status);
        const answer = careStatusAnswer(feed, 1, [demoId(id)], "return-window");
        expect(answer.steps.join(" ")).toContain(fact.consumer!.status);
        expect(answer.ownershipAsOf).toBe(clock);
      }
    },
  );
  it.each([-1, 0, 1])(
    "never infers kettle delivery at the arrival estimate offset %i ms",
    (offset) => {
      const clock = new Date(
        Date.parse("2026-11-07T18:00:00Z") + offset,
      ).toISOString();
      const feed = feedOf(dataOf(), clock);
      const fact = feed.ownership
        .find((v) => v.twinId === demoId(202))!
        .facts.find((f) => f.topic === "delivery")!;
      expect(fact.consumer!.status).toBe(
        offset < 0 ? "Delivery expected" : "Delivery unconfirmed",
      );
      expect(fact.state).toBe("recorded");
      expect(fact.verified).toBe(false);
      expect(fact.date).toBe("2026-11-07T18:00:00Z");
      if (offset >= 0)
        expect(fact.detail).toContain(
          "estimate has passed; delivery remains unconfirmed",
        );
      expect(
        careStatusAnswer(feed, 1, [demoId(202)], "delivery").steps.join(" "),
      ).toContain(fact.consumer!.status);
    },
  );
  it.each([204, 205, 209])(
    "expires the illustrative price/warranty window for %i exactly at its saved cutoff",
    (id) => {
      const data = dataOf();
      const scenario = data.demoCare!.scenarios.find(
        (s) => s.twinId === demoId(id),
      )!;
      if (!("endsAt" in scenario)) throw Error("dated fixture required");
      for (const offset of [-1, 0, 1]) {
        const feed = feedOf(
          data,
          new Date(Date.parse(scenario.endsAt) + offset).toISOString(),
        );
        const fact = feed.ownership
          .find((v) => v.twinId === demoId(id))!
          .facts.find((f) => f.simulation)!;
        expect(fact.state === "expired").toBe(offset >= 0);
        expect(fact.date).toBe(scenario.endsAt);
        expect(fact.verified).toBe(false);
      }
    },
  );
  it("on November 9 retains source/history snapshots while closing both returns and disclosing missing delivery/price evidence", () => {
    const data = dataOf(),
      before = structuredClone(data);
    const original = feedOf(data);
    const current = feedOf(data, "2026-11-09T12:00:00Z");
    for (const id of [207, 210]) {
      const view = current.ownership.find((v) => v.twinId === demoId(id))!;
      expect(view.pill.attention).toBe(false);
      expect(view.facts.find((f) => f.consumer)!.consumer!.status).toBe(
        "Return window closed",
      );
    }
    const pi = current.ownership.find((v) => v.twinId === demoId(204))!;
    expect(pi.facts.find((f) => f.consumer)!.consumer!.summary).toContain(
      "paid price is missing, so eligibility is unverified",
    );
    const phone = current.ownership.find((v) => v.twinId === demoId(209))!;
    expect(phone.facts.find((f) => f.consumer)!.consumer!.summary).toContain(
      "No external tracker is connected",
    );
    expect(careProductCards(current, "watching")).toEqual([]);
    expect(careProductCards(current, "protected")).toHaveLength(3);
    expect(
      careProductCards(current, "protected").every((card) =>
        card.view!.facts.some(
          (fact) =>
            fact.topic === "warranty" && fact.simulation && !fact.verified,
        ),
      ),
    ).toBe(true);
    expect(careProductCards(current, "completed")).toEqual([]);
    for (const view of current.ownership) {
      const old = original.ownership.find((v) => v.twinId === view.twinId)!;
      expect(view.asOf).toBe(current.observedAt);
      expect(view.history).toEqual(old.history);
      expect(view.simulation).toEqual(old.simulation);
    }
    expect(data).toEqual(before);
  });
  it.each(["not-a-date", ""])(
    "rejects invalid evaluation clock %s without substituting the scenario clock",
    (clock) => {
      expect(() => feedOf(dataOf(), clock)).toThrow("invalid_care_clock");
      expect(() =>
        consumerScenario(dataOf().demoCare!.scenarios[0], true, clock),
      ).toThrow("invalid_care_clock");
    },
  );
  it("keeps unchanged simulated evidence revisions stable across harmless current-clock refreshes", () => {
    const first = feedOf(dataOf(), "2026-11-09T12:00:00Z");
    const second = feedOf(dataOf(), "2026-11-09T12:01:00Z");
    expect(first.observedAt).not.toBe(second.observedAt);
    for (const view of first.ownership)
      expect(
        second.ownership.find((v) => v.twinId === view.twinId)!.revision,
      ).toBe(view.revision);
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
