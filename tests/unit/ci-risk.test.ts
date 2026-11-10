import { describe, expect, it } from "vitest";
import {
  classifyChange,
  classifyChanges,
  classificationForGit,
} from "../../scripts/ci-risk.mjs";
import { assertRiskGate } from "../../scripts/ci-gate.mjs";
import {
  assertReleaseEvidence,
  latestAttemptJobs,
  assertReusableEvidence,
  requiredChecks,
} from "../../scripts/verify-ci-release.mjs";
import { assertCiReceipt } from "../../scripts/ci-receipt.mjs";
const rail = "src/components/care/calendar-rail.tsx";
const consumer = "src/lib/care/demo/consumer.ts";
const change = (path: string, before = "old", after = "new", status = "M") => ({
  path,
  before,
  after,
  status,
});
describe("conservative automatic CI classification", () => {
  it("accepts only structural-identical UI copy/class changes", () => {
    expect(
      classifyChange(
        change(
          rail,
          'const v=<p className="text-sm">Old label</p>',
          'const v=<p className="text-base">New label</p>',
        ),
      ),
    ).toBe("fast");
    expect(
      classifyChange(
        change(rail, "const v=<p>{value}</p>", "const v=<p>{other}</p>"),
      ),
    ).toBe("feature");
    expect(
      classifyChange(
        change(
          rail,
          'const v=<a href="/one">One</a>',
          'const v=<a href="/two">Two</a>',
        ),
      ),
    ).toBe("feature");
    expect(
      classifyChange(
        change(
          rail,
          "const v=<button onClick={read}>Read</button>",
          "const v=<button onClick={write}>Write</button>",
        ),
      ),
    ).toBe("feature");
    expect(
      classifyChange(
        change(rail, "const v=<p>Hi</p>", "const v=<p hidden>Hi</p>"),
      ),
    ).toBe("feature");
  });
  it("only ignores named presentation copy values, not conditions, dates or template calculations", () => {
    expect(
      classifyChange(
        change(
          consumer,
          'const v={status:active?"Old":"Closed"}',
          'const v={status:active?"New":"Closed"}',
        ),
      ),
    ).toBe("fast");
    expect(
      classifyChange(
        change(
          consumer,
          "const v={summary:`Old ${amount}`}",
          "const v={summary:`New ${amount}`}",
        ),
      ),
    ).toBe("fast");
    expect(
      classifyChange(
        change(
          consumer,
          "const v={summary:`Old ${amount}`}",
          "const v={summary:`Old ${amount*2}`}",
        ),
      ),
    ).toBe("feature");
    expect(
      classifyChange(
        change(
          consumer,
          'const v={status:kind==="price"?"A":"B"}',
          'const v={status:kind==="refund"?"A":"B"}',
        ),
      ),
    ).toBe("feature");
    expect(
      classifyChange(
        change(
          consumer,
          'const v={endsAt:"2026-11-08"}',
          'const v={endsAt:"2026-11-09"}',
        ),
      ),
    ).toBe("feature");
  });
  it("keeps changed suppression comments and malformed syntax out of fast", () => {
    expect(
      classifyChange(
        change(
          rail,
          'const v=<p className="text-sm">Hi</p>',
          'const v=<p className="hidden">Hi</p>',
        ),
      ),
    ).toBe("feature");
    expect(
      classifyChange(
        change(
          rail,
          'const v=<p className="old">Hi</p>',
          `const v=<p className="bg-[url(https://example.com)]">Hi</p>`,
        ),
      ),
    ).toBe("feature");
    expect(
      classifyChange(
        change(rail, "const v=<p>Hi</p>", "// @ts-ignore\nconst v=<p>Hi</p>"),
      ),
    ).toBe("feature");
    expect(
      classifyChange(change(rail, "const v=<p>Hi</p>", "const v=<p>")),
    ).toBe("feature");
  });
  it("allows existing cosmetic CSS values, not changed selectors, visibility, remote resources or new rules", () => {
    const path = "src/app/customer-visual.css";
    expect(
      classifyChange(
        change(
          path,
          ".card { color: red; padding: 1rem; }",
          ".card { color: blue; padding: 2rem; }",
        ),
      ),
    ).toBe("fast");
    expect(
      classifyChange(
        change(
          path,
          "@media(min-width:1px){.card{color:red;}}",
          "@media(min-width:1px){.card{color:blue;}}",
        ),
      ),
    ).toBe("fast");
    for (const [old, next] of [
      [".a{color:red;}", ".b{color:red;}"],
      [".a{display:block;}", ".a{display:none;}"],
      [".a{color:red;}", ".a{background:url(https://example.com);}"],
      [".a{color:red;}", '@import "remote"; .a{color:red;}'],
    ])
      expect(classifyChange(change(path, old, next))).toBe("feature");
  });
  it.each([
    "src/lib/commerce/service.ts",
    "src/db/schema.ts",
    "drizzle/0016.sql",
    "src/lib/careos/records/service.ts",
    "src/lib/intelligence/access.ts",
    "src/app/api/careos/route.ts",
    "scripts/private-preview.ts",
    "package.json",
    "pnpm-lock.yaml",
    "AGENTS.md",
    "docs/CI-POLICY.md",
    ".github/workflows/repository-checks.yml",
    "unknown.ts",
  ])("always sends critical/unknown %s to full", (path) => {
    expect(classifyChange(change(path))).toBe("full");
  });
  it.each(["A", "D", "T", "R100"])("fails upward for %s files", (status) => {
    expect(classifyChange(change(rail, "old", "new", status))).toBe("full");
  });
  it("takes the highest risk across the entire range; adding docs cannot mask a critical change", () => {
    const docs = change("docs/PRODUCT.md");
    expect(
      classifyChanges([docs, change("src/lib/care/calendar.ts")]).lane,
    ).toBe("feature");
    expect(
      classifyChanges([docs, change("src/lib/commerce/service.ts")]).lane,
    ).toBe("full");
    expect(classifyChanges([docs], true).lane).toBe("full");
    expect(classifyChanges([]).lane).toBe("full");
  });
  it("classifies the entire push/PR base-to-head diff, not just the last commit", () => {
    const calls: string[][] = [];
    const result = classificationForGit(
      {
        base: "a".repeat(40),
        head: "b".repeat(40),
        event: "push",
        ref: "refs/heads/main",
      },
      (...args: string[]) => {
        calls.push(args);
        if (args[0] === "diff")
          return "M\0docs/PRODUCT.md\0M\0src/db/schema.ts\0";
        return "source";
      },
    );
    expect(result.lane).toBe("full");
    expect(calls).toContainEqual([
      "diff",
      "--no-renames",
      "--name-status",
      "-z",
      "a".repeat(40),
      "b".repeat(40),
    ]);
  });
  it("fails upward for missing/unavailable history, tag releases and final workflow dispatch", () => {
    const base = {
      base: "a".repeat(40),
      head: "b".repeat(40),
      event: "push",
      ref: "refs/heads/main",
    };
    for (const input of [
      { ...base, base: "0".repeat(40) },
      { ...base, event: "workflow_dispatch" },
      { ...base, ref: "refs/tags/submission" },
    ])
      expect(classificationForGit(input).lane).toBe("full");
    expect(
      classificationForGit(base, () => {
        throw Error("missing history");
      }).lane,
    ).toBe("full");
  });
});
describe("exact-commit release verification", () => {
  it("retains successful non-rerun jobs and requires the latest result of each rerun job", () => {
    const attempts = [
      { id: 1, name: "foundation", status: "completed", conclusion: "success" },
      { id: 2, name: "native", status: "completed", conclusion: "failure" },
      { id: 3, name: "native", status: "completed", conclusion: "success" },
    ];
    expect(latestAttemptJobs(attempts)).toEqual([attempts[0], attempts[2]]);
    expect(() => latestAttemptJobs([{ name: "native" }])).toThrow();
  });
  const sha = "b".repeat(40);
  const run = {
    id: 1,
    head_sha: sha,
    repository: { full_name: "fmruslan/Pal-Care-Ruslan" },
    path: ".github/workflows/repository-checks.yml",
    head_branch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
  };
  const job = (name: string) => ({
    name,
    status: "completed",
    conclusion: "success",
  });
  const jobs = [job("classify"), job("release-gate"), job("fast-ui")];
  it("requires this exact main SHA/workflow and the selected checks, not a generic green run", () => {
    expect(
      assertReleaseEvidence(run, { head: sha, lane: "fast" }, jobs, sha)
        .exactChecks,
    ).toBe(true);
    for (const changed of [
      { head_sha: "a".repeat(40) },
      { head_branch: "palcare/topic" },
      { event: "pull_request" },
      { path: "other.yml" },
      { conclusion: "cancelled" },
    ])
      expect(() =>
        assertReleaseEvidence(
          { ...run, ...changed },
          { head: sha, lane: "fast" },
          jobs,
          sha,
        ),
      ).toThrow();
    expect(() =>
      assertReleaseEvidence(
        run,
        { head: sha, lane: "fast" },
        jobs.filter((j) => j.name !== "fast-ui"),
        sha,
      ),
    ).toThrow();
    expect(() =>
      assertReleaseEvidence(run, { head: sha, lane: "full" }, jobs, sha),
    ).toThrow();
    expect(() =>
      assertReleaseEvidence(run, { head: sha, lane: "fast" }, jobs, sha, true),
    ).toThrow();
    expect(() =>
      assertReleaseEvidence(
        run,
        { head: "a".repeat(40), lane: "fast" },
        jobs,
        sha,
      ),
    ).toThrow();
  });
  it("requires a manually dispatched full main run for the final submission", () => {
    const full = [
      job("classify"),
      job("release-gate"),
      job("foundation (fixtures)"),
      job("foundation (database)"),
      job("native-acceptance"),
    ];
    expect(
      assertReleaseEvidence(
        { ...run, event: "workflow_dispatch" },
        { head: sha, lane: "full" },
        full,
        sha,
        true,
      ).final,
    ).toBe(true);
    expect(() =>
      assertReleaseEvidence(run, { head: sha, lane: "full" }, full, sha, true),
    ).toThrow();
  });
});
describe("private startup CI receipt", () => {
  const build = {
    commit: "a".repeat(40),
    sourceHash: "b".repeat(64),
    buildId: "build-a",
  };
  const receipt = {
    schema: 1,
    ...build,
    lane: "fast",
    runId: 1,
    exactChecks: true,
    workflow: ".github/workflows/repository-checks.yml",
    checkedAt: "2026-11-06T00:00:00Z",
  };
  it("requires the locally preserved exact verified workflow/build receipt on every private startup", () => {
    expect(assertCiReceipt(build, receipt)).toEqual(receipt);
    for (const changed of [
      { commit: "c".repeat(40) },
      { sourceHash: "c".repeat(64) },
      { buildId: "old" },
      { exactChecks: false },
      { lane: "unknown" },
      { runId: 0 },
      { workflow: "other.yml" },
      { checkedAt: "invalid" },
    ])
      expect(() =>
        assertCiReceipt(build, { ...receipt, ...changed }),
      ).toThrow();
    expect(() => assertCiReceipt(build, null)).toThrow();
  });
});
describe("stable required release gate", () => {
  const skipped = {
    classify: "success",
    "fast-ui": "skipped",
    "feature-acceptance": "skipped",
    foundation: "skipped",
    "native-acceptance": "skipped",
    "exact-release": "skipped",
  };
  it.each(["failure", "cancelled", "skipped", "timed_out", "in_progress"])(
    "rejects selected job %s",
    (result) => {
      expect(() =>
        assertRiskGate("fast", { ...skipped, "fast-ui": result }),
      ).toThrow();
    },
  );
  it("accepts exactly the selected successful lane and rejects unknown/failed classification", () => {
    expect(assertRiskGate("fast", { ...skipped, "fast-ui": "success" })).toBe(
      true,
    );
    expect(
      assertRiskGate("feature", {
        ...skipped,
        "feature-acceptance": "success",
      }),
    ).toBe(true);
    expect(
      assertRiskGate("full", {
        ...skipped,
        foundation: "success",
        "native-acceptance": "success",
      }),
    ).toBe(true);
    expect(() => assertRiskGate("unknown", skipped)).toThrow();
    expect(() =>
      assertRiskGate("fast", {
        ...skipped,
        classify: "failure",
        "fast-ui": "success",
      }),
    ).toThrow();
    expect(() =>
      assertRiskGate("full", { ...skipped, foundation: "success" }),
    ).toThrow();
  });
});

describe("identical PR tree release proof", () => {
  const repo = "fmruslan/Pal-Care-Ruslan",
    main = "a".repeat(40),
    head = "b".repeat(40),
    base = "c".repeat(40),
    tree = "d".repeat(40);
  const classification = { head, base, lane: "full", coverage: "sharded-v1" };
  const job = (name: string) => ({
    name,
    status: "completed",
    conclusion: "success",
  });
  const input = () => ({
    expected: main,
    base,
    lane: "full",
    coverage: "sharded-v1",
    main: {
      sha: main,
      parents: [{ sha: base }],
      commit: { tree: { sha: tree } },
    },
    head: { sha: head, commit: { tree: { sha: tree } } },
    pr: {
      number: 24,
      merged: true,
      merge_commit_sha: main,
      base: { ref: "main", sha: base, repo: { full_name: repo } },
      head: { sha: head, ref: "palcare/topic", repo: { full_name: repo } },
    },
    run: {
      id: 100,
      check_suite_id: 200,
      repository: { full_name: repo },
      head_repository: { full_name: repo },
      path: ".github/workflows/repository-checks.yml",
      event: "pull_request",
      head_sha: head,
      head_branch: "palcare/topic",
      status: "completed",
      conclusion: "success",
    },
    classification: { ...classification },
    jobs: [
      job("classify"),
      job("release-gate"),
      ...requiredChecks(classification).map(job),
    ],
    check: {
      name: "release-gate",
      head_sha: head,
      status: "completed",
      conclusion: "success",
      app: { id: 15368 },
      check_suite: { id: 200 },
    },
  });
  it("proves a squash SHA differs while its whole source tree and tested base are exact", () => {
    expect(assertReusableEvidence(input())).toEqual({
      pr: 24,
      runId: 100,
      testedCommit: head,
      tree,
      base,
    });
    const merge = input();
    merge.main.parents.push({ sha: head });
    expect(assertReusableEvidence(merge).tree).toBe(tree);
  });
  it.each([
    "tree",
    "unmerged",
    "base",
    "pr-base",
    "merge",
    "head",
    "fork",
    "event",
    "workflow",
    "failed",
    "cancelled",
    "pending",
    "lane",
    "coverage",
    "missing-shard",
    "failed-shard",
    "missing-gate",
    "check-app",
    "check-suite",
    "check-status",
    "recursive",
  ])("rejects %s rather than calling untested main verified", (kind) => {
    const v = input();
    if (kind === "unmerged") v.pr.merged = false;
    if (kind === "tree") v.main.commit.tree.sha = head;
    if (kind === "base") v.main.parents[0].sha = head;
    if (kind === "pr-base") v.classification.base = head;
    if (kind === "merge") v.pr.merge_commit_sha = head;
    if (kind === "head") v.run.head_sha = main;
    if (kind === "fork") v.pr.head.repo.full_name = "other/fork";
    if (kind === "event") v.run.event = "push";
    if (kind === "workflow") v.run.path = "other.yml";
    if (kind === "failed") v.run.conclusion = "failure";
    if (kind === "cancelled") v.run.conclusion = "cancelled";
    if (kind === "pending") v.run.status = "in_progress";
    if (kind === "lane") v.classification.lane = "fast";
    if (kind === "coverage") v.classification.coverage = "unknown";
    if (kind === "missing-shard") v.jobs.pop();
    if (kind === "failed-shard") v.jobs.at(-1)!.conclusion = "failure";
    if (kind === "missing-gate")
      v.jobs = v.jobs.filter((j) => j.name !== "release-gate");
    if (kind === "check-app") v.check.app.id = 1;
    if (kind === "check-suite") v.check.check_suite.id = 1;
    if (kind === "check-status") v.check.conclusion = "failure";
    if (kind === "recursive")
      Object.assign(v.classification, { reuse: { runId: 1 } });
    expect(() => assertReusableEvidence(v)).toThrow();
  });
  it("requires the exact main smoke gate AND revalidated PR proof; final submission never reuses", () => {
    const proof = assertReusableEvidence(input());
    const run = {
      ...input().run,
      id: 101,
      event: "push",
      head_sha: main,
      head_branch: "main",
    };
    const c = { ...classification, head: main, reuse: proof };
    const jobs = [job("classify"), job("release-gate"), job("exact-release")];
    expect(
      assertReleaseEvidence(run, c, jobs, main, false, proof),
    ).toMatchObject({
      runId: 101,
      testedRunId: 100,
      verification: "identical-pr-tree",
      commit: main,
    });
    expect(() => assertReleaseEvidence(run, c, jobs, main)).toThrow();
    expect(() =>
      assertReleaseEvidence(run, c, jobs.slice(0, 2), main, false, proof),
    ).toThrow();
    expect(() =>
      assertReleaseEvidence(
        { ...run, event: "workflow_dispatch" },
        c,
        jobs,
        main,
        true,
        proof,
      ),
    ).toThrow();
  });
  it("requires all six full runners; reuse skips them only with a successful exact-release job", () => {
    expect(requiredChecks(classification)).toHaveLength(6);
    const skipped = {
      classify: "success",
      "fast-ui": "skipped",
      "feature-acceptance": "skipped",
      foundation: "skipped",
      "native-acceptance": "skipped",
      "exact-release": "success",
    };
    expect(assertRiskGate("full", skipped, true)).toBe(true);
    for (const result of ["skipped", "failure", "cancelled"])
      expect(() =>
        assertRiskGate("full", { ...skipped, "exact-release": result }, true),
      ).toThrow();
    expect(() => assertRiskGate("full", skipped, false)).toThrow();
  });
});
