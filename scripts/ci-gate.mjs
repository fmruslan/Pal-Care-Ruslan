import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function assertRiskGate(lane, results) {
  const selected = {
    fast: ["fast-ui"],
    feature: ["feature-acceptance"],
    full: ["foundation", "native-acceptance"],
  }[lane];
  if (!selected || results.classify !== "success")
    throw Error("classification_required");
  for (const name of [
    "fast-ui",
    "feature-acceptance",
    "foundation",
    "native-acceptance",
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
  );
  console.log("Exact-commit risk-selected checks passed.");
}
