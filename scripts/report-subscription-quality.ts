import { homedir } from "node:os";
import { join } from "node:path";
import { PilotFiles } from "../src/lib/careos/subscription/files";
import type { CareTurn } from "../src/lib/careos/contracts";

const files = new PilotFiles(join(homedir(), ".config/palcare-chatgpt-pilot"));
await files.prepare();
const session = (await files.read("session.json")) as {
  requestLimit: number;
  attempts: {
    state: string;
    schema: string;
    summary: {
      latencyMs?: number;
      firstEventMs?: number;
      usage?: {
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
      };
    };
  }[];
};
const quality = (await files.read("quality.json")) as {
  runs: {
    phase: string;
    financialAttempts: number;
    externalRequests: number;
    results: {
      id: string;
      pass: boolean;
      latencyMs: number;
      question?: string;
      turn?: CareTurn;
      error?: string;
    }[];
  }[];
};
const percentile = (values: number[], q: number) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1]
    : null;
const totals = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokensIncludedInOutput: 0,
};
for (const a of session.attempts)
  if (a.summary.usage) {
    totals.inputTokens += a.summary.usage.inputTokens;
    totals.outputTokens += a.summary.usage.outputTokens;
    totals.reasoningTokensIncludedInOutput += a.summary.usage.reasoningTokens;
  }
const unique = new Map<string, CareTurn>();
for (const run of quality.runs)
  for (const result of run.results)
    if (result.turn) unique.set(result.turn.requestId, result.turn);
const laterLive = quality.runs
  .filter((r) => ["repairs", "extended"].includes(r.phase))
  .flatMap((r) =>
    r.results
      .filter(
        (x) => x.id.startsWith("answer-") && x.turn?.answer.mode === "live",
      )
      .map((r) => r.turn!),
  );
const sourceSteps = laterLive
  .filter((t) => t.answer.sources.some((s) => s.excerpt))
  .flatMap((t) =>
    t.answer.steps.map((step) => ({
      supported: t.answer.sources.some((s) => s.excerpt?.includes(step)),
      words: step.split(/\s+/).length,
    })),
  );
console.log(
  JSON.stringify(
    {
      subscriptionRequests: session.attempts.length,
      requestAllowance: session.requestLimit,
      outcomes: Object.fromEntries(
        ["completed", "failed", "unknown"].map((state) => [
          state,
          session.attempts.filter((a) => a.state === state).length,
        ]),
      ),
      knownTokenTotals: totals,
      note: "Unknown/cancelled call usage is excluded, never assumed zero; no API-dollar conversion.",
      modelLatencyMs: {
        median: percentile(
          session.attempts.flatMap((a) =>
            a.summary.latencyMs ? [a.summary.latencyMs] : [],
          ),
          0.5,
        ),
        p95: percentile(
          session.attempts.flatMap((a) =>
            a.summary.latencyMs ? [a.summary.latencyMs] : [],
          ),
          0.95,
        ),
      },
      customerTurns: {
        total: unique.size,
        live: [...unique.values()].filter((t) => t.answer.mode === "live")
          .length,
        deterministic: [...unique.values()].filter(
          (t) => t.answer.mode === "deterministic",
        ).length,
      },
      postFixSourceInstructions: {
        total: sourceSteps.length,
        exactSourceSupported: sourceSteps.filter((s) => s.supported).length,
        note: "Instruction coverage only; semantic applicability and non-care factual claims require review, not this string check.",
      },
      suites: quality.runs.map((run) => ({
        phase: run.phase,
        passed: run.results.filter((r) => !r.id.startsWith("answer-") && r.pass)
          .length,
        failures: run.results
          .filter((r) => !r.pass)
          .map((r) => ({ id: r.id, error: r.error })),
        cases: run.results
          .filter((r) => !r.id.startsWith("answer-"))
          .map((r) => ({ id: r.id, pass: r.pass, latencyMs: r.latencyMs })),
        financialAttempts: run.financialAttempts,
        externalBrowserRequests: run.externalRequests,
      })),
    },
    null,
    2,
  ),
);
