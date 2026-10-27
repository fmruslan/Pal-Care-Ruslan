import { describe, it, expect, vi, afterEach } from "vitest";
import { offlineReviewCases } from "../fixtures/careos-offline-review";
import { reviewOfflineCase } from "../helpers/offline-care-review";
import { groundedAnswer } from "../../src/lib/careos/grounding";
import { deterministicAnswer } from "../../src/lib/careos/tools";
import { demoData } from "../../src/lib/demo/fixtures";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { evidencePacket } from "../../src/lib/careos/evidence-selection";

afterEach(() => vi.unstubAllGlobals());
describe("offline CareOS task review — no inference or database", () => {
  it.each(offlineReviewCases)("$id", async (scenario) => {
    const network = vi.fn(async () => {
      throw new Error("No external requests allowed");
    });
    vi.stubGlobal("fetch", network);
    expect((await reviewOfflineCase(scenario)).modelCalls).toBe(0);
    expect(network).not.toHaveBeenCalled();
  });
  it("documents why an exact quote is not a semantic entailment check", () => {
    const base = deterministicAnswer(demoData, {
      requestId: crypto.randomUUID(),
      twinId: demoData.twins[3].id,
      revision: 1,
      message: "Product care",
    });
    // Seeded NEGATIVE CONTROL, never a generated/live response or recommended
    // answer. The coding-assistant rubric rejects this unsupported procedure.
    // Keep this acceptance visible: the structural validator is not an AI judge.
    const adversarial = {
      outcome: "answered",
      steps: [
        {
          text: "Unplug power immediately while programs are running.",
          sourceId: referenceSource.id,
          quote:
            "Use this option before disconnecting your Raspberry Pi from power.",
        },
      ],
    };
    expect(() =>
      groundedAnswer(base, adversarial, [referenceSource]),
    ).not.toThrow();
    expect(referenceSource.content).toContain("Closes all running programs");
  });
  it("keeps the recorded calculation available for explanation behind the concise status", () => {
    const base = deterministicAnswer(demoData, {
      requestId: crypto.randomUUID(),
      twinId: demoData.twins[0].id,
      revision: 1,
      message: "Purchase summary",
    });
    base.sources.push({
      id: "synthetic-calculation",
      title: "Synthetic policy calculation",
      label:
        "Recorded calculation: original $129.00; compared merchant price $109.00; adjustment capped at $20.",
      href: "/guardian",
    });
    expect(
      evidencePacket(base).some(
        (f) =>
          f.text.includes("original $129.00") && f.text.includes("$109.00"),
      ),
    ).toBe(true);
  });
});
