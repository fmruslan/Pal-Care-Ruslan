import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { contextOf, CareError } from "../src/lib/careos/contracts";
import { groundedAnswer } from "../src/lib/careos/grounding";
import { referenceSource } from "../src/lib/careos/knowledge";
import { MODEL_TIMEOUT_MS } from "../src/lib/careos/model-policy";
import {
  CARE_INSTRUCTIONS,
  CARE_SELECTION_INSTRUCTIONS,
  CARE_PROMPT_VERSION,
  classificationSchema,
  explanationSchema,
  evidenceSelectionSchema,
} from "../src/lib/careos/providers/responses";
import {
  StandingOwner,
  standingPolicySchema,
  OWNER_ORIGIN,
  type OwnerProof,
} from "../src/lib/careos/standing-owner";
import {
  RESOURCE,
  TOKEN,
  type Transport,
} from "../src/lib/careos/subscription/auth";
import { PilotError } from "../src/lib/careos/subscription/files";
import { safeFailure } from "../src/lib/careos/subscription/pilot";
import { subscriptionFiles } from "../src/lib/careos/subscription/provider";
import { standingStructured } from "../src/lib/careos/subscription/standing";
import { demoData } from "../src/lib/demo/fixtures";
import {
  north1aCases,
  north1aFixtureMaterial,
  NORTH_1A_COUNTS,
  NORTH_1A_VERSION,
  type NorthCase,
} from "../tests/fixtures/north-1a-live";
import {
  north1aAdditionalCases,
  north1aAdditionalFixtureMaterial,
  NORTH_1A_ADDITIONAL_COUNTS,
  NORTH_1A_ADDITIONAL_VERSION,
} from "../tests/fixtures/north-1a-additional-live";
import {
  north1aFollowupCases,
  north1aFollowupFixtureMaterial,
  NORTH_1A_FOLLOWUP_COUNTS,
  NORTH_1A_FOLLOWUP_VERSION,
} from "../tests/fixtures/north-1a-followup-live";

/** OWNER-RUN PREPARATION. Never imported by CI; no arguments means NO calls.
 *
 * pnpm exec tsx scripts/evaluate-north-1a.ts --check
 * pnpm exec tsx scripts/evaluate-north-1a.ts --run /tmp/opencode/north-1a-UNIQUE/unique.jsonl --initial
 * pnpm exec tsx scripts/evaluate-north-1a.ts --review /tmp/opencode/north-1a-UNIQUE/unique.jsonl
 * pnpm exec tsx scripts/evaluate-north-1a.ts --run /tmp/opencode/north-1a-UNIQUE/unique.jsonl --finish
 *
 * --run requires the four existing standing-runtime flags (see help), real host
 * files and the EXACT already-approved policy. There is no env-file loader,
 * token export, fake provider, new policy, DB, HTTP preview, UI or paid fallback.
 * Only a fresh narrowly named evaluation session is paired/approved/finished and
 * revoked; existing browser sessions, history and policy are never edited.
 *
 * Default: initial = first 12 cases, finish = remaining 48. Explicit
 * --additional-100 selects ONE separately approved fixed batch (20 + 80).
 * --followup-50 selects ONE further approved fixed batch (10 + 40). Neither is
 * another original run or configurable budget. All share the original lock and
 * real owner accounting. A repeated approval cannot create another batch.
 * Finish requires an entirely
 * completed, unambiguous initial phase (semantic failures may be reviewed).
 * Every attempt, including the production safe retry, consumes the nested
 * ceiling. A retry or failure can leave the selected milestone INCOMPLETE; it
 * never licenses an extra attempt, a replacement case, replay or a new ledger.
 * Unknown/denied work stops; no stale-lock stealing or automatic recovery.
 */
const ROOT = "/home/bigrus/projects/palcare";
const POLICY = "c29c6d4d-24dd-471d-8d98-c51772dc64cd";
const MAX = 60;
const INITIAL = 12;
const REGISTRY = `/tmp/opencode/north-1a-${POLICY}.registry.json`;
const LOCK = `/tmp/opencode/.north-1a-${POLICY}.lock`;
const ORIGINAL_FIXTURE_HASH =
  "324e2b7eb228066179a15a1cbed330a99a0a14fe93184eaf30f45a4c60fdb0c0";
const ADDITIONAL_APPROVAL = "north-1a-owner100-20261102-a";
const ADDITIONAL_PATH = `/tmp/opencode/${ADDITIONAL_APPROVAL}/unique.jsonl`;
const FOLLOWUP_APPROVAL = "north-1a-owner50-20261102-a";
const FOLLOWUP_PATH = `/tmp/opencode/${FOLLOWUP_APPROVAL}/unique.jsonl`;
// Each approved batch is fixed code, not a CLI/environment budget override.
const ORIGINAL_BATCH = {
  max: MAX,
  initial: INITIAL,
  registry: REGISTRY,
  version: NORTH_1A_VERSION,
  cases: north1aCases,
  counts: NORTH_1A_COUNTS,
  material: north1aFixtureMaterial,
} as const;
const ADDITIONAL_BATCH = {
  max: 100,
  initial: 20,
  registry: `/tmp/opencode/north-1a-${POLICY}.additional-100-owner20261102-a.registry.json`,
  version: NORTH_1A_ADDITIONAL_VERSION,
  cases: north1aAdditionalCases,
  counts: NORTH_1A_ADDITIONAL_COUNTS,
  material: north1aAdditionalFixtureMaterial,
} as const;
const FOLLOWUP_BATCH = {
  max: 50,
  initial: 10,
  registry: `/tmp/opencode/north-1a-${POLICY}.followup-50-owner20261102-a.registry.json`,
  version: NORTH_1A_FOLLOWUP_VERSION,
  cases: north1aFollowupCases,
  counts: NORTH_1A_FOLLOWUP_COUNTS,
  material: north1aFollowupFixtureMaterial,
} as const;
const ZERO = "0".repeat(64);
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
class Stop extends Error {
  constructor(public code: string) {
    super(code);
  }
}
function requireThat(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Stop(code);
}
function errorCode(error: unknown) {
  if (
    error instanceof Stop ||
    error instanceof CareError ||
    error instanceof PilotError
  )
    return /^[a-z0-9_-]{1,120}$/.test(error.code) ? error.code : "north_denied";
  return safeFailure(error); // Never print provider bodies, error.message or stacks.
}
const schemaFor = (c: NorthCase) =>
  c.method === "classify"
    ? classificationSchema
    : c.method === "explain"
      ? explanationSchema
      : evidenceSelectionSchema;
const nameFor = (c: NorthCase) =>
  c.method === "classify"
    ? "careos_intent"
    : c.method === "explain"
      ? "careos_care"
      : "careos_evidence";
const promptFor = (c: NorthCase) =>
  c.method === "selectEvidence"
    ? CARE_SELECTION_INSTRUCTIONS
    : CARE_INSTRUCTIONS;
const flagsEnabled = () =>
  process.env.CAREOS_OWNER_MODE === "true" &&
  process.env.APP_ORIGIN === OWNER_ORIGIN &&
  process.env.CAREOS_SUBSCRIPTION_CREDITS_DISABLED === "true" &&
  process.env.CAREOS_STANDING_AI_ENABLED === "true";

function requireEvaluationSlot(
  used: number,
  phaseCap: number,
  initial = INITIAL,
  max = MAX,
) {
  requireThat(
    Number.isInteger(used) &&
      used >= 0 &&
      [initial, max].includes(phaseCap) &&
      used < phaseCap,
    "north_nested_phase_ceiling_stop",
  );
}

type Check = {
  dimension: "accuracy" | "grounding" | "usability" | "formatting" | "context";
  name: string;
  pass: boolean;
};
/** Deliberately explicit semantic checks, not a schema-only pass. Still requires
 * human review of every raw value, applicability and rendered selection. */
export function score(c: NorthCase, raw: unknown) {
  const checks: Check[] = [];
  const check = (dimension: Check["dimension"], name: string, pass: boolean) =>
    checks.push({ dimension, name, pass });
  const parsed = schemaFor(c).safeParse(raw);
  check("formatting", "actual production structured schema", parsed.success);
  const payload = JSON.parse(c.payload);
  let rendered: unknown = null;
  if (parsed.success && c.method === "classify") {
    const value = classificationSchema.parse(raw);
    check(
      "accuracy",
      `expected intent ${c.expected.intent}`,
      value.intent === c.expected.intent,
    );
    check(
      "context",
      `intent applies to declared ${c.review.effectiveScope} scope, not a substituted purchase answer`,
      value.intent === c.expected.intent,
    );
    check(
      "usability",
      "bounded intent or honest unsupported result",
      value.intent === c.expected.intent,
    );
  } else if (parsed.success && c.method === "selectEvidence") {
    const value = evidenceSelectionSchema.parse(raw);
    const facts = payload.facts as { id: string; text: string }[];
    const ids = value.factIds;
    check(
      "grounding",
      "only existing exact given facts, no duplicates",
      new Set(ids).size === ids.length &&
        ids.every((id) => facts.some((f) => f.id === id)),
    );
    check(
      "accuracy",
      "all task-critical facts selected",
      (c.expected.requiredFactIds ?? []).every((id) => ids.includes(id)),
    );
    check(
      "usability",
      "no irrelevant or misleading fact selected",
      ids.every((id) => c.expected.allowedFactIds?.includes(id)),
    );
    check(
      "context",
      "exact current Twin in supplied packet",
      payload.context?.twinId === c.review.persistentTwinId &&
        (c.expected.requiredFactIds ?? []).every((id) => ids.includes(id)),
    );
    if (c.expected.orderedFactIds)
      check(
        "formatting",
        "requested factual order",
        digest(ids) === digest(c.expected.orderedFactIds),
      );
    rendered = ids.map(
      (id) => facts.find((f) => f.id === id) ?? { id, unavailable: true },
    );
  } else if (parsed.success && c.method === "explain") {
    const value = explanationSchema.parse(raw);
    const passages = payload.untrustedPassages as {
      id: string;
      content: string;
    }[];
    const exactProduct =
      payload.product?.brand === referenceSource.brand &&
      payload.product?.model === referenceSource.model;
    check(
      "accuracy",
      `expected outcome ${c.expected.outcome}`,
      value.outcome === c.expected.outcome,
    );
    check(
      "grounding",
      "every quote is exact and uses the supplied source identity",
      value.steps.every((s) =>
        passages.some(
          (p) => p.id === s.sourceId && p.content.includes(s.quote),
        ),
      ),
    );
    check(
      "context",
      "no care instructions for absent/wrong product or unsupported conditions",
      value.outcome === c.expected.outcome &&
        (value.outcome === "insufficient"
          ? value.steps.length === 0
          : exactProduct),
    );
    check(
      "usability",
      "useful steps or explicit no-evidence result",
      value.outcome === "insufficient"
        ? value.steps.length === 0
        : value.steps.length > 0,
    );
    check(
      "formatting",
      `at most ${c.expected.maxSteps ?? 2} concise steps`,
      value.steps.length <= (c.expected.maxSteps ?? 2),
    );
    const quotes = value.steps.map((s) => s.quote).join("\n");
    for (const topic of c.expected.quoteTopics ?? [])
      check(
        "accuracy",
        `quoted evidence answers topic: ${topic}`,
        new RegExp(topic, "i").test(quotes),
      );
    check(
      "grounding",
      "no unsupported procedure/financial claim in model paraphrase (heuristic)",
      !/save (?:your )?work|sudo\b|unplug immediately|hold (?:the )?power button|alcohol|liquid|wipe|refund|warranty|guarantee|https?:|<\/?[a-z]/i.test(
        value.steps.map((s) => s.text).join("\n"),
      ),
    );
    const record = demoData.twins.find(
      (t) => t.id === c.review.persistentTwinId,
    );
    const product = demoData.products.find((p) => p.id === record?.productId);
    if (record && product) {
      try {
        rendered = groundedAnswer(
          {
            outcome: "answered",
            mode: "deterministic",
            context: contextOf({ twin: record, product }),
            revision: 1,
            text: "",
            steps: [],
            sources: [],
            actions: [],
          },
          value,
          exactProduct ? [referenceSource] : [],
        );
        check(
          "grounding",
          "existing application grounding/render contract accepts selection",
          true,
        );
      } catch (error) {
        rendered = { error: errorCode(error) };
        check(
          "grounding",
          "existing application grounding/render contract accepts selection",
          false,
        );
      }
    }
  }
  const dimensions = [
    "accuracy",
    "grounding",
    "usability",
    "formatting",
    "context",
  ] as const;
  const scores = Object.fromEntries(
    dimensions.map((dimension) => {
      const relevant = checks.filter((c) => c.dimension === dimension);
      return [
        dimension,
        relevant.length ? Number(relevant.every((c) => c.pass)) : null,
      ];
    }),
  );
  return {
    scores,
    checks,
    automaticPass: checks.every((c) => c.pass),
    rendered,
    semanticReview:
      "REQUIRED for every value; adapter-only, not browser acceptance. Null dimension = not evaluated, never an invented score.",
  };
}

function createHarness(additional: boolean, followup = false) {
  const batch = followup
    ? FOLLOWUP_BATCH
    : additional
      ? ADDITIONAL_BATCH
      : ORIGINAL_BATCH;
  const separate = additional || followup;
  const approval = followup ? FOLLOWUP_APPROVAL : ADDITIONAL_APPROVAL;
  const fixedPath = followup ? FOLLOWUP_PATH : ADDITIONAL_PATH;
  const {
    max: MAX,
    initial: INITIAL,
    registry: REGISTRY,
    version: NORTH_1A_VERSION,
    cases: north1aCases,
    counts: NORTH_1A_COUNTS,
    material: north1aFixtureMaterial,
  } = batch;
  const fixtureHash = () => digest(north1aFixtureMaterial);
  const evaluationSlot = (used: number, phaseCap: number) =>
    requireEvaluationSlot(used, phaseCap, INITIAL, MAX);

  function validateCorpus() {
    requireThat(
      digest(ORIGINAL_BATCH.material) === ORIGINAL_FIXTURE_HASH,
      "north_original60_fixture_changed",
    );
    requireThat(
      digest(ADDITIONAL_BATCH.material) ===
        "6f714f8d7a04d07700599148003755ec0659637a2d6d29cdde757d070611d317",
      "north_additional100_fixture_changed",
    );
    requireThat(
      north1aCases.length === MAX &&
        new Set(north1aCases.map((c) => c.id)).size === MAX,
      "north_corpus_count_or_duplicate",
    );
    for (const [category, count] of Object.entries(NORTH_1A_COUNTS))
      requireThat(
        north1aCases.filter((c) => c.category === category).length === count,
        "north_category_count",
      );
    if (additional) {
      const initial = north1aCases.slice(0, INITIAL);
      requireThat(
        new Set(initial.map((c) => c.category)).size === 8 &&
          new Set(initial.map((c) => c.method)).size === 3 &&
          north1aCases.every((c) => c.id.startsWith("additional-")),
        "north_additional_initial_coverage",
      );
      for (const [i, id] of [
        "date-01",
        "spending-01",
        "formatting-01",
        "date-02",
        "purchase-02",
        "followups-06",
      ].entries()) {
        const original = ORIGINAL_BATCH.cases.find((c) => c.id === id)!;
        requireThat(
          initial[i].method === original.method &&
            initial[i].payload === original.payload &&
            digest(initial[i].expected) === digest(original.expected),
          "north_additional_exact_failure_retest_changed",
        );
      }
    }
    if (followup) {
      const failures = [
        ...[
          "date-01",
          "spending-01",
          "formatting-01",
          "date-02",
          "purchase-02",
          "followups-06",
        ].map((id) => ORIGINAL_BATCH.cases.find((c) => c.id === id)!),
        ...[
          "additional-followups-01",
          "additional-recovery-10",
          "additional-context-11",
        ].map((id) => ADDITIONAL_BATCH.cases.find((c) => c.id === id)!),
      ];
      failures.forEach((original, index) =>
        requireThat(
          north1aCases[index].payload === original.payload &&
            digest(north1aCases[index].expected) === digest(original.expected),
          "north_followup_exact_failure_retest_changed",
        ),
      );
      requireThat(
        north1aCases.every((c) => c.id.startsWith("followup-")),
        "north_followup_ids",
      );
    }
    for (const c of north1aCases) {
      const p = JSON.parse(c.payload);
      requireThat(Buffer.byteLength(c.payload) <= 14000, "north_payload_bound");
      requireThat(
        c.expected.intent !== undefined ||
          c.expected.outcome !== undefined ||
          !!c.expected.requiredFactIds?.length,
        "north_missing_semantic_expectation",
      );
      if (c.method === "selectEvidence") {
        requireThat(
          c.expected.requiredFactIds?.every(
            (id) =>
              p.facts.some((f: { id: string }) => f.id === id) &&
              c.expected.allowedFactIds?.includes(id),
          ),
          "north_bad_fact_expectation",
        );
      } else {
        requireThat(
          ["classify", "care"].includes(p.task) &&
            Array.isArray(p.history) &&
            Array.isArray(p.untrustedPassages),
          "north_production_envelope",
        );
        for (const passage of p.untrustedPassages)
          requireThat(
            passage.id === referenceSource.id &&
              passage.content === referenceSource.content &&
              p.product.brand === referenceSource.brand &&
              p.product.model === referenceSource.model,
            "north_foreign_source",
          );
      }
    }
  }
  function offlineChecks() {
    validateCorpus();
    const suffix = followup
      ? ["--followup-50"]
      : additional
        ? ["--additional-100"]
        : [];
    const path = separate
      ? fixedPath
      : "/tmp/opencode/north-1a-offline-only/unique.jsonl";
    for (const [args, action] of [
      [["--help", ...suffix], "help"],
      [["--check", ...suffix], "check"],
      [["--review", path, ...suffix], "review"],
      [["--run", path, "--initial", ...suffix], "run"],
      [["--run", path, "--finish", ...suffix], "run"],
    ] as const) {
      const parsed = parseArgs([...args]);
      requireThat(
        parsed.action === action &&
          parsed.additional === additional &&
          parsed.followup === followup,
        "north_offline_arg_selection",
      );
    }
    for (const args of [
      ["--additional-100"],
      ["--followup-50"],
      ["--check", "--additional-100", "--followup-50"],
      ["--check", "--followup-50", "--followup-50"],
      ["--check", "--additional-100", "--additional-100"],
      ["--check", "--check", ...suffix],
      ["--check", "--max", "100", ...suffix],
      ["--run", path, "--initial", "--initial", ...suffix],
      ["--run", path, "--initial", "--finish", ...suffix],
      ["--run", path, "--finish", "--budget=160", ...suffix],
      ["--run", "--initial", path, ...suffix],
      ["--run", path, ...suffix],
      ["--review", path, "--initial", ...suffix],
      [
        "--run",
        "/tmp/opencode/north-1a-another-batch/unique.jsonl",
        "--initial",
        "--additional-100",
      ],
      [
        "--review",
        "/tmp/opencode/north-1a-another-batch/unique.jsonl",
        "--additional-100",
      ],
    ]) {
      let denied = false;
      try {
        parseArgs(args);
      } catch {
        denied = true;
      }
      requireThat(denied, "north_offline_invalid_or_duplicate_args");
    }
    requireThat(
      headerSchema.shape.ceiling.safeParse(MAX).success &&
        !headerSchema.shape.ceiling.safeParse(MAX + 1).success &&
        !headerSchema.shape.ceiling.safeParse(String(MAX)).success &&
        headerSchema.shape.initial.safeParse(INITIAL).success &&
        !headerSchema.shape.initial.safeParse(INITIAL + 1).success &&
        headerSchema.shape.version.safeParse(NORTH_1A_VERSION).success &&
        !headerSchema.shape.version.safeParse(
          additional ? ORIGINAL_BATCH.version : ADDITIONAL_BATCH.version,
        ).success,
      "north_offline_exact_manifest_mode_types",
    );
    evaluationSlot(0, INITIAL);
    evaluationSlot(INITIAL - 1, INITIAL);
    evaluationSlot(MAX - 1, MAX);
    for (const [used, cap] of [
      [INITIAL, INITIAL],
      [MAX, MAX],
      [MAX + 1, MAX],
      [-1, MAX],
      [0, MAX + 1],
      [0.5, MAX],
      [NaN, MAX],
      [0, INITIAL + 1],
      ...(additional
        ? [
            [0, 12],
            [0, 60],
          ]
        : [
            [0, 20],
            [0, 100],
          ]),
    ]) {
      let denied = false;
      try {
        evaluationSlot(used, cap);
      } catch {
        denied = true;
      }
      requireThat(denied, "north_offline_nested_ceiling_regression");
    }
    const classifier = north1aCases.find((c) => c.method === "classify")!;
    requireThat(
      score(classifier, { intent: classifier.expected.intent }).automaticPass,
      "north_score_positive",
    );
    requireThat(
      !score(classifier, { intent: "guardian" }).automaticPass,
      "north_score_wrong_intent",
    );
    const selection = north1aCases.find((c) => c.method === "selectEvidence")!;
    requireThat(
      score(selection, { factIds: selection.expected.requiredFactIds })
        .automaticPass,
      "north_score_exact_facts",
    );
    requireThat(
      !score(selection, { factIds: ["fact-999"] }).automaticPass,
      "north_score_foreign_fact",
    );
    const explained = north1aCases.find(
      (c) => c.method === "explain" && c.expected.outcome === "answered",
    )!;
    requireThat(
      !score(explained, {
        outcome: "answered",
        steps: [
          {
            sourceId: referenceSource.id,
            quote: "invented unsupported quotation",
            text: "Save your work and unplug immediately.",
          },
        ],
      }).automaticPass,
      "north_score_invented_care",
    );
    const absent = north1aCases.find(
      (c) => c.method === "explain" && c.expected.outcome === "insufficient",
    )!;
    requireThat(
      score(absent, { outcome: "insufficient", steps: [] }).automaticPass,
      "north_score_missing_source",
    );
    console.log(
      JSON.stringify({
        offlineOnly: true,
        cases: MAX,
        initial: INITIAL,
        version: NORTH_1A_VERSION,
        additional100: additional,
        followup50: followup,
        original60FixtureHash: digest(ORIGINAL_BATCH.material),
        counts: NORTH_1A_COUNTS,
        fixtureHash: fixtureHash(),
        liveCalls: 0,
        note: "Corpus and scorer self-checks only; no host state, tests/build, provider or browser work.",
      }),
    );
  }

  type Event = { kind: string; [key: string]: unknown };
  const rowSchema = z.object({
    seq: z.number().int().positive(),
    previous: z.string().regex(/^[a-f0-9]{64}$/),
    event: z.record(z.string(), z.unknown()),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  });
  async function privateHandle(path: string, flags: number) {
    const h = await open(
      path,
      flags | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      0o600,
    );
    try {
      const s = await h.stat();
      requireThat(
        s.isFile() &&
          s.uid === process.getuid?.() &&
          !(s.mode & 0o077) &&
          s.nlink === 1 &&
          s.size <= 16 * 1048576,
        "north_unsafe_file",
      );
      return h;
    } catch (error) {
      await h.close();
      throw error;
    }
  }
  async function syncDirectory(path: string) {
    const h = await open(path, "r");
    try {
      await h.sync();
    } finally {
      await h.close();
    }
  }
  async function safeParent(path: string, create = false) {
    requireThat(
      resolve(path) === path &&
        /^\/tmp\/opencode\/north-1a-[A-Za-z0-9-]+\/unique\.jsonl$/.test(path),
      "north_use_unique_private_ledger_path",
    );
    requireThat(
      (await realpath("/tmp/opencode")) === "/tmp/opencode",
      "north_unsafe_temp_root",
    );
    const parent = dirname(path);
    if (create) await mkdir(parent, { mode: 0o700 }); // Existing directories are not reused for --initial.
    const s = await lstat(parent);
    requireThat(
      s.isDirectory() &&
        !s.isSymbolicLink() &&
        s.uid === process.getuid?.() &&
        !(s.mode & 0o077) &&
        (await realpath(parent)) === parent,
      "north_unsafe_ledger_directory",
    );
  }
  class Ledger {
    events: Event[] = [];
    private previous = ZERO;
    constructor(
      private handle: FileHandle,
      private writable: boolean,
    ) {}
    async read() {
      const text = await this.handle.readFile("utf8");
      requireThat(
        text.endsWith("\n") && text.length > 0,
        "north_partial_or_empty_ledger_no_resume",
      );
      for (const line of text.trimEnd().split("\n")) {
        const row = rowSchema.parse(JSON.parse(line));
        requireThat(
          row.seq === this.events.length + 1 &&
            row.previous === this.previous &&
            row.hash ===
              digest({
                seq: row.seq,
                previous: row.previous,
                event: row.event,
              }),
          "north_ledger_chain_mismatch",
        );
        requireThat(
          typeof row.event.kind === "string",
          "north_bad_ledger_event",
        );
        this.events.push(row.event as Event);
        this.previous = row.hash;
      }
    }
    async append(event: Event) {
      requireThat(this.writable, "north_read_only_ledger");
      const body = {
        seq: this.events.length + 1,
        previous: this.previous,
        event: { ...event, at: new Date().toISOString() },
      };
      const hash = digest(body);
      await this.handle.appendFile(JSON.stringify({ ...body, hash }) + "\n");
      await this.handle.sync(); // Every intent/result/phase is durable, not buffered stdout.
      this.events.push(body.event);
      this.previous = hash;
    }
    async close() {
      await this.handle.close();
    }
  }
  const baselineSchema = z.object({
    policyHash: z.string(),
    historyHash: z.string(),
    identityHash: z.string(),
    eventCount: z.number().int().nonnegative(),
    eventPrefixHash: z.string(),
    sessions: z.array(z.object({ id: z.uuid(), hash: z.string() })),
    used: z.number().int().nonnegative(),
  });
  const headerSchema = z.object({
    kind: z.literal("manifest"),
    ...(separate ? { approvalNamespace: z.literal(approval) } : {}),
    version: z.literal(NORTH_1A_VERSION),
    runId: z.uuid(),
    fixtureHash: z.string(),
    ceiling: z.literal(MAX),
    initial: z.literal(INITIAL),
    policyId: z.literal(POLICY),
    baseline: baselineSchema,
    plans: z
      .array(
        z.object({
          caseId: z.string(),
          requestId: z.uuid(),
          payloadHash: z.string(),
        }),
      )
      .length(MAX),
  });
  type Header = z.infer<typeof headerSchema>;
  const ownerStateSchema = z.object({
    policy: standingPolicySchema,
    sessions: z.array(z.object({ id: z.uuid() }).passthrough()),
    events: z.array(
      z
        .object({
          id: z.uuid(),
          at: z.number(),
          kind: z.string(),
          subject: z.string(),
          observation: z
            .object({
              httpStatus: z.number().optional(),
              requestId: z.string().optional(),
              usage: z.unknown().optional(),
            })
            .optional(),
        })
        .passthrough(),
    ),
  });
  type OwnerState = z.infer<typeof ownerStateSchema>;
  type Phase = "initial" | "finish";
  function subjects(h: Header) {
    return new Set(
      h.plans.flatMap((p, i) => {
        const key = `customer:${p.requestId}:${nameFor(north1aCases[i])}`;
        return [key, `${key}:retry-1`];
      }),
    );
  }
  function totals(s: OwnerState, h: Header) {
    const keys = subjects(h);
    const reservations = s.events.filter(
      (e) => e.kind === "reserve" && keys.has(e.subject),
    );
    const settlements = reservations.map((r) =>
      s.events.find(
        (e) =>
          ["completed", "failed", "unknown"].includes(e.kind) &&
          e.subject === r.subject,
      ),
    );
    return {
      reservedAttempts: reservations.length,
      genuineCompleted: settlements.filter((e) => e?.kind === "completed")
        .length,
      failed: settlements.filter((e) => e?.kind === "failed").length,
      unknown: settlements.filter((e) => !e || e.kind === "unknown").length,
      observedHttpResponses: settlements.filter(
        (e) => e?.observation?.httpStatus !== undefined,
      ).length,
    };
  }
  async function readState(owner: StandingOwner) {
    await owner.status({ agent: "north-1a-read-only-inspection" }); // Existing strict state parser, no approval/refresh.
    return ownerStateSchema.parse(await owner.files.read("owner-state.json"));
  }
  async function providerIdentity() {
    const registration = await subscriptionFiles().registration();
    requireThat(
      registration?.subject && registration.tokens,
      "north_existing_subscription_signin_required",
    );
    requireThat(
      ["resource.invoke", "chatgpt.tokens.use.direct"].every((s) =>
        registration.tokens!.scopes.includes(s),
      ),
      "north_existing_plan_permission_required",
    );
    return {
      hash: digest([registration.clientId, registration.subject]),
      expiresAt: registration.tokens.expiresAt,
      refreshPending: registration.refreshPending === true,
    };
  }
  async function authority(
    owner: StandingOwner,
    header?: Header,
    currentKey?: string,
    allowRefreshPending = false,
  ) {
    requireThat(flagsEnabled(), "north_existing_runtime_flags_required");
    const s = await readState(owner);
    requireThat(
      s.policy.id === POLICY &&
        s.policy.requestLimit === 300 &&
        s.policy.concurrency === 4 &&
        s.policy.requestsPerMinute === 30 &&
        s.policy.maxRetries === 1 &&
        s.policy.scopes.includes("customer"),
      "north_exact_existing_policy_required",
    );
    requireThat(
      !s.events.some((e) =>
        ["provider-block", "revoke-policy"].includes(e.kind),
      ),
      "north_policy_or_provider_blocked",
    );
    const history = await subscriptionFiles().read("session.json");
    requireThat(history !== null, "north_original_history_missing");
    await owner.assertHistoricalJournal(history);
    const provider = await providerIdentity();
    requireThat(
      allowRefreshPending || !provider.refreshPending,
      "north_provider_refresh_unknown_stop",
    );
    const reservations = s.events.filter((e) => e.kind === "reserve");
    const uncertain = reservations.filter(
      (e) =>
        !s.events.some(
          (v) =>
            v.subject === e.subject && ["completed", "failed"].includes(v.kind),
        ),
    );
    requireThat(
      uncertain.every(
        (e) =>
          e.subject === currentKey &&
          !s.events.some(
            (v) => v.subject === e.subject && v.kind === "unknown",
          ),
      ),
      "north_unknown_or_active_usage_stop",
    );
    if (header) {
      const b = header.baseline;
      requireThat(
        digest(s.policy) === b.policyHash &&
          digest(history) === b.historyHash &&
          provider.hash === b.identityHash,
        "north_authority_identity_or_history_changed",
      );
      requireThat(
        s.events.length >= b.eventCount &&
          digest(s.events.slice(0, b.eventCount)) === b.eventPrefixHash,
        "north_prior_owner_events_changed",
      );
      for (const original of b.sessions)
        requireThat(
          digest(s.sessions.find((v) => v.id === original.id)) ===
            original.hash,
          "north_original_browser_state_changed",
        );
      const ownKeys = subjects(header);
      requireThat(
        s.events
          .slice(b.eventCount)
          .filter((e) => e.kind === "reserve")
          .every((e) => ownKeys.has(e.subject)),
        "north_unrelated_inference_stop_coordinate_window",
      );
      requireThat(
        totals(s, header).reservedAttempts <= MAX,
        "north_nested_ceiling_exceeded_stop",
      );
    }
    return { s, history, provider, used: reservations.length };
  }

  function hostGate() {
    requireThat(
      process.cwd() === ROOT && hostname().toLowerCase() === "greatbison",
      "north_primary_host_only",
    );
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    requireThat(
      git("rev-parse", "--show-toplevel") === ROOT &&
        git("branch", "--show-current") === "main" &&
        git("remote", "get-url", "origin") ===
          "https://github.com/fmruslan/Pal-Care-Ruslan.git",
      "north_primary_checkout_required",
    );
    requireThat(
      ![
        "DEBUG",
        "PWDEBUG",
        "DEBUG_FILE",
        "NODE_DEBUG",
        "OPENAI_LOG",
        "OPENAI_LOG_LEVEL",
      ].some((key) => process.env[key]),
      "north_disable_credential_debug_logging",
    );
    requireThat(
      !process.env.OPENAI_API_KEY && !process.env.OPENAI_ADMIN_KEY,
      "north_no_paid_api_credentials_in_harness",
    );
  }
  function validateManifest(header: Header) {
    requireThat(
      header.fixtureHash === fixtureHash(),
      "north_frozen_fixture_hash_changed_no_resume",
    );
    requireThat(
      new Set(header.plans.map((p) => p.requestId)).size === MAX,
      "north_duplicate_original_request_id",
    );
    header.plans.forEach((p, i) =>
      requireThat(
        p.caseId === north1aCases[i].id &&
          p.payloadHash === digest(north1aCases[i].payload),
        "north_fixed_case_order_or_payload_changed",
      ),
    );
  }
  function initialCompleted(ledger: Ledger, h: Header, s: OwnerState) {
    requireThat(
      !ledger.events.some((e) =>
        ["phase-stopped", "finish-started"].includes(e.kind),
      ),
      "north_stopped_or_previously_attempted_finish_no_resume",
    );
    const done = ledger.events.filter(
      (e) => e.kind === "phase-completed" && e.phase === "initial",
    );
    requireThat(
      done.length === 1 &&
        done[0].cases === INITIAL &&
        done[0].reservedAttempts === INITIAL &&
        done[0].genuineCompleted === INITIAL,
      "north_initial_not_exactly_completed",
    );
    const results = ledger.events.filter((e) => e.kind === "case-result");
    requireThat(
      results.length === INITIAL &&
        results.every(
          (e, i) =>
            e.caseId === h.plans[i].caseId &&
            e.requestId === h.plans[i].requestId &&
            e.state === "completed",
        ),
      "north_initial_result_missing_or_ambiguous",
    );
    const t = totals(s, h);
    requireThat(
      t.reservedAttempts === INITIAL &&
        t.genuineCompleted === INITIAL &&
        !t.unknown &&
        !t.failed,
      "north_initial_journal_not_exact",
    );
    const sessions = ledger.events.filter(
      (e) => e.kind === "evaluation-session",
    );
    requireThat(
      sessions.length === 1 &&
        ledger.events.some(
          (e) =>
            e.kind === "evaluation-session-revoked" && e.id === sessions[0].id,
        ),
      "north_initial_session_not_revoked",
    );
    requireThat(
      s.events.some(
        (e) => e.kind === "revoke-session" && e.subject === sessions[0].id,
      ),
      "north_initial_revocation_not_in_owner_journal",
    );
    requireThat(
      !ledger.events.some(
        (e) =>
          e.kind === "wire-intent" &&
          !ledger.events.some(
            (r) => r.kind === "wire-response" && r.key === e.key,
          ),
      ),
      "north_unmatched_wire_intent_no_resume",
    );
  }

  async function executePhase(ledger: Ledger, header: Header, phase: Phase) {
    const files = subscriptionFiles();
    const ordinaryOwner = new StandingOwner();
    let proof: OwnerProof | undefined;
    let evalSession: string | undefined;
    let active:
      | { c: NorthCase; requestId: string; key?: string; armed: boolean }
      | undefined;
    const phaseCap = phase === "initial" ? INITIAL : MAX;
    const stopSignal = new AbortController();
    const onSignal = () => stopSignal.abort();
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    // This subclass adds the evaluation intent/ceiling, never replaces production
    // policy/history/reservation checks. super.reserve uses the REAL owner files.
    class EvaluationOwner extends StandingOwner {
      override async reserve(
        p: OwnerProof,
        scope: "customer" | "customer-studio",
        key: string,
        enabled: boolean,
      ) {
        requireThat(
          active &&
            proof &&
            p === proof &&
            scope === "customer" &&
            enabled &&
            !stopSignal.signal.aborted,
          "north_unexpected_dispatch",
        );
        const base = `customer:${active.requestId}:${nameFor(active.c)}`;
        requireThat(
          key === base || key === `${base}:retry-1`,
          "north_original_request_identity_required",
        );
        requireThat(
          !ledger.events.some(
            (e) => e.kind === "dispatch-intent" && e.key === key,
          ),
          "north_never_replay_dispatch",
        );
        const before = await authority(this, header);
        evaluationSlot(totals(before.s, header).reservedAttempts, phaseCap);
        requireThat(
          before.used < before.s.policy.requestLimit,
          "north_existing_allowance_exhausted",
        );
        await this.assertDispatch(p, "customer", flagsEnabled());
        await ledger.append({
          kind: "dispatch-intent",
          phase,
          caseId: active.c.id,
          requestId: active.requestId,
          key,
          payloadHash: digest(active.c.payload),
          promptHash: digest(promptFor(active.c)),
          schema: nameFor(active.c),
          countsBefore: totals(before.s, header),
          providerTokenExpiresAt: before.provider.expiresAt,
        });
        try {
          await super.reserve(p, scope, key, enabled);
        } catch (error) {
          await ledger.append({
            kind: "reserve-denied-known-unsent",
            phase,
            key,
            error: errorCode(error),
            genuine: false,
          });
          throw error;
        }
        active.key = key;
        await ledger.append({ kind: "owner-reserved", phase, key });
        active.armed = true;
        return undefined;
      }
    }
    const owner = new EvaluationOwner();
    const transport: Transport = async (url, init) => {
      const address = String(url);
      requireThat(
        init?.method === "POST" && init.redirect === "error" && proof,
        "north_unexpected_transport",
      );
      if (address === TOKEN) {
        await authority(owner, header, undefined, true);
        await owner.assertDispatch(proof, "customer", flagsEnabled());
        await ledger.append({ kind: "refresh-intent", phase, sanitized: true });
        try {
          const response = await fetch(url, init);
          await ledger.append({
            kind: "refresh-response",
            phase,
            httpStatus: response.status,
            sanitized: true,
          });
          return response; // Existing accessToken owns validation/pending marker.
        } catch (error) {
          await ledger.append({
            kind: "refresh-unknown",
            phase,
            error: errorCode(error),
          });
          throw error;
        }
      }
      requireThat(
        address === `${RESOURCE}/responses` && active?.armed && active.key,
        "north_only_guarded_subscription_responses_allowed",
      );
      const key = active.key;
      active.armed = false; // Exactly one network invocation for this reservation.
      await authority(owner, header, key);
      const access = await owner.status(proof);
      requireThat(
        access.remembered && access.browserCompletion === "complete",
        "north_evaluation_session_revoked_or_expired",
      );
      // This second durable marker is immediately before native fetch. A missing
      // response is unknown, never zero calls and never resumable.
      await ledger.append({
        kind: "wire-intent",
        phase,
        caseId: active.c.id,
        requestId: active.requestId,
        key,
      });
      try {
        const response = await fetch(url, init);
        const providerRequestId = response.headers.get("x-request-id");
        await ledger.append({
          kind: "wire-response",
          phase,
          key,
          httpStatus: response.status,
          ...(providerRequestId &&
          /^[A-Za-z0-9_-]{1,128}$/.test(providerRequestId)
            ? { providerRequestId }
            : {}),
        });
        return response; // No raw headers/bodies, cookies, tokens or SSE logs.
      } catch (error) {
        await ledger.append({
          kind: "wire-unknown",
          phase,
          key,
          error: errorCode(error),
        });
        throw error;
      }
    };
    try {
      const before = await authority(owner, header);
      requireThat(
        before.s.policy.requestLimit - before.used >=
          phaseCap - totals(before.s, header).reservedAttempts,
        "north_insufficient_existing_allowance_no_renewal",
      );
      requireThat(
        !ledger.events.some(
          (e) => e.kind === "phase-started" && e.phase === phase,
        ),
        "north_phase_already_started_no_replay",
      );
      await ledger.append({
        kind: "phase-started",
        phase,
        counts: totals(before.s, header),
        promptVersion: CARE_PROMPT_VERSION,
        carePromptHash: digest(CARE_INSTRUCTIONS),
        selectionPromptHash: digest(CARE_SELECTION_INSTRUCTIONS),
        note: "Source corrections between phases are recorded; corpus/case inputs and original request IDs remain fixed. No browser acceptance.",
      });
      const agent = `PalCare North checkpoint 1A host fixture evaluation ${header.runId} ${phase}`;
      const pair = await ordinaryOwner.pair(agent);
      requireThat(!pair.reused, "north_evaluation_session_must_be_distinct");
      evalSession = pair.id;
      proof = { token: pair.token, agent }; // Memory only. Never serialized/exported.
      await ledger.append({
        kind: "evaluation-session",
        phase,
        id: evalSession,
        agent,
        reused: pair.reused,
      });
      await ordinaryOwner.approve(evalSession); // Only the selected fixed host-fixture approval.
      const expiresAt = await ordinaryOwner.finishBrowser(proof);
      const access = await ordinaryOwner.status(proof);
      requireThat(
        access.remembered && access.browserCompletion === "complete",
        "north_evaluation_proof_not_finished",
      );
      await ledger.append({
        kind: "evaluation-session-ready",
        phase,
        id: evalSession,
        expiresAt,
      });
      const start = phase === "initial" ? 0 : INITIAL;
      for (let i = start; i < phaseCap; i++) {
        stopSignal.signal.throwIfAborted();
        const c = north1aCases[i],
          plan = header.plans[i];
        requireThat(
          !ledger.events.some(
            (e) => e.kind === "case-started" && e.caseId === c.id,
          ),
          "north_never_replay_case",
        );
        // Proactive pacing, not a retry after a policy/provider denial. Sequential
        // requests plus this minimum interval stay below 30/min including one
        // permitted counted retry. Actual owner guards still decide every attempt.
        if (i > start)
          await delay(4200, undefined, { signal: stopSignal.signal });
        const pre = await authority(owner, header);
        await owner.assertDispatch(proof, "customer", flagsEnabled());
        active = { c, requestId: plan.requestId, armed: false };
        await ledger.append({
          kind: "case-started",
          phase,
          caseId: c.id,
          requestId: plan.requestId,
          category: c.category,
          method: c.method,
          input: c,
          counts: totals(pre.s, header),
        });
        const began = Date.now();
        let value: unknown;
        try {
          const result = await standingStructured({
            files,
            owner,
            proof,
            scope: "customer",
            enabled: flagsEnabled,
            requestId: plan.requestId,
            payload: c.payload,
            schema: schemaFor(c),
            name: nameFor(c),
            prompt: promptFor(c),
            signal: AbortSignal.any([
              stopSignal.signal,
              AbortSignal.timeout(MODEL_TIMEOUT_MS + 30000),
            ]),
            transport,
          });
          requireThat(
            result.micro === null,
            "north_subscription_not_dollar_priced",
          );
          value = result.value;
        } catch (error) {
          const observed = await readState(owner);
          const attempts = observed.events.filter(
            (e) =>
              e.subject.startsWith(`customer:${plan.requestId}:`) &&
              ["reserve", "completed", "failed", "unknown"].includes(e.kind),
          );
          await ledger.append({
            kind: "case-result",
            phase,
            caseId: c.id,
            requestId: plan.requestId,
            state: attempts.some((e) => e.kind === "reserve")
              ? "failed-or-unknown"
              : "known-unsent",
            error: errorCode(error),
            attempts,
            counts: totals(observed, header),
            elapsedMs: Date.now() - began,
            micro: null,
            semanticReview:
              "Incomplete; preserve failed/unknown accounting. No replay.",
          });
          throw error;
        }
        const observed = await readState(owner);
        const attempts = observed.events.filter(
          (e) =>
            e.subject.startsWith(`customer:${plan.requestId}:`) &&
            ["reserve", "completed", "failed", "unknown"].includes(e.kind),
        );
        const completed = attempts.filter((e) => e.kind === "completed");
        const t = totals(observed, header);
        const evaluation = score(c, value);
        await ledger.append({
          kind: "case-result",
          phase,
          caseId: c.id,
          requestId: plan.requestId,
          state: "completed",
          value,
          evaluation,
          attempts,
          counts: t,
          elapsedMs: Date.now() - began,
          micro: null,
          billing:
            "Existing ChatGPT subscription; no dollar estimate. Usage comes only from owner journal observations.",
        });
        console.log(
          JSON.stringify({
            caseId: c.id,
            completed: t.genuineCompleted,
            reservedAttempts: t.reservedAttempts,
            scores: evaluation.scores,
            automaticPass: evaluation.automaticPass,
            humanReviewRequired: true,
          }),
        );
        // Production safe retry is retained and charged under its ORIGINAL key.
        // It cannot silently consume a later fixed case or extend the selected ceiling.
        requireThat(
          completed.length === 1 &&
            attempts.filter((e) => e.kind === "reserve").length === 1 &&
            !attempts.some((e) => ["unknown", "failed"].includes(e.kind)),
          "north_counted_retry_or_ambiguity_stop_no_extra_calls",
        );
        requireThat(
          completed[0].observation?.httpStatus === 200 &&
            !!completed[0].observation?.usage &&
            !t.unknown,
          "north_genuine_usage_evidence_missing_stop",
        );
        active = undefined;
        await authority(owner, header);
      }
      const end = await authority(owner, header);
      const t = totals(end.s, header);
      requireThat(
        t.reservedAttempts === phaseCap &&
          t.genuineCompleted === phaseCap &&
          !t.failed &&
          !t.unknown,
        "north_exact_phase_count_incomplete",
      );
      await ledger.append({
        kind: "phase-completed",
        phase,
        cases: phaseCap - (phase === "finish" ? INITIAL : 0),
        ...t,
        semanticReview:
          "Required; automatic scores are not human acceptance or actual browser/SDK proof.",
      });
    } catch (error) {
      await ledger.append({
        kind: "phase-stopped",
        phase,
        error: errorCode(error),
        noReplay: true,
        [`exact${MAX}Milestone`]: "INCOMPLETE",
      });
      throw error;
    } finally {
      try {
        if (evalSession) {
          await ordinaryOwner.revokeSession(evalSession); // Only THIS temporary session.
          await ledger.append({
            kind: "evaluation-session-revoked",
            phase,
            id: evalSession,
          });
        }
      } finally {
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
      }
    }
  }

  async function run(path: string, phase: Phase) {
    requireThat(
      !separate || path === fixedPath,
      "north_fixed_additional_ledger_required",
    );
    hostGate();
    validateCorpus();
    requireThat(
      (await realpath(ROOT)) === ROOT && flagsEnabled(),
      "north_exact_host_flags_required",
    );
    // Existing directories must exist; never provision/import/reset host authority.
    for (const directory of [
      new StandingOwner().files.directory,
      subscriptionFiles().directory,
    ])
      requireThat(
        (await lstat(directory)).isDirectory(),
        "north_existing_host_files_required",
      );
    requireThat(
      (await realpath("/tmp/opencode")) === "/tmp/opencode",
      "north_unsafe_temp_root",
    );
    const lock = await privateHandle(
      LOCK,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    );
    let ledger: Ledger | undefined;
    try {
      await lock.writeFile(
        JSON.stringify({
          policyId: POLICY,
          ledger: path,
          phase,
          pid: process.pid,
        }) + "\n",
      );
      await lock.sync();
      await syncDirectory("/tmp/opencode");
      const owner = new StandingOwner();
      if (phase === "initial") {
        const before = await authority(owner);
        requireThat(
          before.s.policy.requestLimit - before.used >= MAX,
          `north_existing_allowance_below${MAX}`,
        );
        const header: Header = {
          kind: "manifest",
          ...(separate ? { approvalNamespace: approval } : {}),
          version: NORTH_1A_VERSION,
          runId: randomUUID(),
          fixtureHash: fixtureHash(),
          ceiling: MAX,
          initial: INITIAL,
          policyId: POLICY,
          baseline: {
            policyHash: digest(before.s.policy),
            historyHash: digest(before.history),
            identityHash: before.provider.hash,
            eventCount: before.s.events.length,
            eventPrefixHash: digest(before.s.events),
            sessions: before.s.sessions.map((s) => ({
              id: s.id,
              hash: digest(s),
            })),
            used: before.used,
          },
          plans: north1aCases.map((c) => ({
            caseId: c.id,
            requestId: randomUUID(),
            payloadHash: digest(c.payload),
          })),
        };
        await safeParent(path, true);
        // One fixed registry for this exact approval prevents a second unique
        // ledger from becoming another batch budget. Never delete/reset it.
        const registry = await privateHandle(
          REGISTRY,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        );
        try {
          await registry.writeFile(
            JSON.stringify({
              path,
              ...(separate ? { approvalNamespace: approval } : {}),
              runId: header.runId,
              fixtureHash: header.fixtureHash,
              ceiling: MAX,
              policyId: POLICY,
            }) + "\n",
          );
          await registry.sync();
        } finally {
          await registry.close();
        }
        await syncDirectory("/tmp/opencode");
        ledger = new Ledger(
          await privateHandle(
            path,
            constants.O_WRONLY |
              constants.O_APPEND |
              constants.O_CREAT |
              constants.O_EXCL,
          ),
          true,
        );
        await ledger.append({
          ...header,
          fixtureMaterial: north1aFixtureMaterial,
          proofClass:
            "Genuine subscription structured adapter over fictional fixtures; NOT browser/application acceptance.",
        });
        await syncDirectory(dirname(path));
        await executePhase(ledger, header, phase);
      } else {
        await safeParent(path);
        const registry = await privateHandle(REGISTRY, constants.O_RDONLY);
        let registered;
        try {
          registered = z
            .object({
              path: z.literal(path),
              ...(separate ? { approvalNamespace: z.literal(approval) } : {}),
              runId: z.uuid(),
              fixtureHash: z.string(),
              ceiling: z.literal(MAX),
              policyId: z.literal(POLICY),
            })
            .parse(JSON.parse(await registry.readFile("utf8")));
        } finally {
          await registry.close();
        }
        ledger = new Ledger(
          await privateHandle(path, constants.O_RDWR | constants.O_APPEND),
          true,
        );
        await ledger.read();
        const header = headerSchema.parse(ledger.events[0]);
        requireThat(
          registered.runId === header.runId &&
            registered.fixtureHash === header.fixtureHash,
          "north_registry_manifest_mismatch",
        );
        validateManifest(header);
        const current = await authority(owner, header);
        initialCompleted(ledger, header, current.s);
        await ledger.append({
          kind: "finish-started",
          initialCasesCompleted: INITIAL,
          remainingFixedCases: MAX - INITIAL,
        });
        await executePhase(ledger, header, phase);
      }
    } finally {
      try {
        await ledger?.close();
      } finally {
        await lock.close();
        await unlink(LOCK);
        await syncDirectory("/tmp/opencode");
      }
    }
  }

  async function review(path: string) {
    requireThat(
      !separate || path === fixedPath,
      "north_fixed_additional_ledger_required",
    );
    await safeParent(path);
    const ledger = new Ledger(
      await privateHandle(path, constants.O_RDONLY),
      false,
    );
    try {
      await ledger.read();
      const header = headerSchema.parse(ledger.events[0]);
      const results = ledger.events.filter((e) => e.kind === "case-result");
      const completions = ledger.events.filter(
        (e) => e.kind === "phase-completed",
      );
      const measuredUsage: Record<string, number> = {};
      const measuredKeys = new Set<string>();
      let attemptsWithoutMeasuredUsage = 0;
      // These are the already-sanitized owner journal observations saved with each
      // case, NOT an invented result. Each settlement is counted only once.
      for (const result of results) {
        const attempts = z
          .array(
            z
              .object({
                kind: z.string(),
                subject: z.string(),
                observation: z
                  .object({
                    usage: z.record(z.string(), z.unknown()).optional(),
                  })
                  .optional(),
              })
              .passthrough(),
          )
          .parse(result.attempts ?? []);
        for (const reservation of attempts.filter(
          (a) => a.kind === "reserve",
        )) {
          if (measuredKeys.has(reservation.subject)) continue;
          measuredKeys.add(reservation.subject);
          const attempt = attempts.find(
            (a) =>
              a.subject === reservation.subject &&
              ["completed", "failed", "unknown"].includes(a.kind),
          );
          if (!attempt?.observation?.usage) {
            attemptsWithoutMeasuredUsage++;
            continue;
          }
          for (const field of [
            "inputTokens",
            "outputTokens",
            "totalTokens",
            "cachedTokens",
            "cacheWriteTokens",
            "reasoningTokens",
          ]) {
            const value = attempt.observation.usage[field];
            if (
              typeof value === "number" &&
              Number.isSafeInteger(value) &&
              value >= 0
            )
              measuredUsage[field] = (measuredUsage[field] ?? 0) + value;
          }
        }
      }
      const temporarySessions = ledger.events.filter(
        (e) => e.kind === "evaluation-session",
      );
      const unconfirmedRevocations = temporarySessions
        .filter(
          (s) =>
            !ledger.events.some(
              (e) => e.kind === "evaluation-session-revoked" && e.id === s.id,
            ),
        )
        .map((s) => s.id);
      console.log(
        JSON.stringify({
          measuredOwnerJournalUsage: measuredUsage,
          attemptsWithoutMeasuredUsage,
          unconfirmedRevocations,
          micro: null,
          billing:
            "Existing subscription, not API dollars; missing usage remains unavailable, never estimated.",
        }),
      );
      console.log(
        JSON.stringify(
          {
            readOnly: true,
            path,
            runId: header.runId,
            ceiling: MAX,
            initial: INITIAL,
            version: NORTH_1A_VERSION,
            fixtureHash: header.fixtureHash,
            currentFixtureMatches: header.fixtureHash === fixtureHash(),
            results: results.length,
            completedResults: results.filter((e) => e.state === "completed")
              .length,
            automaticFailures: results
              .filter(
                (e) =>
                  e.state === "completed" &&
                  !(e.evaluation as { automaticPass?: boolean } | undefined)
                    ?.automaticPass,
              )
              .map((e) => e.caseId),
            completedPhases: completions,
            stopped: ledger.events.filter((e) => e.kind === "phase-stopped"),
            refreshRequests: ledger.events.filter(
              (e) => e.kind === "refresh-intent",
            ).length,
            refreshResponses: ledger.events.filter(
              (e) => e.kind === "refresh-response",
            ).length,
            [`exact${MAX}`]: completions.some(
              (e) =>
                e.phase === "finish" &&
                e.genuineCompleted === MAX &&
                e.reservedAttempts === MAX,
            )
              ? "Provider-count evidence recorded; every output still needs semantic review, no browser claim."
              : "INCOMPLETE",
            micro: null,
            note: "Read the per-case input/value/evaluation/attempts in this private ledger. No raw credentials/provider bodies. Review makes no host/provider calls and changes nothing.",
          },
          null,
          2,
        ),
      );
    } finally {
      await ledger.close();
    }
  }
  function help() {
    const flag = followup
      ? " --followup-50"
      : additional
        ? " --additional-100"
        : "";
    const path = separate
      ? fixedPath
      : "/tmp/opencode/north-1a-UNIQUE/unique.jsonl";
    console.log(`Prepared North checkpoint 1A harness. NO calls or host-state reads with no arguments.
Selected batch: ${MAX} fixed fictional cases (${INITIAL} initial + ${MAX - INITIAL} finish), version ${NORTH_1A_VERSION}.
Offline corpus/scorer checks: pnpm exec tsx scripts/evaluate-north-1a.ts --check${flag}
Read-only evidence: pnpm exec tsx scripts/evaluate-north-1a.ts --review ${path}${flag}
Explicit real host run (after main-agent review):
  --run ${path} --initial${flag}   (${INITIAL} cases)
  --run ${path} --finish${flag}    (${MAX - INITIAL} cases)
Required existing environment: CAREOS_OWNER_MODE=true APP_ORIGIN=${OWNER_ORIGIN}
  CAREOS_SUBSCRIPTION_CREDITS_DISABLED=true CAREOS_STANDING_AI_ENABLED=true
Exactly one fixed registry per approval; no reset/new ledger on failure. All approvals share the original lock and unchanged actual owner accounting/policy. Each production safe retry counts toward the selected ${MAX} ceiling. Failures/unknowns/denial stop; failed requests never reaching the provider are not genuine calls. No allowance renewal, token copying, DB, preview, paid API fallback, financial action or browser-acceptance claim.
Use --help --additional-100 or --help --followup-50 for their separately approved ONE fixed batches. All share the original lock/accounting; completed ledgers/registries cannot be extended or reset. Repeated approval text never grants another batch. There are no budget/model/identity overrides.`);
  }
  return { offlineChecks, run, review, help };
}
type Command =
  | { action: "help" | "check"; additional: boolean; followup: boolean }
  | { action: "review"; additional: boolean; followup: boolean; path: string }
  | {
      action: "run";
      additional: boolean;
      followup: boolean;
      path: string;
      phase: "initial" | "finish";
    };
function parseArgs(args: string[]): Command {
  const occurrences = args.filter((arg) => arg === "--additional-100").length;
  requireThat(occurrences <= 1, "north_duplicate_additional_flag");
  const additional = occurrences === 1;
  const followupOccurrences = args.filter(
    (arg) => arg === "--followup-50",
  ).length;
  requireThat(
    followupOccurrences <= 1 && !(additional && followupOccurrences),
    "north_duplicate_or_mixed_batch_flag",
  );
  const followup = followupOccurrences === 1;
  const rest = args.filter(
    (arg) => !["--additional-100", "--followup-50"].includes(arg),
  );
  if (!args.length || (rest.length === 1 && rest[0] === "--help"))
    return { action: "help", additional, followup };
  if (rest.length === 1 && rest[0] === "--check")
    return { action: "check", additional, followup };
  if (rest.length === 2 && rest[0] === "--review" && !rest[1].startsWith("--"))
    return {
      action: "review",
      additional,
      followup,
      path: argumentPath(rest[1], additional, followup),
    };
  requireThat(
    rest.length === 3 &&
      rest[0] === "--run" &&
      !rest[1].startsWith("--") &&
      ["--initial", "--finish"].includes(rest[2]),
    "north_explicit_run_path_and_phase_required",
  );
  return {
    action: "run",
    additional,
    followup,
    path: argumentPath(rest[1], additional, followup),
    phase: rest[2] === "--initial" ? "initial" : "finish",
  };
}
function argumentPath(path: string, additional: boolean, followup = false) {
  requireThat(
    resolve(path) === path &&
      /^\/tmp\/opencode\/north-1a-[A-Za-z0-9-]+\/unique\.jsonl$/.test(path),
    "north_use_unique_private_ledger_path",
  );
  requireThat(
    !(additional || followup) ||
      path === (followup ? FOLLOWUP_PATH : ADDITIONAL_PATH),
    "north_fixed_additional_ledger_required",
  );
  return path;
}
async function main() {
  const command = parseArgs(process.argv.slice(2));
  const harness = createHarness(command.additional, command.followup);
  switch (command.action) {
    case "help":
      return harness.help();
    case "check":
      return harness.offlineChecks();
    case "review":
      return harness.review(command.path);
    case "run":
      return harness.run(command.path, command.phase);
  }
}
// No automatic test registration, provider dispatch or harness work on import.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        stopped: true,
        code: errorCode(error),
        noAutomaticRecovery: true,
        noReplay: true,
        [process.argv.slice(2).includes("--followup-50")
          ? "exact50"
          : process.argv.slice(2).includes("--additional-100")
            ? "exact100"
            : "exact60"]:
          "INCOMPLETE unless independently evidenced in the retained ledger",
      }),
    );
    process.exitCode = 1;
  });
}
