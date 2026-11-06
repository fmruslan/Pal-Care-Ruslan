import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBuild } from "./workspace.mjs";
import { assertCiReceipt } from "./ci-receipt.mjs";

export function latestAttemptJobs(jobs) {
  const latest = new Map();
  for (const job of jobs) {
    if (
      !Number.isSafeInteger(job.id) ||
      job.id <= 0 ||
      typeof job.name !== "string"
    )
      throw Error("invalid_job_attempt");
    if (!latest.has(job.name) || latest.get(job.name).id < job.id)
      latest.set(job.name, job);
  }
  return [...latest.values()];
}

export function assertReleaseEvidence(
  run,
  classification,
  jobs,
  expected,
  final = false,
) {
  if (
    !/^[a-f0-9]{40}$/.test(expected) ||
    run.head_sha !== expected ||
    run.repository?.full_name !== "fmruslan/Pal-Care-Ruslan" ||
    run.path !== ".github/workflows/repository-checks.yml" ||
    run.head_branch !== "main" ||
    !["push", "workflow_dispatch"].includes(run.event) ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    classification.head !== expected
  )
    throw Error("exact_main_workflow_success_required");
  const required = {
    fast: ["fast-ui"],
    feature: ["feature-acceptance"],
    full: [
      "foundation (fixtures)",
      "foundation (database)",
      "native-acceptance",
    ],
  }[classification.lane];
  if (
    !required ||
    (final &&
      (classification.lane !== "full" || run.event !== "workflow_dispatch"))
  )
    throw Error("required_release_lane_missing");
  for (const name of ["classify", "release-gate", ...required]) {
    const matches = jobs.filter((job) => job.name === name);
    if (
      matches.length !== 1 ||
      matches[0].status !== "completed" ||
      matches[0].conclusion !== "success"
    )
      throw Error(`exact_required_job_success_missing:${name}`);
  }
  return {
    commit: expected,
    runId: run.id,
    lane: classification.lane,
    final,
    exactChecks: true,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [runId, expected, flag] = process.argv.slice(2);
  if (
    !/^\d+$/.test(runId ?? "") ||
    !/^[a-f0-9]{40}$/.test(expected ?? "") ||
    (flag && flag !== "--final")
  )
    throw Error("usage_verify_ci_release_runId_exactSha_optional_final");
  const build = assertBuild(true);
  if (build.commit !== expected || build.dirty)
    throw Error("exact_clean_build_required");
  const api = (path) =>
    JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
  const endpoint = `repos/fmruslan/Pal-Care-Ruslan/actions/runs/${runId}`;
  const run = api(endpoint),
    jobs = [];
  for (let page = 1; ; page++) {
    const result = api(`${endpoint}/jobs?filter=all&per_page=100&page=${page}`);
    jobs.push(...result.jobs);
    if (result.jobs.length < 100) break;
  }
  const dir = mkdtempSync("/tmp/opencode/palcare-ci-evidence-");
  try {
    execFileSync(
      "gh",
      [
        "run",
        "download",
        runId,
        "--repo",
        "fmruslan/Pal-Care-Ruslan",
        "--name",
        "risk-classification",
        "--dir",
        dir,
      ],
      { stdio: "pipe" },
    );
    const classification = JSON.parse(
      readFileSync(resolve(dir, "ci-risk.json"), "utf8"),
    );
    const evidence = assertReleaseEvidence(
      run,
      classification,
      latestAttemptJobs(jobs),
      expected,
      flag === "--final",
    );
    const receipt = assertCiReceipt(build, {
      schema: 1,
      ...evidence,
      sourceHash: build.sourceHash,
      buildId: build.buildId,
      workflow: run.path,
      checkedAt: new Date().toISOString(),
    });
    writeFileSync(
      ".next/palcare-ci.json",
      JSON.stringify(receipt, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(JSON.stringify({ ...receipt, build }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
