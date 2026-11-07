/** Owner-run ONLY. Uses the real private HTTPS application, never direct model
 * calls, injected answers, copied owner cookies or a second provider identity.
 * Batches reopen the SAME protected Chromium profile and owned conversation
 * hints. Completed/unknown attempts are never resubmitted. Never run in CI. */
import { chromium, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  open,
  unlink,
  lstat,
} from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { StandingOwner, OWNER_ORIGIN } from "../src/lib/careos/standing-owner";
import { subscriptionFiles } from "../src/lib/careos/subscription/provider";
import { assertBuild } from "./workspace.mjs";
import { assertCiReceipt } from "./ci-receipt.mjs";
import type { SavedRecord } from "../src/lib/careos/records/contracts";
import {
  CAMPAIGN_EXECUTION_LIMIT,
  QUESTION_MAX_STAGES,
  campaignBudget,
} from "../src/lib/careos/campaign-execution";
import {
  RECOVERY_EVALUATION,
  RECOVERY_SESSION,
  RECOVERY_DEADLINE,
} from "../src/lib/careos/evaluation-recovery";
import type { CareTurn } from "../src/lib/careos/contracts";
import {
  assessLanguageAnswer,
  expectedLanguageRecords,
  type LanguageObservation,
} from "./north-language-assessment";
import {
  submitLanguageTurn,
  verifyLanguageHistory,
} from "./north-language-browser";
import {
  languageAttemptCount,
  languageOriginalPrefixIntact,
  languageStopDisposition,
  rememberLanguageGroup,
  restoreLanguageGroup,
} from "./north-language-lifecycle";
import { stratifyLanguageWork } from "../tests/fixtures/north-language-stratification";
import {
  conversationScenarios,
  languageGoals,
  LANGUAGE_CAMPAIGN,
  type Goal,
  type LanguageCategory,
} from "../tests/fixtures/north-language-library";

type Event = {
  kind: string;
  subject: string;
  at: number;
  allocationId?: string;
  observation?: { httpStatus?: number };
};
type HostState = {
  policy: { id: string };
  events: Event[];
  evaluation?: { id: string; expiresAt: number; sessionId: string };
};
type Work = {
  id: string;
  group: string;
  category: LanguageCategory;
  input: string;
  goal: Goal;
  expected: string;
};
type Progress = {
  campaign: string;
  next: number;
  sessionId: string;
  allocationId: string;
  deadline: number;
  originalPolicyHash: string;
  originalEvents: Event[];
  snapshot: SavedRecord[];
  storage: Record<string, string>;
  activeGroup: string | null;
  turnTimes: number[];
  createTimes: number[];
  paused?: string;
  finished?: boolean;
  holdoutNext?: number;
  retests?: Work[];
  groupStorage?: Record<string, Record<string, string>>;
  pendingDispatch?: { requestId: string; path: string; at: number };
  groupRequestIds?: Record<string, string[]>;
  reviewedCaseIds?: string[];
  reviewedNext?: number;
};
const [action, output, batchText] = process.argv.slice(2);
if (
  action !== "--run-150" ||
  output !== "/tmp/opencode/north-language-300/live" ||
  !/^\d+$/.test(batchText ?? "") ||
  process.argv.length !== 5 ||
  process.env.CI
)
  throw Error(
    "Owner only, after quota authorization and journey acceptance: --run-150 /tmp/opencode/north-language-300/live BATCH_ATTEMPTS (1..30)",
  );
const batch = Number(batchText);
if (batch < 1 || batch > 30) throw Error("bounded_batch_required");
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const owner = new StandingOwner(),
  provider = subscriptionFiles();
const host = async () =>
  (await owner.files.read("owner-state.json")) as HostState;
const used = (s: HostState) => languageAttemptCount(s.events, s.evaluation?.id);
const goal = (id: string, patch: Partial<Goal> = {}): Goal => ({
  ...languageGoals.find((g) => g.id === id)!,
  ...patch,
});
const audio = (
  origin?: "sample" | "sandbox",
  format?: "chart" | "table",
  operation?: "total" | "breakdown",
): Goal =>
  goal(
    format === "chart"
      ? "chart"
      : operation === "total"
        ? "audio-total"
        : "audio",
    {
      filter: { category: "Audio", ...(origin ? { origin } : {}) },
      ...(format ? { format } : {}),
      ...(operation ? { operation } : {}),
    },
  );
const clarify = goal("help"),
  care = goal("pi-care");
function scenarioGoals(index: number, turn: number): Goal {
  const maps: Record<number, Goal[]> = {
    0: [
      goal("receipt"),
      audio("sample"),
      audio("sample", undefined, "total"),
      audio("sample", "chart", "breakdown"),
      audio("sandbox"),
      audio("sandbox", "table"),
      care,
      care,
      clarify,
    ],
    1: [goal("all", { filter: { search: "headphones" } }), goal("receipt")],
    2: [audio(undefined, undefined, "total"), audio(undefined, "table")],
    3: [goal("receipt"), audio("sample")],
    4: [audio(), audio("sandbox")],
    5: [
      audio(undefined, undefined, "total"),
      audio(undefined, undefined, "total"),
    ],
    6: [goal("receipt"), goal("manual")],
    8: [
      goal("missing-receipt"),
      goal("missing-receipt"),
      goal("missing-receipt"),
    ],
    9: [audio("sample"), audio("sample", undefined, "total")],
    10: [
      audio(),
      audio("sample"),
      audio("sample", undefined, "total"),
      audio("sample", "table"),
      goal("sample", { format: "table" }),
    ],
    11: [
      goal("all"),
      audio(),
      audio("sandbox"),
      goal("receipt"),
      goal("all", { filter: { search: "Raspberry Pi" } }),
      care,
      care,
      goal("all"),
      goal("unpriced"),
      goal("unpriced"),
    ],
    15: [goal("all", { filter: { search: "headphones" } }), clarify, clarify],
    16: [clarify, clarify, clarify],
    17: [audio("sample"), audio("sandbox"), audio("sample"), goal("sample")],
    18: [
      goal("sample", {
        filter: { origin: "sample", category: "Audio", receipt: "present" },
      }),
      goal("sample", { filter: { origin: "sample", receipt: "present" } }),
      goal("sample"),
    ],
    19: [
      audio(undefined, "chart", "breakdown"),
      audio(),
      audio(undefined, undefined, "total"),
    ],
    20: [
      goal("totals", { format: "table" }),
      audio("sandbox", "chart", "breakdown"),
      goal("refund"),
    ],
    21: [
      audio(undefined, "chart", "breakdown"),
      audio(undefined, "table"),
      clarify,
    ],
    22: [care, care, goal("manual")],
    23: [goal("refund"), goal("refund"), goal("refund")],
  };
  if (index === 7) return audio();
  if (index === 12)
    return [
      goal("all"),
      audio(),
      audio("sample"),
      audio("sample", undefined, "total"),
      audio("sample", "table"),
    ][turn % 5];
  if (index === 13)
    return turn === 29
      ? clarify
      : [
          goal("all"),
          goal("all", { filter: { category: "Computing" } }),
          goal("unpriced"),
          goal("all", { filter: { receipt: "present" } }),
          goal("verified"),
          goal("all"),
        ][turn % 6];
  return maps[index]?.[turn] ?? clarify;
}
function buildWork(): Work[] {
  const work: Work[] = conversationScenarios.flatMap((s, i) =>
    s.inputs.map((input, n) => ({
      id: `${s.id}-${n + 1}`,
      group: s.id,
      category: s.category,
      input,
      goal: scenarioGoals(i, n),
      expected: s.expected,
    })),
  );
  return work;
}
const planned = stratifyLanguageWork(buildWork());
let work: Work[] = planned.work;
let holdout: Work[] = planned.holdout;
await mkdir(output, { recursive: true, mode: 0o700 });
const stat = await lstat(output);
if (stat.isSymbolicLink() || stat.mode & 0o077)
  throw Error("private_output_required");
const lockPath = join(output, ".run-lock"),
  lock = await open(lockPath, "wx", 0o600);
let context:
    Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined,
  progress: Progress | undefined,
  page: Page | undefined;
let stopReason: string | undefined;
let campaignBrowserId: string | undefined;
let journalFailed = false;
const errors: string[] = [],
  forbidden: string[] = [];
const save = async () => {
  try {
    if (progress)
      await writeFile(
        join(output, "progress.json"),
        JSON.stringify(progress, null, 2),
        { mode: 0o600 },
      );
  } catch {
    journalFailed = true;
    throw Error("campaign_journal_write_failed");
  }
};
const checkpoint = async () => {
  const build = assertBuild(true);
  assertCiReceipt(
    build,
    JSON.parse(await readFile(".next/palcare-ci.json", "utf8")),
  );
  return {
    commit: build.commit,
    buildId: build.buildId,
    sourceHash: build.sourceHash,
  };
};
const emit = async (value: unknown) => {
  try {
    const handle = await open(join(output, "ledger.jsonl"), "a", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    journalFailed = true;
    throw Error("campaign_journal_write_failed");
  }
};
async function schedule(creating = false) {
  if (!progress) return;
  for (;;) {
    const now = Date.now(),
      hour = Math.floor(now / 3600000) * 3600000;
    if (!(await owner.quotaCampaignStatus()).active)
      throw Error("campaign_authorization_denied");
    const turns = progress.turnTimes.filter((t) => t >= hour),
      creates = progress.createTimes.filter((t) => t >= hour),
      recent = (await host()).events
        .filter((e) => e.kind === "reserve" && e.at > now - 60000)
        .map((e) => e.at);
    let wait = 0;
    if (turns.length >= 300 || (creating && creates.length >= 300))
      wait = hour + 3600000 - now + 250;
    if (recent.length >= 27)
      wait = Math.max(wait, Math.min(...recent) + 60001 - now);
    if (!wait) return;
    await emit({
      kind: "quota-wait",
      observedAt: new Date().toISOString(),
      waitMs: wait,
      turnsThisHour: turns.length,
      newConversationsThisHour: creates.length,
    });
    console.log(
      JSON.stringify({
        waitingForExistingApplicationQuota: true,
        until: new Date(now + wait).toISOString(),
      }),
    );
    await delay(wait);
  }
}
async function freshPage(storage?: Record<string, string>) {
  await schedule(!storage);
  if (page) await page.close();
  page = await context!.newPage();
  if (storage)
    await page.addInitScript((values) => {
      for (const [key, value] of Object.entries(values))
        sessionStorage.setItem(key, value);
    }, storage);
  await page.goto(OWNER_ORIGIN + "/dashboard");
  return page;
}
async function observe(turn: CareTurn): Promise<LanguageObservation> {
  const article = page!.locator(
    `[data-native-north-result][data-request-id="${turn.requestId}"]`,
  );
  await expect(article).toBeVisible({ timeout: 30000 });
  const more = article.getByRole("button", { name: /^Show more purchases/ });
  for (let n = 0; n < 100 && (await more.count()); n++) await more.click();
  let nativeReadback = null;
  if (turn.answer.recordsResult?.query.format === "chart") {
    await expect
      .poll(
        async () => {
          const proof = page!.locator(
            '[data-testid="customer-studio"][data-native-readback]',
          );
          if (await proof.count()) {
            const raw = await proof.getAttribute("data-native-readback");
            if (raw && JSON.parse(raw).requestId === turn.requestId)
              return true;
          }
          return (
            (await article.textContent())?.includes("could not be verified") ??
            false
          );
        },
        { timeout: 45000, intervals: [250, 500, 1000] },
      )
      .toBe(true);
    const proof = page!.locator(
      '[data-testid="customer-studio"][data-native-readback]',
    );
    const raw = (await proof.count())
      ? await proof.getAttribute("data-native-readback")
      : null;
    if (raw) nativeReadback = JSON.parse(raw);
  }
  const renderedIds = await article
    .locator('[data-records-result] a[href^="/vault/"]')
    .evaluateAll((elements) => [
      ...new Set(
        elements
          .map((e) => e.getAttribute("href")!.split("/")[2])
          .filter((id) => /^[a-f0-9-]{36}$/.test(id)),
      ),
    ]);
  let linksResolve = true;
  for (const href of [
    ...new Set(
      [...turn.answer.actions, ...turn.answer.sources].map((a) => a.href),
    ),
  ]) {
    if (!href.startsWith("/")) {
      linksResolve = false;
      continue;
    }
    const r = await context!.request.get(OWNER_ORIGIN + href);
    if (!r.ok()) linksResolve = false;
  }
  return {
    requestId: turn.requestId,
    text: await article.innerText(),
    renderedIds,
    linksResolve,
    nativeReadback,
    applicationErrors: [...errors],
    forbiddenRequests: [...forbidden],
  };
}
try {
  const source = await checkpoint();
  const s = await host(),
    registration = await provider.registration();
  if (!registration?.tokens || registration.refreshPending)
    throw Error("provider_connection_not_ready_no_new_access_or_inference");
  await owner.assertHistoricalJournal(await provider.read("session.json"));
  const status = await owner.status({ agent: "campaign-preflight" });
  if (status.revoked || status.providerBlocked || status.policy !== "approved")
    throw Error("provider_or_policy_blocked");
  try {
    progress = JSON.parse(
      await readFile(join(output, "progress.json"), "utf8"),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (progress?.finished) throw Error("campaign_already_closed_no_replay");
  if (progress?.paused)
    throw Error("campaign_paused_review_required_no_replay");
  if (progress?.pendingDispatch)
    throw Error("unreconciled_application_dispatch_no_replay");
  if (
    progress &&
    (!s.evaluation ||
      progress.allocationId !== s.evaluation.id ||
      hash(s.policy) !== progress.originalPolicyHash)
  )
    throw Error("campaign_authority_changed");
  if (
    !progress ||
    !s.evaluation ||
    progress.allocationId !== RECOVERY_EVALUATION ||
    s.evaluation.id !== RECOVERY_EVALUATION ||
    progress.sessionId !== RECOVERY_SESSION ||
    s.evaluation.sessionId !== RECOVERY_SESSION ||
    progress.deadline !== RECOVERY_DEADLINE ||
    s.evaluation.expiresAt !== RECOVERY_DEADLINE
  )
    throw Error("existing_evaluation_required_no_replacement");
  const authorization = await owner.quotaCampaignStatus();
  if (!authorization.active || !authorization.browserSessionId)
    throw Error("approved_quota_policy_and_authenticated_browser_required");
  campaignBrowserId = authorization.browserSessionId;
  // Broader batches must not precede the separately observed complete journey.
  // This records observed journey review, never authority or human acceptance.
  const journeyPath = join(output, "journey-150-accepted.json");
  const journeyStat = await lstat(journeyPath);
  if (
    !journeyStat.isFile() ||
    journeyStat.isSymbolicLink() ||
    journeyStat.mode & 0o077 ||
    journeyStat.uid !== process.getuid?.()
  )
    throw Error("private_journey_acceptance_required");
  const journey = JSON.parse(await readFile(journeyPath, "utf8"));
  if (
    journey.evaluationId !== RECOVERY_EVALUATION ||
    journey.sessionId !== RECOVERY_SESSION ||
    journey.executionLimit !== CAMPAIGN_EXECUTION_LIMIT ||
    journey.authorizationHash !== authorization.authorizationHash ||
    journey.commit !== source.commit ||
    journey.sourceHash !== source.sourceHash ||
    journey.buildId !== source.buildId ||
    journey.decision !== "accept-continuous-journey" ||
    !Number.isSafeInteger(journey.reviewedAt) ||
    journey.reviewedAt <= authorization.approvedAt ||
    journey.reviewedAt > Date.now() ||
    !/^[a-f0-9]{64}$/.test(journey.evidenceHash ?? "") ||
    journey.ninthAndSimplificationPassed !== true ||
    journey.nativeSdkReadbackPassed !== true
  )
    throw Error("reviewed_continuous_journey_required");
  if (progress) {
    const manifest = JSON.parse(
      await readFile(join(output, "work.json"), "utf8"),
    );
    work = manifest.work;
    holdout = manifest.holdout;
    if (progress.reviewedCaseIds) {
      const ids = progress.reviewedCaseIds;
      const catalog = new Map<string, Work>(
        [...work, ...holdout].map((item) => [item.id, item]),
      );
      if (
        !ids.length ||
        ids.length > 87 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !catalog.has(id))
      )
        throw Error("distinct_frozen_library_cases_required");
      work = ids.map((id) => catalog.get(id)!);
      holdout = [];
    }
  }
  await mkdir(join(output, "profile"), { recursive: true, mode: 0o700 });
  context = await chromium.launchPersistentContext(join(output, "profile"), {
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  await context.route("**/*", async (route) => {
    const r = route.request(),
      u = new URL(r.url()),
      read = ["GET", "HEAD"].includes(r.method());
    const allowedPost =
      r.method() === "POST" &&
      /^\/api\/careos\/records\/conversations(?:\/[a-f0-9-]{36}\/(?:turns|interpret))?$/.test(
        u.pathname,
      );
    if (
      u.origin !== OWNER_ORIGIN ||
      /^\/api\/(checkout|operator|guardian|paypal|payments)(\/|$)/.test(
        u.pathname,
      ) ||
      (!read && !allowedPost)
    ) {
      forbidden.push(
        `${r.method()} ${u.origin === OWNER_ORIGIN ? u.pathname : "external-origin"}`,
      );
      return route.abort("blockedbyclient");
    }
    if (
      r.method() === "POST" &&
      /^\/api\/careos\/(?:records\/)?conversations\/[a-f0-9-]{36}\/(turns|interpret)$/.test(
        u.pathname,
      )
    ) {
      if (progress) {
        if (
          !(await owner.quotaCampaignStatus()).active ||
          campaignBudget((await host()).events).availableForNewQuestion <
            QUESTION_MAX_STAGES
        )
          return route.abort("blockedbyclient");
        progress.turnTimes.push(Date.now());
        progress.pendingDispatch = {
          requestId: r.postDataJSON().requestId,
          path: u.pathname,
          at: Date.now(),
        };
        await save();
        await emit({
          kind: "application-dispatch",
          at: Date.now(),
          group: progress.activeGroup,
          path: u.pathname,
          input: r.postDataJSON(),
        });
      }
    }
    if (
      progress &&
      r.method() === "POST" &&
      u.pathname === "/api/careos/records/conversations"
    ) {
      progress.createTimes.push(Date.now());
      await save();
    }
    return route.continue();
  });
  const initialUsed = used(await host());
  const workIndex = () =>
    progress!.reviewedCaseIds ? (progress!.reviewedNext ?? 0) : progress!.next;
  while (
    (workIndex() < work.length ||
      (progress.retests?.length ?? 0) > 0 ||
      (progress.holdoutNext ?? 0) < holdout.length) &&
    campaignBudget((await host()).events).availableForNewQuestion >=
      QUESTION_MAX_STAGES &&
    used(await host()) - initialUsed + QUESTION_MAX_STAGES <= batch
  ) {
    // Meaningful holdouts are scheduled by reviewed work, not a usage target.
    const isHoldout = workIndex() >= work.length && !progress.retests?.length;
    const isRetest = !isHoldout && (progress.retests?.length ?? 0) > 0;
    const item = isHoldout
      ? holdout[(progress.holdoutNext ?? 0) % holdout.length]
      : isRetest
        ? progress.retests![0]
        : work[workIndex()];
    if (!item) throw Error("meaningful_frozen_cases_exhausted");
    await schedule(item.group !== progress.activeGroup);
    if (item.group !== progress.activeGroup) {
      if (page && progress.activeGroup) {
        rememberLanguageGroup(
          progress,
          await page.evaluate(() =>
            Object.fromEntries(Object.entries(sessionStorage)),
          ),
        );
        await save();
      }
      const restored = restoreLanguageGroup(progress, item.group);
      await freshPage(restored);
      progress.activeGroup = item.group;
      progress.storage = restored ?? {};
      await save();
    } else if (!page) await freshPage(progress.storage);
    const before = await host();
    if (!languageOriginalPrefixIntact(before.events, progress.originalEvents))
      throw Error("original_event_prefix_changed");
    if (hash(before.policy) !== progress.originalPolicyHash)
      throw Error("original_policy_changed");
    const browserStatus = await page!.evaluate(async () =>
      (await fetch("/api/ai/owner")).json(),
    );
    if (
      !browserStatus.remembered ||
      !browserStatus.evaluation?.browserBound ||
      browserStatus.evaluation.id !== progress.allocationId ||
      browserStatus.revoked ||
      browserStatus.providerBlocked ||
      browserStatus.campaign?.executionLimit !== CAMPAIGN_EXECUTION_LIMIT ||
      browserStatus.campaign.authorization !== "quota-bounded" ||
      browserStatus.campaign.authorized !== true ||
      browserStatus.campaign.availableForNewQuestion < QUESTION_MAX_STAGES ||
      browserStatus.campaign.questionActive
    )
      throw Error("actual_browser_authority_denied");
    const startedAt = Date.now();
    const response = await submitLanguageTurn(page!, item.input),
      body = await response.json(),
      request = response.request().postDataJSON(),
      after = await host();
    const events = after.events.filter(
      (e) =>
        e.allocationId === progress!.allocationId &&
        e.subject.startsWith(`customer:${request.requestId}:`),
    );
    const reservations = events.filter((e) => e.kind === "reserve"),
      unknown = events.some((e) => e.kind === "unknown"),
      unsettled = reservations.some(
        (e) =>
          !events.some(
            (t) =>
              t.subject === e.subject &&
              ["completed", "failed", "unknown"].includes(t.kind),
          ),
      );
    // Persist dispatch evidence BEFORE attempting UI observations. A broken
    // locator/render must never erase an actual model attempt or invite replay.
    await emit({
      kind: "provider-observation",
      caseId: item.id,
      category: item.category,
      input: item.input,
      startedAt,
      httpStatus: response.status(),
      applicationRequest: request,
      turn: body,
      events,
      providerAttempts: reservations.length,
      source: await checkpoint(),
    });
    if (isHoldout) progress.holdoutNext = (progress.holdoutNext ?? 0) + 1;
    else if (isRetest) progress.retests!.shift();
    else if (progress.reviewedCaseIds) progress.reviewedNext = workIndex() + 1;
    else progress.next++;
    delete progress.pendingDispatch;
    const priorRequestId = progress.groupRequestIds?.[item.group]?.at(-1);
    if (response.ok() && body.answer) {
      progress.groupRequestIds ??= {};
      progress.groupRequestIds[item.group] = [
        ...(progress.groupRequestIds[item.group] ?? []),
        request.requestId,
      ];
    }
    await save();
    let observation: LanguageObservation | undefined,
      assessment: ReturnType<typeof assessLanguageAnswer> | undefined;
    if (response.ok() && body.answer) {
      try {
        observation = await observe(body as CareTurn);
        assessment = assessLanguageAnswer(
          item.goal,
          progress.snapshot,
          body.answer,
          observation,
        );
        if (item.id.replace(/(?:-R\d+)+$/, "") === "NC-22-3") {
          if (!priorRequestId) throw Error("owned_previous_result_required");
          const beforeHistory = used(await host());
          const history = await verifyLanguageHistory(
            page!,
            priorRequestId,
            expectedLanguageRecords(progress.snapshot, audio()).map(
              (record) => record.id,
            ),
          );
          const afterHistory = used(await host());
          await emit({
            kind: "history-observation",
            caseId: item.id,
            group: item.group,
            expectedRequestId: priorRequestId,
            history,
            providerAttempts: afterHistory - beforeHistory,
            source: await checkpoint(),
          });
          const check = {
            name: "Read-only History restored the exact prior result with zero provider attempts",
            pass:
              history.attemptedWrites.length === 0 &&
              afterHistory === beforeHistory,
          };
          assessment.checks.push(check);
          if (!check.pass) assessment.failures.push(check.name);
          assessment.automatedPass = assessment.checks.every(
            (entry) => entry.pass,
          );
        }
      } catch {
        if (journalFailed) throw Error("campaign_journal_write_failed");
        assessment = {
          checks: [{ name: "Actual UI observation completed", pass: false }],
          failures: ["Actual UI observation completed"],
          automatedPass: false,
          semanticReviewRequired: true,
          expectedIds: [],
        };
      }
    }
    const evidence = {
      kind: "evaluation",
      caseId: item.id,
      group: item.group,
      category: item.category,
      input: item.input,
      expected: item.expected,
      startedAt,
      finishedAt: Date.now(),
      source: await checkpoint(),
      applicationRequest: request,
      httpStatus: response.status(),
      turn: body,
      providerAttempts: reservations.length,
      events,
      observation,
      assessment,
    };
    await emit(evidence);
    console.log(
      JSON.stringify({
        case: item.id,
        attempts: reservations.length,
        campaignUsed: used(after),
        http: response.status(),
        automatedPass: assessment?.automatedPass ?? false,
        failures: assessment?.failures ?? [],
      }),
    );
    rememberLanguageGroup(
      progress,
      await page!.evaluate(() =>
        Object.fromEntries(Object.entries(sessionStorage)),
      ),
    );
    await save();
    if (
      forbidden.length > 0 ||
      unknown ||
      unsettled ||
      after.events
        .slice(before.events.length)
        .some((e) => e.kind === "provider-block")
    )
      throw Error("new_unknown_unsettled_or_provider_block_no_replay");
    if (
      !response.ok() ||
      !reservations.length ||
      !events.some((e) => e.kind === "completed")
    )
      throw Error("genuine_completion_not_established");
    if (assessment && !assessment.automatedPass) {
      await page!.screenshot({
        path: join(output, `${progress.next}-failure.png`),
        fullPage: true,
      });
      progress.paused = `${item.id}: ${assessment.failures.join(", ")}`;
      await save();
      break;
    }
  }
  if (
    campaignBudget((await host()).events).availableForNewQuestion <
    QUESTION_MAX_STAGES
  ) {
    progress.finished = true;
    await owner.revokeSession(campaignBrowserId);
    await save();
  }
} catch (e) {
  stopReason =
    e instanceof Error && /^[a-z_]+$/.test(e.message)
      ? e.message
      : "campaign_execution_stopped_review_private_evidence";
  if (progress) {
    const disposition = languageStopDisposition({
      reason: stopReason,
      allocationId: progress.allocationId,
      events: (await host()).events,
      pendingDispatch: !!progress.pendingDispatch,
      unsafeBoundary: forbidden.length > 0 || journalFailed,
      expired: !campaignBrowserId,
    });
    if (disposition !== "unchanged") {
      progress.paused = stopReason;
      if (disposition === "revoke" && campaignBrowserId)
        await owner.revokeSession(campaignBrowserId);
      try {
        await save();
      } catch {
        if (campaignBrowserId) await owner.revokeSession(campaignBrowserId);
        throw Error("campaign_journal_write_failed");
      }
    }
  }
} finally {
  await context?.close();
  await lock.close();
  await unlink(lockPath);
  const s = await host();
  const summary = {
    campaign: LANGUAGE_CAMPAIGN,
    observedAt: new Date().toISOString(),
    totalAttempts: used(s),
    baselineAttempts: 63,
    additionalAttempts: Math.max(0, used(s) - 63),
    historicalGrant: 300,
    executionCeiling: CAMPAIGN_EXECUTION_LIMIT,
    remaining: campaignBudget(s.events).remaining,
    next: progress?.next ?? 0,
    paused: progress?.paused ?? null,
    finished: progress?.finished ?? false,
    stopReason,
    originalAllocation: await owner.status({ agent: "campaign-closeout" }),
  };
  await writeFile(
    join(output, "latest-summary.json"),
    JSON.stringify(summary, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(summary));
  if (stopReason) process.exitCode = 1;
}
