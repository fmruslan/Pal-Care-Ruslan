import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { careEvaluation } from "../fixtures/careos-evaluation";
import { resolveTurn } from "../../src/lib/careos/service";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { demoData } from "../../src/lib/demo/fixtures";

it.each(careEvaluation)(
  "fixture task evaluation: $question (Twin $twin, $outcome)",
  async (scenario) => {
    const answer = await resolveTurn({
      data: demoData,
      input: {
        requestId: randomUUID(),
        twinId:
          scenario.twin === null ? null : demoData.twins[scenario.twin].id,
        revision: 1,
        message: scenario.question,
      },
      sources: [
        {
          ...referenceSource,
          status: scenario.conflict ? "conflicting" : "approved",
        },
      ],
      history: [],
      mode: "fixture",
    });
    expect(answer.outcome).toBe(scenario.outcome);
    expect(answer.mode).not.toBe("live");
    if (scenario.source) {
      expect(answer.sources[0].id).toBe(referenceSource.id);
      expect(answer.mode).toBe("fixture");
    }
    for (const action of answer.actions)
      expect(action.href).toMatch(/^\/(vault|documents|guardian)(\/|$)/);
  },
);
