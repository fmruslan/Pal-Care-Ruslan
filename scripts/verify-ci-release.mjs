import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBuild } from "./workspace.mjs";
import { assertCiReceipt } from "./ci-receipt.mjs";

const repository = "fmruslan/Pal-Care-Ruslan";
const workflow = ".github/workflows/repository-checks.yml";
const sha = /^[a-f0-9]{40}$/;
export function requiredChecks(classification) {
  if (classification.coverage && classification.coverage !== "sharded-v1")
    throw Error("unknown_coverage_version");
  const full =
    classification.coverage === "sharded-v1"
      ? [
          "foundation (fixtures, 1/2)",
          "foundation (fixtures, 2/2)",
          "foundation (database, 1/2)",
          "foundation (database, 2/2)",
          "native-acceptance (journeys)",
          "native-acceptance (compatibility)",
        ]
      : ["foundation (fixtures)", "foundation (database)", "native-acceptance"];
  const selected = { fast: ["fast-ui"], feature: ["feature-acceptance"], full }[
    classification.lane
  ];
  if (!selected) throw Error("required_release_lane_missing");
  return selected;
}
function requireJobs(jobs, names) {
  for (const name of names) {
    const matches = jobs.filter((job) => job.name === name);
    if (
      matches.length !== 1 ||
      matches[0].status !== "completed" ||
      matches[0].conclusion !== "success"
    )
      throw Error(`exact_required_job_success_missing:${name}`);
  }
}

/** Whole Git trees include source, tests, lockfiles and workflow policy. No path exclusions. */
export function assertReusableEvidence({
  main,
  head,
  pr,
  run,
  classification,
  jobs,
  check,
  expected,
  base,
  lane,
  coverage,
}) {
  if (
    !sha.test(expected) ||
    !sha.test(base) ||
    main.sha !== expected ||
    ![1, 2].includes(main.parents?.length) ||
    main.parents[0].sha !== base ||
    pr.merged !== true ||
    pr.merge_commit_sha !== expected ||
    pr.base?.ref !== "main" ||
    pr.base.sha !== base ||
    pr.base.repo?.full_name !== repository ||
    pr.head?.repo?.full_name !== repository ||
    !Number.isSafeInteger(pr.number) ||
    pr.number <= 0 ||
    !sha.test(pr.head.sha) ||
    head.sha !== pr.head.sha ||
    !sha.test(head.commit?.tree?.sha) ||
    main.commit?.tree?.sha !== head.commit.tree.sha
  )
    throw Error("identical_merged_pr_tree_required");
  if (
    !Number.isSafeInteger(run.id) ||
    run.id <= 0 ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.path !== workflow ||
    run.event !== "pull_request" ||
    run.head_sha !== pr.head.sha ||
    run.head_branch !== pr.head.ref ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    classification.head !== pr.head.sha ||
    classification.base !== base ||
    classification.lane !== lane ||
    classification.coverage !== coverage ||
    classification.reuse
  )
    throw Error("successful_exact_pr_run_required");
  requireJobs(jobs, [
    "classify",
    "release-gate",
    ...requiredChecks(classification),
  ]);
  if (
    !Number.isSafeInteger(run.check_suite_id) ||
    run.check_suite_id <= 0 ||
    check?.name !== "release-gate" ||
    check.head_sha !== pr.head.sha ||
    check.status !== "completed" ||
    check.conclusion !== "success" ||
    check.app?.id !== 15368 ||
    check.check_suite?.id !== run.check_suite_id
  )
    throw Error("github_required_check_required");
  return {
    pr: pr.number,
    runId: run.id,
    testedCommit: pr.head.sha,
    tree: head.commit.tree.sha,
    base,
  };
}

const api = (path) =>
  JSON.parse(
    execFileSync("gh", ["api", path], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
function runJobs(id) {
  const jobs = [];
  for (let page = 1; ; page++) {
    const result = api(
      `repos/${repository}/actions/runs/${id}/jobs?filter=all&per_page=100&page=${page}`,
    );
    jobs.push(...result.jobs);
    if (result.jobs.length < 100) return latestAttemptJobs(jobs);
  }
}
function runClassification(id) {
  mkdirSync("/tmp/opencode", { recursive: true });
  const dir = mkdtempSync("/tmp/opencode/palcare-ci-evidence-");
  try {
    execFileSync(
      "gh",
      [
        "run",
        "download",
        String(id),
        "--repo",
        repository,
        "--name",
        "risk-classification",
        "--dir",
        dir,
      ],
      { stdio: "pipe" },
    );
    return JSON.parse(readFileSync(resolve(dir, "ci-risk.json"), "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
export function reusableEvidence(expected, base, lane, coverage) {
  if (!sha.test(expected) || !sha.test(base))
    throw Error("exact_merge_range_required");
  const root = `repos/${repository}`;
  const main = api(`${root}/commits/${expected}`);
  const prs = api(`${root}/commits/${expected}/pulls?per_page=100`).filter(
    (pr) => pr.merge_commit_sha === expected && pr.base?.ref === "main",
  );
  if (prs.length !== 1) throw Error("one_merged_pr_required");
  const pr = api(`${root}/pulls/${prs[0].number}`);
  if (!sha.test(pr.head?.sha)) throw Error("exact_pr_head_required");
  const head = api(`${root}/commits/${pr.head.sha}`);
  const runs = api(
    `${root}/actions/workflows/repository-checks.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`,
  ).workflow_runs;
  // Never fall back from a newer failed, cancelled or still-running attempt.
  const latest = runs.sort((a, b) => b.id - a.id)[0];
  if (!latest) throw Error("pr_run_missing");
  const run = api(`${root}/actions/runs/${latest.id}`);
  const checks = api(
    `${root}/commits/${pr.head.sha}/check-runs?check_name=release-gate&filter=latest&per_page=100`,
  ).check_runs.filter((check) => check.check_suite?.id === run.check_suite_id);
  if (checks.length !== 1) throw Error("unambiguous_required_check_required");
  return assertReusableEvidence({
    main,
    head,
    pr,
    run,
    classification: runClassification(run.id),
    jobs: runJobs(run.id),
    check: checks[0],
    expected,
    base,
    lane,
    coverage,
  });
}

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
  reuseProof,
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
  const required = requiredChecks(classification);
  if (
    !required ||
    (final &&
      (classification.lane !== "full" || run.event !== "workflow_dispatch"))
  )
    throw Error("required_release_lane_missing");
  if (
    classification.reuse &&
    (final ||
      run.event !== "push" ||
      !reuseProof ||
      JSON.stringify(classification.reuse) !== JSON.stringify(reuseProof))
  )
    throw Error("revalidated_pr_evidence_required");
  requireJobs(jobs, [
    "classify",
    "release-gate",
    ...(classification.reuse ? ["exact-release"] : required),
  ]);
  return {
    commit: expected,
    runId: run.id,
    lane: classification.lane,
    final,
    exactChecks: true,
    ...(classification.reuse
      ? {
          verification: "identical-pr-tree",
          ...reuseProof,
          testedRunId: reuseProof.runId,
          runId: run.id,
        }
      : {}),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (["--select-reuse", "--check-reuse"].includes(process.argv[2])) {
    const classification = JSON.parse(readFileSync("ci-risk.json", "utf8"));
    const select = process.argv[2] === "--select-reuse";
    if (select) {
      classification.coverage = "sharded-v1";
      delete classification.reuse;
      if (
        process.env.GITHUB_EVENT_NAME === "push" &&
        process.env.GITHUB_REF === "refs/heads/main" &&
        classification.head === process.env.GITHUB_SHA
      ) {
        try {
          classification.reuse = reusableEvidence(
            classification.head,
            classification.base,
            classification.lane,
            classification.coverage,
          );
        } catch (error) {
          console.log(
            `No reusable exact PR proof (${error.message.split("\n")[0]}); running the risk-selected checks.`,
          );
        }
      }
      writeFileSync(
        "ci-risk.json",
        JSON.stringify(classification, null, 2) + "\n",
      );
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `reuse=${Boolean(classification.reuse)}\n`,
      );
    } else {
      if (
        process.env.GITHUB_EVENT_NAME !== "push" ||
        process.env.GITHUB_REF !== "refs/heads/main" ||
        classification.head !== process.env.GITHUB_SHA ||
        !classification.reuse
      )
        throw Error("main_push_reuse_required");
      const proof = reusableEvidence(
        classification.head,
        classification.base,
        classification.lane,
        classification.coverage,
      );
      if (JSON.stringify(proof) !== JSON.stringify(classification.reuse))
        throw Error("pr_proof_changed");
      console.log(JSON.stringify({ exactMain: classification.head, ...proof }));
    }
  } else {
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
    const endpoint = `repos/fmruslan/Pal-Care-Ruslan/actions/runs/${runId}`;
    const run = api(endpoint),
      jobs = runJobs(runId);
    const classification = runClassification(runId);
    const proof = classification.reuse
      ? reusableEvidence(
          expected,
          classification.base,
          classification.lane,
          classification.coverage,
        )
      : undefined;
    const evidence = assertReleaseEvidence(
      run,
      classification,
      latestAttemptJobs(jobs),
      expected,
      flag === "--final",
      proof,
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
  }
}
