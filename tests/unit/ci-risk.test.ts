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
