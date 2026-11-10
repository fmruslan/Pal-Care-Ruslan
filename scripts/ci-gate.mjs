import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function assertRiskGate(lane, results, reuse = false) {
  const lanes = {
    fast: ["fast-ui"],
    feature: ["feature-acceptance"],
    full: ["foundation", "native-acceptance"],
  }[lane];
  if (!lanes || results.classify !== "success" || typeof reuse !== "boolean")
    throw Error("classification_required");
  const selected = reuse ? ["exact-release"] : lanes;
  for (const name of [
    "fast-ui",
    "feature-acceptance",
    "foundation",
    "native-acceptance",
    "exact-release",
  ]) {
    if (results[name] !== (selected.includes(name) ? "success" : "skipped"))
      throw Error(`required_risk_job_not_successful:${name}`);
  }
  return true;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const needs = JSON.parse(process.env.CI_NEEDS ?? "{}");
  assertRiskGate(
    needs.classify?.outputs?.lane,
    Object.fromEntries(
      Object.entries(needs).map(([name, job]) => [name, job.result]),
    ),
    needs.classify?.outputs?.reuse === "true",
  );
  console.log("Exact-commit risk-selected checks passed.");
}
