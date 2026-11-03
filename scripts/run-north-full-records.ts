import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type BrowserContext } from "@playwright/test";
import { assertWorkspace, sourceHash } from "./workspace.mjs";
import { ownerSendState } from "../src/components/careos/owner-status";
import { OWNER_ORIGIN, ownerFiles } from "../src/lib/careos/standing-owner";
import {
  northFullRecordsDrafts,
  NORTH_RECORDS_DRAFT_REFERENCE,
} from "../tests/fixtures/north-full-records-drafts";
import { NORTH_FULL_CAMPAIGN } from "../tests/fixtures/north-full-campaign";
import { demoData } from "../src/lib/demo/fixtures";
import {
  guardRecordsCampaign,
  exerciseRecordsScenario,
} from "./north-full-browser";
import {
  assessRecordsCase,
  correlateRecordsAttempts,
} from "./north-full-evaluation";
import { inspectDraftOracles } from "./preflight-north-full";

/** OWNER-RUN LIVE PREPARATION; NEVER CI. No argument/--check does not launch a
 * browser, read credentials, start a server, pair/renew anything or call a model.
 * --run needs an explicitly approved isolated transport, an ALREADY authorized
 * test-browser profile, exact clean verified source and unchanged real policy.
 * It cannot activate the missing server/profile, grant slots or resume/replay.
 */
const ROOT = "/home/bigrus/projects/palcare";
const APP = "/tmp/opencode/palcare-north-1a-verification/app";
const OUTPUT = `/tmp/opencode/${NORTH_FULL_CAMPAIGN}`;
const PROFILE = `${OUTPUT}/test-profile`;
const TARGET = "http://127.0.0.1:3193";
const POLICY = "c29c6d4d-24dd-471d-8d98-c51772dc64cd";
const LOCK = `/tmp/opencode/.north-1a-${POLICY}.lock`;
const ATTEMPTS = 72;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
class Stop extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const requireThat = (value: unknown, code: string) => {
  if (!value) throw new Stop(code);
};
async function hostState() {
  const files = ownerFiles();
  await privateDirectory(files.directory);
  const state = await files.read("owner-state.json");
  requireThat(state, "north_existing_owner_accounting_required");
  return state as {
    policy: { id: string; requestLimit: number };
    events: { kind: string; subject: string; at: number }[];
  };
}
const reserved = (state: Awaited<ReturnType<typeof hostState>>) =>
  state.events.filter((e) => e.kind === "reserve").length;
async function privateDirectory(path: string) {
  const stat = await lstat(path);
  requireThat(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      (stat.mode & 0o077) === 0 &&
      stat.uid === process.getuid?.() &&
      (await realpath(path)) === path,
    "north_private_directory_required",
  );
}
async function privateJson(path: string) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    requireThat(
      stat.isFile() &&
        stat.nlink === 1 &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 0o077) === 0 &&
        stat.size <= 131072,
      "north_private_runtime_record_required",
    );
    return JSON.parse(await handle.readFile("utf8"));
  } finally {
    await handle.close();
  }
}

async function run() {
  const workspace = assertWorkspace();
  requireThat(
    workspace.root === ROOT && workspace.branch === "main" && !workspace.dirty,
    "north_clean_verified_primary_required",
  );
  requireThat(
    new Date().toISOString().slice(0, 10) === NORTH_RECORDS_DRAFT_REFERENCE,
    "north_draft_reference_must_be_refrozen_before_dispatch",
  );
  inspectDraftOracles();
  await privateDirectory(OUTPUT);
  // The operator-approved launcher must independently establish this loopback
  // instance. This command never starts/refreshes/replaces any application.
  const runtime = (await privateJson(`${OUTPUT}/isolated-runtime.json`)) as {
    pid: number;
    sourceHash: string;
    buildId: string;
    commit: string;
    origin: string;
    target: string;
  };
  const build = JSON.parse(
    await readFile(`${APP}/.next/palcare-build.json`, "utf8"),
  ) as { sourceHash: string; buildId: string; commit: string };
  requireThat(
    runtime.target === TARGET &&
      runtime.origin === OWNER_ORIGIN &&
      runtime.commit === workspace.commit &&
      build.commit === workspace.commit &&
      runtime.buildId === build.buildId &&
      runtime.sourceHash === build.sourceHash &&
      build.sourceHash === sourceHash(),
    "north_exact_isolated_source_required",
  );
  requireThat(
    Number.isSafeInteger(runtime.pid) &&
      runtime.pid > 1 &&
      (await realpath(`/proc/${runtime.pid}/cwd`)) === APP,
    "north_isolated_listener_identity_required",
  );
  await privateDirectory(PROFILE);
  const lock = await open(LOCK, "wx", 0o600);
  const lockIdentity = await lock.stat();
  let context: BrowserContext | undefined;
  let journal: Awaited<ReturnType<typeof open>> | undefined;
  let previousHash = "0".repeat(64);
  let genuine = 0,
    passed = 0;
  let activeCase: {
    id: string;
    message: string;
    dispatched: boolean;
    requestId?: string;
    conversationId?: string;
  } | null = null;
  const append = async (entry: Record<string, unknown>) => {
    const value = {
      campaign: NORTH_FULL_CAMPAIGN,
      at: Date.now(),
      previousHash,
      ...entry,
    };
    previousHash = hash(value);
    await journal!.writeFile(
      `${JSON.stringify({ ...value, hash: previousHash })}\n`,
    );
    await journal!.sync();
  };
  try {
    const before = await hostState();
    requireThat(
      before.policy.id === POLICY && before.policy.requestLimit === 300,
      "north_existing_policy_required",
    );
    const baseline = reserved(before);
    requireThat(
      before.policy.requestLimit - baseline >= ATTEMPTS,
      "north_existing_capacity_insufficient_for_bounded_tranche",
    );
    context = await chromium.launchPersistentContext(PROFILE, {
      headless: true,
      serviceWorkers: "block",
      viewport: { width: 1440, height: 1000 },
    });
    // Never rotate a records cookie to evade an existing bucket. This initial
    // tranche needs an untouched, separately authorized test-browser profile.
    requireThat(
      !(await context.cookies(OWNER_ORIGIN)).some(
        (cookie) => cookie.name === "palcare-records",
      ),
      "north_existing_records_activity_requires_inspection_not_cookie_rotation",
    );
    const guard = await guardRecordsCampaign(
      context,
      OWNER_ORIGIN,
      async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        // Only the guarded exact-origin request is forwarded to this one fixed
        // loopback server. Browser proof stays in transport, never a saved export.
        const response = await route.fetch({
          url: `${TARGET}${url.pathname}${url.search}`,
          headers: {
            ...(await request.allHeaders()),
            host: new URL(OWNER_ORIGIN).host,
          },
          maxRedirects: 0,
          timeout: 60000,
        });
        await route.fulfill({ response });
      },
      async (input, conversationId, target) => {
        requireThat(
          journal &&
            activeCase &&
            !activeCase.dispatched &&
            target === "interpret" &&
            input.message === activeCase.message,
          "north_unexpected_or_duplicate_model_submission",
        );
        activeCase!.dispatched = true;
        activeCase!.requestId = input.requestId;
        activeCase!.conversationId = conversationId;
        await append({
          kind: "case-dispatch",
          caseId: activeCase!.id,
          input,
          conversationId,
          target,
          commit: workspace.commit,
          sourceHash: build.sourceHash,
        });
      },
    );
    const page = await context.newPage();
    const applicationErrors: string[] = [];
    page.on("pageerror", () =>
      applicationErrors.push("browser_application_error"),
    );
    await page.goto(`${OWNER_ORIGIN}/dashboard`);
    const ready = await page.evaluate(async () => {
      const response = await fetch("/api/ai/owner", { cache: "no-store" });
      return response.ok ? response.json() : null;
    });
    requireThat(
      ownerSendState(ready) === "ready",
      "north_existing_test_browser_access_required",
    );
    // Exclusive creation makes this tranche one-shot: a partial/unknown ledger
    // cannot be replaced, replayed, truncated or treated as a fresh allowance.
    const frozen = {
      campaign: NORTH_FULL_CAMPAIGN,
      frozenAt: Date.now(),
      commit: workspace.commit,
      build,
      bundledFixtureHash: hash(demoData),
      oracleHash: hash(demoFixtureMaterial()),
      cases: northFullRecordsDrafts,
    };
    const manifest = await open(
      `${OUTPUT}/initial-records-frozen.json`,
      "wx",
      0o600,
    );
    try {
      await manifest.writeFile(`${JSON.stringify(frozen, null, 2)}\n`);
      await manifest.sync();
    } finally {
      await manifest.close();
    }
    journal = await open(`${OUTPUT}/initial-records.jsonl`, "wx", 0o600);
    await append({
      kind: "start",
      manifestHash: hash(frozen),
      originalPolicyHash: hash(before.policy),
      originalEventPrefixHash: hash(before.events),
      reservedBefore: baseline,
      attemptCeiling: ATTEMPTS,
      intendedCases: 36,
    });
    const hourSubmissions = new Map<number, number>();
    for (const [index, c] of northFullRecordsDrafts.entries()) {
      const hour = Math.floor(Date.now() / 3600000);
      if ((hourSubmissions.get(hour) ?? 0) >= 25) {
        const until = (hour + 1) * 3600000 + 500;
        await append({
          kind: "rate-wait",
          reason:
            "existing 30-turn owner/hour guard; conservative 25-turn tranche pacing",
          until,
        });
        await delay(Math.max(0, until - Date.now()));
      }
      const midnight =
        Date.parse(`${NORTH_RECORDS_DRAFT_REFERENCE}T00:00:00Z`) + 86400000;
      requireThat(
        new Date().toISOString().slice(0, 10) ===
          NORTH_RECORDS_DRAFT_REFERENCE && Date.now() < midnight - 60000,
        "north_frozen_reference_date_boundary_stop",
      );
      const current = await hostState();
      requireThat(
        hash(current.policy) === hash(before.policy) &&
          hash(current.events.slice(0, before.events.length)) ===
            hash(before.events),
        "north_policy_or_original_event_prefix_changed",
      );
      requireThat(
        current.events
          .slice(before.events.length)
          .every(
            (e) =>
              !["unknown", "provider-block", "revoke-policy"].includes(e.kind),
          ),
        "north_new_unknown_or_provider_denial_stop",
      );
      requireThat(
        reserved(current) - baseline <= ATTEMPTS - 2 &&
          current.policy.requestLimit - reserved(current) >= 2,
        "north_nested_or_existing_capacity_stop",
      );
      requireThat(
        sourceHash() === build.sourceHash &&
          execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: ROOT,
            encoding: "utf8",
          }).trim() === workspace.commit,
        "north_source_changed_during_run",
      );
      const status = await page.evaluate(async () => {
        const response = await fetch("/api/ai/owner", { cache: "no-store" });
        return response.ok ? response.json() : null;
      });
      requireThat(
        ownerSendState(status) === "ready",
        "north_browser_or_provider_authority_stop",
      );
      await append({
        kind: "case-start",
        caseId: c.id,
        input: c.message,
        expected: c,
      });
      activeCase = { id: c.id, message: c.message, dispatched: false };
      const result = await exerciseRecordsScenario(page, c);
      requireThat(
        activeCase.requestId === result.requestId,
        "north_dispatch_response_correlation_mismatch",
      );
      const submittedHour = Math.floor(result.startedAt / 3600000);
      hourSubmissions.set(
        submittedHour,
        (hourSubmissions.get(submittedHour) ?? 0) + 1,
      );
      const after = await hostState();
      const proof = correlateRecordsAttempts(
        after,
        result.requestId,
        result.startedAt,
        POLICY,
      );
      const observation = {
        ...result.observation,
        applicationErrors: [...applicationErrors],
        forbiddenRequests: [...guard.forbiddenRequests],
      };
      const score = assessRecordsCase(c, result.turn, observation, proof);
      await append({
        kind: "case-result",
        caseId: c.id,
        requestId: result.requestId,
        turn: result.turn,
        observation,
        proof,
        score,
        reserved: reserved(after),
        sourceHash: build.sourceHash,
        commit: workspace.commit,
      });
      if (score.genuineEvidence) genuine++;
      if (score.pass) passed++;
      if (!score.pass || index === 0 || index === 18 || index === 35)
        await page.screenshot({
          path: `${OUTPUT}/${c.id.replaceAll(":", "_")}.png`,
        });
      requireThat(
        !score.stopDispatch && score.genuineEvidence,
        "north_terminal_proof_or_unknown_stop",
      );
      requireThat(
        !score.materialFailure,
        "north_material_correctness_failure_stop",
      );
      activeCase = null;
      // Preserve the existing six-turn/minute and 30-turn/hour owner limits.
      if (index < northFullRecordsDrafts.length - 1) await delay(12500);
    }
    await append({
      kind: "finish",
      genuineEvaluatedCases: genuine,
      strictPasses: passed,
      providerRequests: reserved(await hostState()) - baseline,
    });
    console.log(
      JSON.stringify({
        campaign: NORTH_FULL_CAMPAIGN,
        completedTrancheCases: genuine,
        strictPasses: passed,
        targetCases: 200,
        fullAcceptance: false,
        ledger: `${OUTPUT}/initial-records.jsonl`,
      }),
    );
  } catch (error) {
    const code =
      error instanceof Stop
        ? error.code
        : "north_live_case_stopped_inspect_private_evidence";
    if (journal)
      await append({
        kind: "stop",
        code,
        activeCase,
        genuineEvaluatedCases: genuine,
        strictPasses: passed,
      });
    throw new Stop(code);
  } finally {
    try {
      await context?.close();
    } finally {
      try {
        await journal?.close();
      } finally {
        await lock.close();
        const current = await lstat(LOCK);
        if (
          current.ino === lockIdentity.ino &&
          current.dev === lockIdentity.dev
        )
          await unlink(LOCK);
      }
    }
  }
}
function demoFixtureMaterial() {
  return northFullRecordsDrafts.map((c) => ({
    id: c.id,
    query: c.expectedQuery,
    ids: c.expectedIds,
    amount: c.expectedSampleMinor,
    excluded: c.expectedExcluded,
  }));
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--run") {
  void run().catch((error) => {
    console.error(
      error instanceof Stop
        ? error.code
        : "north_live_preflight_denied_no_authority_changed",
    );
    process.exitCode = 1;
  });
} else {
  // No private-file read, browser, server, refresh or inference in preparation.
  console.log(
    JSON.stringify(
      {
        ...inspectDraftOracles(),
        command:
          "--run requires an explicitly approved existing isolated runtime/profile; neither is activated by this command",
        origin: OWNER_ORIGIN,
        target: TARGET,
        liveRunExecuted: false,
      },
      null,
      2,
    ),
  );
}
