import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const primary = "/home/bigrus/projects/palcare";
const provenanceFile = ".next/palcare-build.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

// No secrets, environment values, network, or writes in the startup check.
export function workspaceSnapshot() {
  return {
    directory: realpathSync(process.cwd()),
    root: realpathSync(git("rev-parse", "--show-toplevel")),
    branch: git("branch", "--show-current") || "(detached)",
    commit: git("rev-parse", "HEAD"),
    origin: git("remote", "get-url", "origin"),
    dirty: git("status", "--porcelain"),
    ownerHost: hostname().toLowerCase() === "greatbison" || existsSync(primary),
  };
}

/** @param {ReturnType<typeof workspaceSnapshot>} state */
export function workspaceProblem(state) {
  if (
    !/^(https:\/\/github\.com\/|git@github\.com:)fmruslan\/Pal-Care-Ruslan(?:\.git)?$/.test(
      state.origin,
    )
  )
    return "Expected origin fmruslan/Pal-Care-Ruslan.";
  if (state.directory !== state.root) return "Run from the repository root.";
  if (state.ownerHost && (state.root !== primary || state.branch !== "main"))
    return `Use Pal Care → ${primary} → main; historical checkouts are retained for history.`;
  return null;
}

export function assertWorkspace() {
  const state = workspaceSnapshot();
  const problem = workspaceProblem(state);
  if (problem) throw new Error(problem);
  return state;
}

// Hash build inputs, including untracked source, but not credentials, generated
// next-env.d.ts, documentation, tests or audit artifacts. Docs-only commits still
// need a fresh build for private startup's exact-commit check.
export function sourceHash() {
  const paths = git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
    "public",
    "package.json",
    "pnpm-lock.yaml",
    "next.config.*",
    "postcss.config.*",
    "tsconfig.json",
    ".node-version",
  )
    .split("\0")
    .filter(Boolean);
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)].sort()) {
    hash.update(path).update("\0");
    hash.update(existsSync(path) ? readFileSync(path) : "DELETED").update("\0");
  }
  return hash.digest("hex");
}

export function servingPids(root = realpathSync(process.cwd())) {
  if (process.platform !== "linux") return [];
  return readdirSync("/proc").filter((pid) => {
    if (!/^\d+$/.test(pid)) return false;
    try {
      return (
        readlinkSync(`/proc/${pid}/cwd`) === root &&
        /^next-server\b/.test(readFileSync(`/proc/${pid}/cmdline`, "utf8"))
      );
    } catch {
      return false;
    } // Processes can exit during enumeration.
  });
}

export function assertBuild(privateStart = false) {
  const state = assertWorkspace();
  const build = JSON.parse(readFileSync(provenanceFile, "utf8"));
  if (
    build.sourceHash !== sourceHash() ||
    build.buildId !== readFileSync(".next/BUILD_ID", "utf8").trim()
  )
    throw new Error(
      "Build/source mismatch. Stop the preview and rebuild safely.",
    );
  if (
    privateStart &&
    (state.root !== primary ||
      state.branch !== "main" ||
      build.commit !== state.commit ||
      build.directory !== state.root ||
      git("status", "--porcelain", "--untracked-files=no"))
  )
    throw new Error(
      "Private startup requires clean tracked main and an exact-commit primary build.",
    );
  return build;
}

function recordBuild() {
  const state = assertWorkspace();
  const record = {
    directory: state.root,
    commit: state.commit,
    dirty: state.dirty,
    sourceHash: sourceHash(),
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    builtAt: new Date().toISOString(),
    node: process.version,
  };
  writeFileSync(provenanceFile, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ build: record }, null, 2));
}

function main() {
  const [action = "check", command, ...args] = process.argv.slice(2);
  const state = assertWorkspace();
  if (action === "check") {
    let build;
    try {
      build = assertBuild();
    } catch (error) {
      build = { unavailable: error.message };
    }
    console.log(
      JSON.stringify(
        {
          ...state,
          previewSource: `${primary} → 127.0.0.1:3002`,
          servingPids: servingPids(),
          build,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (action !== "run" || !command || !args.length)
    throw new Error(
      "Use workspace.mjs check or run <task> <executable> [args].",
    );
  if (state.ownerHost && command === "start")
    throw new Error(
      "Use palcare-preview.service on GreatBison; generic start is for an approved isolated deployment.",
    );
  if (/^(build|typecheck|dev|test(?::.*)?)$/.test(command)) {
    const pids = servingPids();
    if (pids.length)
      throw new Error(
        `Shared checkout is serving (PIDs ${pids.join(", ")}). Coordinate stop/build/verify/start; preserve the old build first.`,
      );
  }
  if (
    command === "start" ||
    /^test:(e2e|compat|guardian:e2e|failure|sol)$/.test(command)
  )
    assertBuild();
  const result = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }
  if (command === "build") recordBuild();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`STOP: ${error.message}`);
    process.exitCode = 2;
  }
}
