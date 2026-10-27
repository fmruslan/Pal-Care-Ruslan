import {
  offlineReviewCases,
  OFFLINE_REVIEW_VERSION,
} from "../tests/fixtures/careos-offline-review";
import { reviewOfflineCase } from "../tests/helpers/offline-care-review";
// No environment loader, API key, OpenCode authentication bridge or DB client.
globalThis.fetch = async () => {
  throw new Error("Offline review blocks networking");
};
const results = [];
for (const scenario of offlineReviewCases)
  results.push(await reviewOfflineCase(scenario));
console.log(
  JSON.stringify(
    {
      version: OFFLINE_REVIEW_VERSION,
      evidence:
        "automated fixture assertions; examples reviewed by coding assistant in OpenCode, not hosted Sol evaluation or independent human review",
      passed: results.length,
      total: offlineReviewCases.length,
      modelCalls: 0,
      databaseCalls: 0,
      paidAPICalls: 0,
      ...(process.argv.includes("--examples")
        ? { results }
        : { caseIds: results.map((r) => r.id) }),
    },
    null,
    2,
  ),
);
