import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { primary, workspaceProblem } from "../../scripts/workspace.mjs";

const state = {
  directory: primary,
  root: primary,
  branch: "main",
  commit: "a".repeat(40),
  origin: "https://github.com/fmruslan/Pal-Care-Ruslan.git",
  dirty: "?? docs/DESIGN-REFRESH-PLAN.md",
  ownerHost: true,
};

describe("authoritative workspace guard", () => {
  it("permits primary main without discarding local-only work", () => {
    expect(workspaceProblem(state)).toBeNull();
  });
  it("rejects a historical checkout, wrong branch and nested directory", () => {
    expect(
      workspaceProblem({ ...state, directory: "/old", root: "/old" }),
    ).toContain("Use Pal Care");
    expect(workspaceProblem({ ...state, branch: "old-feature" })).toContain(
      "Use Pal Care",
    );
    expect(
      workspaceProblem({ ...state, directory: `${primary}/src` }),
    ).toContain("repository root");
  });
  it("permits a portable detached CI/deployment checkout but rejects the wrong repository", () => {
    const ci = {
      ...state,
      directory: "/runner/palcare",
      root: "/runner/palcare",
      ownerHost: false,
      branch: "(detached)",
    };
    expect(workspaceProblem(ci)).toBeNull();
    expect(
      workspaceProblem({
        ...ci,
        origin: "https://github.com/unrelated/repo.git",
      }),
    ).toContain("Expected origin");
  });
  it("stops before executing a command in an unrelated checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "palcare-workspace-test-"));
    try {
      const git = (...args: string[]) =>
        execFileSync("git", args, { cwd: root, stdio: "ignore" });
      git("init", "--initial-branch=main");
      git(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "test",
      );
      git("remote", "add", "origin", "https://github.com/unrelated/repo.git");
      const result = spawnSync(
        process.execPath,
        [
          resolve("scripts/workspace.mjs"),
          "run",
          "build",
          process.execPath,
          "-e",
          "console.log('SHOULD_NOT_RUN')",
        ],
        { cwd: root, encoding: "utf8" },
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Expected origin");
      expect(result.stdout).not.toContain("SHOULD_NOT_RUN");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
