/** Owner-run engineering review only. Never changes authority/accounting,
 * deletes a failure, resends an unknown request or creates another browser. */
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { assertBuild } from "./workspace.mjs";
import { assertCiReceipt } from "./ci-receipt.mjs";
import { StandingOwner } from "../src/lib/careos/standing-owner";
const [output, kind, explanation] = process.argv.slice(2);
if (
  !output?.startsWith("/tmp/opencode/") ||
  !["oracle", "repair"].includes(kind) ||
  !explanation ||
  explanation.length < 20 ||
  process.argv.length !== 5
)
  throw Error(
    "Usage: PRIVATE_OUTPUT oracle|repair 'specific reviewed diagnosis and evidence'",
  );
const build = assertBuild(true);
assertCiReceipt(
  build,
  JSON.parse(await readFile(".next/palcare-ci.json", "utf8")),
);
const progress = JSON.parse(
  await readFile(join(output, "progress.json"), "utf8"),
);
const owner = new StandingOwner();
const state = (await owner.files.read("owner-state.json")) as {
  sessions: { id: string; revoked: boolean }[];
  evaluation?: { id: string; sessionId: string; expiresAt: number };
};
// Host queue inspection is NOT model authority. Recovered browsers still need
// the real new credential/records proof at every dispatch; raw revoked flags
// must not masquerade as either recovery approval or the original 26 slots.
const recovery = await owner.evaluationRecoveryStatus();
const recovered =
  recovery.active &&
  recovery.evaluationId === progress.allocationId &&
  recovery.sessionId === progress.sessionId &&
  recovery.expiresAt === progress.deadline &&
  recovery.originalBrowserRevoked;
if (
  !progress.paused ||
  progress.finished ||
  !state.evaluation ||
  state.evaluation?.id !== progress.allocationId ||
  state.evaluation.sessionId !== progress.sessionId ||
  state.evaluation.expiresAt !== progress.deadline ||
  Date.now() >= state.evaluation.expiresAt ||
  (!recovered &&
    !state.sessions.some((s) => s.id === progress.sessionId && !s.revoked))
)
  throw Error("valid_original_evaluation_browser_required_no_replacement");
const entries = (await readFile(join(output, "ledger.jsonl"), "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const failure = entries.filter((e) => e.kind === "evaluation").at(-1);
if (!failure?.assessment?.failures?.length)
  throw Error("reviewable_known_failure_required");
if (kind === "repair") {
  // Recovery must not silently replay a completed multi-turn prefix. Its exact
  // known-unsent ninth/tenth continuation has a separately validated queue.
  if (recovered)
    throw Error("recovery_requires_explicit_no_replay_continuation");
  const { work } = JSON.parse(
    await readFile(join(output, "work.json"), "utf8"),
  );
  const rootCase = failure.caseId.replace(/(?:-R\d+)+$/, "");
  const original = work.find((w: { id: string }) => w.id === rootCase);
  const group = work.filter(
    (w: { group: string }) => w.group === original?.group,
  );
  const index = group.findIndex((w: { id: string }) => w.id === rootCase);
  if (index < 0) throw Error("frozen_original_case_required");
  const version =
    entries.filter(
      (e) =>
        e.kind === "review" &&
        e.originalCase.replace(/(?:-R\d+)+$/, "") === rootCase,
    ).length + 1;
  const rerun = group
    .slice(
      group.some((w: { id: string }) => w.id.includes("-SETUP-")) ||
        original?.group.startsWith("NC-")
        ? 0
        : index,
      index + 1,
    )
    .map((w: Record<string, unknown>) => ({
      ...w,
      id: `${w.id}-R${version}`,
      group: `${w.group}-R${version}`,
    }));
  progress.retests = [...(progress.retests ?? []), ...rerun];
}
await appendFile(
  join(output, "ledger.jsonl"),
  JSON.stringify({
    kind: "review",
    reviewKind: kind,
    originalCase: failure.caseId,
    originalFailurePreserved: true,
    explanation,
    source: build.commit,
    at: new Date().toISOString(),
  }) + "\n",
  { mode: 0o600 },
);
delete progress.paused;
await writeFile(
  join(output, "progress.json"),
  JSON.stringify(progress, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    reviewRecorded: true,
    authorityChanged: false,
    originalFailurePreserved: true,
    newRetestsQueued: progress.retests?.length ?? 0,
  }),
);
