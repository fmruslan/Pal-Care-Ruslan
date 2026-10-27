import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveTurn } from "../../src/lib/careos/service";
import { demoData } from "../../src/lib/demo/fixtures";
import { referenceSource } from "../../src/lib/careos/knowledge";
import type { GuardianView } from "../../src/lib/price-guardian/contracts";
import type { OfflineReviewCase } from "../fixtures/careos-offline-review";

function syntheticGuardian(scenario: OfflineReviewCase): GuardianView[] {
  if (!scenario.state) return [];
  return [
    {
      id: "00000000-0000-4000-8000-000000000901",
      twinId: demoData.twins[scenario.twin].id,
      productName: "Fictional headphones",
      state: scenario.state,
      revision: 1,
      originalMinor: 12900,
      comparedMinor: 10900,
      amountMinor: 2000,
      policyVersion: "demo-price-v2 synthetic evaluation only",
      policyHash: "0".repeat(64),
      policyTerms: "Synthetic future-only adjustment, capped at USD 20.",
      priceOrigin: "synthetic",
      priceObservedAt: "2026-10-26T00:00:00Z",
      expiresAt: "2026-11-01T00:00:00Z",
      reason: "synthetic offline review",
      refundId: null,
      providerStatus: scenario.state === "pending" ? "PENDING" : null,
      verifiedAt: null,
      history: [],
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
      approvedAt: null,
      approvalExpiresAt: null,
      attemptedAt: null,
      checkedAt: null,
    },
  ];
}
export async function reviewOfflineCase(scenario: OfflineReviewCase) {
  let modelCalls = 0;
  const forbidden = async () => {
    modelCalls++;
    throw new Error("Offline review must never dispatch a model");
  };
  const answer = await resolveTurn({
    data: demoData,
    input: {
      requestId: randomUUID(),
      twinId: demoData.twins[scenario.twin].id,
      revision: 1,
      message: scenario.question,
    },
    sources: [referenceSource],
    history: [],
    mode: "fixture",
    model: {
      classify: forbidden,
      explain: forbidden,
      selectEvidence: forbidden,
    },
    call: forbidden,
    guardian: syntheticGuardian(scenario),
  });
  assert.equal(answer.outcome, scenario.outcome, scenario.id);
  assert.ok(
    answer.text.toLowerCase().includes(scenario.text.toLowerCase()),
    scenario.id + ": useful explanation missing",
  );
  if (scenario.next)
    assert.ok(
      answer.resolution?.next
        .toLowerCase()
        .includes(scenario.next.toLowerCase()),
    );
  if (scenario.state && scenario.outcome === "answered") {
    assert.equal(answer.text.split("Recorded adjustment:").length, 2);
    assert.ok(
      answer.sources.some(
        (s) =>
          s.label.includes("original $129.00") && s.label.includes("$109.00"),
      ),
    );
  }
  if (scenario.action)
    assert.ok(answer.actions.some((a) => a.href === scenario.action));
  if (scenario.careSource) {
    assert.ok(answer.sources.some((s) => s.id === referenceSource.id));
    assert.ok(answer.steps.some((s) => s.includes("Shutdown")));
    assert.equal(answer.context?.model, "5");
  }
  assert.notEqual(answer.mode, "live");
  assert.equal(modelCalls, 0);
  return {
    id: scenario.id,
    question: scenario.question,
    mode: answer.mode,
    outcome: answer.outcome,
    answer: answer.text,
    next: answer.resolution?.next ?? null,
    steps: answer.steps,
    sourceIds: answer.sources.map((s) => s.id),
    actions: answer.actions,
    modelCalls,
    provenance:
      "bundled fictional records / synthetic Guardian fixture; no application database",
  };
}
