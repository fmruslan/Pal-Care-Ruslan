/** Host SSH only. Never invokes provider/DB/browser/service or edits a journal.
 * The explicit prepare/approve/disable actions mutate only the separate grant.
 * Do not run until exact-source security/CI and compatible fallback proof exist. */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { StandingOwner } from "../src/lib/careos/standing-owner";
import {
  RECOVERY_OWNER_APPROVAL,
  recoveryHistorySchema,
  recoveryReleaseSchema,
  recoveryRuntimeEvidence,
  recoveryHistoryHash,
  recoveryHash,
  recoveryCheckpointSchema,
} from "../src/lib/careos/evaluation-recovery";
import { assertBuild } from "./workspace.mjs";
import { assertCiReceipt } from "./ci-receipt.mjs";

const root = "/tmp/opencode/north-language-300";
const sha = (body: string) => createHash("sha256").update(body).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
async function evidence(name: string) {
  // Fixed filenames only, never a caller-supplied credential/JSON path.
  const handle = await open(
    `${root}/${name}`,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const st = await handle.stat();
    if (
      !st.isFile() ||
      st.uid !== process.getuid?.() ||
      st.mode & 0o077 ||
      st.nlink !== 1 ||
      st.size > 131072
    )
      throw Error("private_evidence_required");
    const body = await handle.readFile("utf8");
    return { value: JSON.parse(body) as unknown, hash: sha(body) };
  } finally {
    await handle.close();
  }
}
async function gates() {
  const answer = await evidence("recovery-owner-approval-063.json");
  if (answer.hash !== RECOVERY_OWNER_APPROVAL)
    throw Error("exact_owner_answer_required");
  // These guards verify the actual clean current source, not a supplied SHA.
  const build = assertBuild(true);
  const runtime = await recoveryRuntimeEvidence();
  const { readFile } = await import("node:fs/promises");
  const ci = assertCiReceipt(
    build,
    JSON.parse(await readFile(".next/palcare-ci.json", "utf8")),
  );
  if (ci.lane !== "full") throw Error("full_recovery_release_required");
  const release = runtime.release;
  const security = await evidence("recovery-security-review-063.json");
  const reviewed = z
    .object({ release: recoveryReleaseSchema, approved: z.literal(true) })
    .parse(security.value);
  const preservation = await evidence("recovery-preservation-063.json");
  const preserved = z
    .object({
      release: recoveryReleaseSchema,
      preserved: z.literal(true),
      ownerStateHash: digest,
    })
    .parse(preservation.value);
  const provider = await evidence("recovery-provider-eligibility-063.json");
  const eligible = z
    .object({
      release: recoveryReleaseSchema,
      eligible: z.literal(true),
      checkedAt: z.number().int().nonnegative(),
    })
    .parse(provider.value);
  const fallback = await evidence("recovery-compatible-fallback-063.json");
  const compatible = z
    .object({
      release: recoveryReleaseSchema,
      recoveryAware: z.literal(true),
      startupHttpsPassed: z.literal(true),
      oldCredentialDenied: z.literal(true),
      injectedRecoveryLogoutPassed: z.literal(true),
      ciReceipt: z.unknown(),
    })
    .parse(fallback.value);
  const fallbackCi = assertCiReceipt(compatible.release, compatible.ciReceipt);
  if (fallbackCi.lane !== "full") throw Error("full_fallback_ci_required");
  for (const receipt of [reviewed, preserved, eligible])
    if (JSON.stringify(receipt.release) !== JSON.stringify(release))
      throw Error("evidence_source_mismatch");
  if (
    eligible.checkedAt > Date.now() ||
    Date.now() - eligible.checkedAt > 300000
  )
    throw Error("fresh_provider_eligibility_receipt_required");
  // The owner supplies actual independently reviewed fallback proof; strings in
  // a manifest alone do not execute or certify a startup/HTTPS/logout check.
  if (compatible.release.commit === "091dc83d2fd791b06ee181aaf476c393e014c226")
    throw Error("old_fallback_cannot_hold_active_recovery");
  return {
    release,
    ciReceiptHash: runtime.ciReceiptHash,
    securityReviewHash: security.hash,
    preservationHash: preservation.hash,
    preservationOwnerStateHash: preserved.ownerStateHash,
    providerEligibilityHash: provider.hash,
    providerEligibilityCheckedAt: eligible.checkedAt,
    fallback: {
      release: compatible.release,
      evidenceHash: fallback.hash,
      ciReceiptHash: recoveryHash(fallbackCi),
      ciRunId: fallbackCi.runId,
      recoveryAware: compatible.recoveryAware,
      startupHttpsPassed: compatible.startupHttpsPassed,
      oldCredentialDenied: compatible.oldCredentialDenied,
      injectedRecoveryLogoutPassed: compatible.injectedRecoveryLogoutPassed,
    },
  };
}
const [action, id, binding, ...extra] = process.argv.slice(2);
try {
  if (
    process.env.CI ||
    extra.length ||
    !["--inspect", "--prepare", "--approve", "--disable"].includes(
      action ?? "",
    ) ||
    (action === "--approve"
      ? !z.uuid().safeParse(id).success || !digest.safeParse(binding).success
      : !!id || !!binding)
  )
    throw Error("host_only_bounded_arguments_required");
  const owner = new StandingOwner();
  if (action === "--inspect")
    console.log(
      JSON.stringify(await owner.evaluationRecoveryStatus(), null, 2),
    );
  else if (action === "--disable") {
    // On failure: STOP. Never start an unaware fallback with an active grant.
    await owner.disableEvaluationRecovery("controlled-fallback-or-owner-stop");
    console.log(
      "Recovery disabled durably; no session, journal, deadline or allowance was restored.",
    );
  } else if (action === "--prepare") {
    const manifest = z
      .strictObject({
        recordsOwnerDigest: digest,
        history: recoveryHistorySchema,
        checkpoint: recoveryCheckpointSchema,
      })
      .parse((await evidence("recovery-history-manifest-063.json")).value);
    const hash = await owner.prepareEvaluationRecovery({
      ...manifest,
      gates: await gates(),
    });
    console.log(
      JSON.stringify({ prepared: true, bindingHash: hash, active: false }),
    );
  } else {
    const current = await gates();
    const saved = await owner.evaluationRecoveryBinding();
    if (
      recoveryHistoryHash(current) !== recoveryHistoryHash(saved.binding.gates)
    )
      throw Error("approval_evidence_changed");
    await owner.approveEvaluationRecovery(id!, binding!);
    console.log(
      "Exact pending challenge approved; browser finish still required. No old credential was revived.",
    );
  }
} catch {
  console.error(
    "Recovery denied. Preserve the checkpoint and inspect exact evidence; no automatic retry, replacement or fallback.",
  );
  process.exitCode = 1;
}
