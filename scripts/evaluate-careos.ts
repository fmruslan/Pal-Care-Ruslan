import { randomUUID } from "node:crypto";
import {
  careEvaluation,
  CARE_EVALUATION_VERSION,
} from "../tests/fixtures/careos-evaluation";
import { resolveTurn } from "../src/lib/careos/service";
import { demoData } from "../src/lib/demo/fixtures";
import { referenceSource } from "../src/lib/careos/knowledge";
let passed = 0;
for (const scenario of careEvaluation) {
  const answer = await resolveTurn({
    data: demoData,
    input: {
      requestId: randomUUID(),
      twinId: scenario.twin === null ? null : demoData.twins[scenario.twin].id,
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
  if (answer.outcome === scenario.outcome && answer.mode !== "live") passed++;
}
console.log(
  JSON.stringify(
    {
      version: CARE_EVALUATION_VERSION,
      mode: "deterministic-and-fixture",
      passed,
      total: careEvaluation.length,
      modelCalls: 0,
      financialCalls: 0,
      note: "Not hosted-model accuracy, human user research or provider acceptance.",
    },
    null,
    2,
  ),
);
if (passed !== careEvaluation.length) process.exitCode = 1;
