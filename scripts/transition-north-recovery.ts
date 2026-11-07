/** Explicit host-only one-shot continuity; never imported by HTTP/startup.
 * No cookies, provider/DB requests, service changes, replay or grant mutation. */
import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { StandingOwner, ownerFiles } from "../src/lib/careos/standing-owner";
import {
  RECOVERY_FILE,
  RECOVERY_TRANSITION_FROM,
  RECOVERY_TRANSITION_OWNER_APPROVAL,
  evaluationRecoverySchema,
  recoveryHash,
  recoveryHistoryHash,
  recoveryHistorySchema,
  RECOVERY_EVALUATION,
  RECOVERY_DEADLINE,
  recoveryReleaseSchema,
  recoveryTransitionGateSchema,
  recoveryTransitionPreparationSchema,
} from "../src/lib/careos/evaluation-recovery";
import { assertBuild } from "./workspace.mjs";
import { assertCiReceipt } from "./ci-receipt.mjs";
import { verifyNorthRecoveryInventory } from "./north-recovery-fallback";

const receiptsDirectory = "/tmp/opencode/north-language-300";
const retainedFallbackRoot =
  "/home/bigrus/.local/state/palcare-releases/release-63a877f-north300-compatible";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z.strictObject({
  version: z.literal(1),
  release: recoveryReleaseSchema,
  checkedAt: z.number().int().nonnegative(),
  originalDocumentHash: digest,
  originalBindingHash: digest,
  ownerStateHash: digest,
});
export const transitionSecurityReceiptSchema = receiptSchema.extend({
  independentAuditPassed: z.literal(true),
  privateHttpsPassed: z.literal(true),
  actualRuntimeVerified: z.literal(true),
  originalGrantUnchanged: z.literal(true),
  noNewAuthority: z.literal(true),
});
export const transitionPreservationReceiptSchema = receiptSchema.extend({
  all63CompletedUnchanged: z.literal(true),
  original274AndUnknownUnchanged: z.literal(true),
  purchaseDataAndAccountingUnchanged: z.literal(true),
});
export const transitionProviderReceiptSchema = receiptSchema.extend({
  eligible: z.literal(true),
  provider: z.literal("chatgpt-subscription"),
  model: z.literal("gpt-6.1-sol"),
  reasoning: z.literal("medium"),
  creditsDisabledConfirmed: z.literal(true),
  paidFallbackDisabled: z.literal(true),
});
export const transitionFallbackReceiptSchema = receiptSchema.extend({
  fallback: recoveryTransitionGateSchema.shape.fallback,
  ciReceipt: z.unknown(),
  inventoryVerified: z.literal(true),
  disableBeforeSwitchTestPassed: z.literal(true),
});
export const transitionHistoryReceiptSchema = receiptSchema.extend({
  ciReceiptHash: digest,
  recordsOwnerDigest: digest,
  historyHash: digest,
  history: recoveryHistorySchema,
  /** Normalized actual GET read-back; never include raw cookies or transcripts. */
  ownerStatus: z.strictObject({
    liveEnabled: z.literal(true),
    remembered: z.literal(true),
    browserCompletion: z.literal("complete"),
    browserAccess: z.literal("recovery-active"),
    originalBrowserRevoked: z.literal(true),
    recoveryActive: z.literal(true),
    providerBlocked: z.literal(false),
    revoked: z.literal(false),
    policy: z.literal("approved"),
    used: z.literal(63),
    remaining: z.literal(237),
    unknown: z.literal(1),
    standingAllocation: z.strictObject({
      used: z.literal(274),
      remaining: z.literal(26),
    }),
    evaluation: z.strictObject({
      id: z.literal(RECOVERY_EVALUATION),
      limit: z.literal(300),
      expiresAt: z.literal(RECOVERY_DEADLINE),
      used: z.literal(63),
      remaining: z.literal(237),
      browserBound: z.literal(true),
    }),
  }),
  existingRecoveryCredentialVerified: z.literal(true),
  serverOwnedRecordsProofVerified: z.literal(true),
  allOriginalPrefixesUnchanged: z.literal(true),
});

async function protectedFile(name: string) {
  // Only fixed internal names; no command-line/env path or source override.
  const path = join(receiptsDirectory, name);
  const directory = await lstat(receiptsDirectory);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid?.() ||
    directory.mode & 0o077 ||
    (await realpath(receiptsDirectory)) !== resolve(receiptsDirectory)
  )
    throw Error("private_transition_receipts_required");
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 0o077 ||
      stat.nlink !== 1 ||
      stat.size > 131072
    )
      throw Error("private_transition_receipt_required");
    const raw = await handle.readFile("utf8");
    return {
      value: JSON.parse(raw) as unknown,
      hash: createHash("sha256").update(raw).digest("hex"),
    };
  } finally {
    await handle.close();
  }
}

const protectedReceipt = (kind: string) =>
  protectedFile(`recovery-transition-${kind}-063.json`);

/** The real CLI uses this same ordering/identity gate with fixed-path readers.
 * Injected operations are isolated test doubles, never argv/env path overrides. */
export async function applyNorthRecoveryTransition<T>(ops: {
  readFallbackBuild: () => Promise<unknown>;
  readFallbackBuildId: () => Promise<string>;
  verifyFallbackInventory: () => Promise<void>;
  transition: () => Promise<T>;
}) {
  const build = z
    .object({
      commit: z.string(),
      sourceHash: z.string(),
      buildId: z.string(),
      dirty: z.union([z.literal(""), z.literal(false)]),
    })
    .parse(await ops.readFallbackBuild());
  if (
    build.commit !== RECOVERY_TRANSITION_FROM.commit ||
    build.sourceHash !== RECOVERY_TRANSITION_FROM.sourceHash ||
    build.buildId !== RECOVERY_TRANSITION_FROM.buildId ||
    (await ops.readFallbackBuildId()).trim() !==
      RECOVERY_TRANSITION_FROM.buildId
  )
    throw Error("immutable_transition_fallback_build_mismatch");
  // Actual inventory, not a receipt boolean, is the last async preflight before
  // the shared-owner-lock transition. No authority write on any mismatch.
  await ops.verifyFallbackInventory();
  return ops.transition();
}

/** Reads only fixed protected receipts. The final state/doc checks and single
 * write occur under StandingOwner's owner lock, shared with every reservation. */
export async function transitionNorthRecovery() {
  const build = assertBuild(true);
  if (build.dirty) throw Error("clean_exact_main_build_required");
  const ci = assertCiReceipt(
    build,
    JSON.parse(await readFile(".next/palcare-ci.json", "utf8")),
  );
  if (ci.lane !== "full") throw Error("full_exact_source_ci_required");
  const release = recoveryReleaseSchema.parse({
    commit: build.commit,
    sourceHash: build.sourceHash,
    buildId: build.buildId,
  });
  const approval = await protectedReceipt("owner-approval");
  if (approval.hash !== RECOVERY_TRANSITION_OWNER_APPROVAL)
    throw Error("exact_transition_owner_approval_required");
  const files = ownerFiles();
  await files.prepare();
  const original = await files.snapshot(RECOVERY_FILE);
  if (!original) throw Error("existing_active_recovery_required");
  const doc = evaluationRecoverySchema.parse(original.value);
  const [security, preservation, provider, fallback, history] =
    await Promise.all([
      protectedReceipt("security"),
      protectedReceipt("preservation"),
      protectedReceipt("provider"),
      protectedReceipt("fallback"),
      protectedReceipt("history"),
    ]);
  const securityProof = transitionSecurityReceiptSchema.parse(security.value);
  const preservationProof = transitionPreservationReceiptSchema.parse(
    preservation.value,
  );
  const providerProof = transitionProviderReceiptSchema.parse(provider.value);
  const fallbackProof = transitionFallbackReceiptSchema.parse(fallback.value);
  const historyProof = transitionHistoryReceiptSchema.parse(history.value);
  const now = Date.now();
  for (const proof of [
    securityProof,
    preservationProof,
    providerProof,
    fallbackProof,
  ]) {
    if (
      recoveryHash(proof.release) !== recoveryHash(release) ||
      proof.originalDocumentHash !== original.hash ||
      proof.originalBindingHash !== recoveryHash(doc.binding) ||
      proof.ownerStateHash !== doc.binding.checkpoint.ownerStateHash ||
      proof.checkedAt > now ||
      proof.checkedAt < Date.parse(build.builtAt)
    )
      throw Error("exact_source_bound_transition_receipt_required");
  }
  if (
    recoveryHash(historyProof.release) !==
      recoveryHash(RECOVERY_TRANSITION_FROM) ||
    historyProof.ciReceiptHash !== doc.binding.gates.ciReceiptHash ||
    historyProof.originalDocumentHash !== original.hash ||
    historyProof.originalBindingHash !== recoveryHash(doc.binding) ||
    historyProof.ownerStateHash !== doc.binding.checkpoint.ownerStateHash ||
    recoveryHistoryHash(historyProof.history) !== historyProof.historyHash
  )
    throw Error("exact_old_source_owned_history_readback_required");
  const fallbackCi = assertCiReceipt(
    fallbackProof.fallback.release,
    fallbackProof.ciReceipt,
  );
  const retainedFallback = await protectedFile(
    "recovery-compatible-fallback-063.json",
  );
  const retainedFallbackSchema = z.object({
    release: recoveryReleaseSchema,
    recoveryAware: z.literal(true),
    startupHttpsPassed: z.literal(true),
    oldCredentialDenied: z.literal(true),
    injectedRecoveryLogoutPassed: z.literal(true),
    ciReceipt: z.unknown(),
  });
  const retained = retainedFallbackSchema.parse(retainedFallback.value);
  const retainedCi = assertCiReceipt(retained.release, retained.ciReceipt);
  const managedHash = createHash("sha256")
    .update(await readFile("scripts/north-recovery-fallback.ts"))
    .digest("hex");
  if (
    fallbackCi.lane !== "full" ||
    fallbackCi.runId !== fallbackProof.fallback.ciRunId ||
    recoveryHash(fallbackCi) !== fallbackProof.fallback.ciReceiptHash ||
    retainedCi.lane !== "full" ||
    recoveryHash(retainedCi) !== recoveryHash(fallbackCi) ||
    recoveryHash(retained.release) !== recoveryHash(RECOVERY_TRANSITION_FROM) ||
    fallbackProof.fallback.evidenceHash !== retainedFallback.hash ||
    fallbackProof.fallback.managedEntrypointHash !== managedHash ||
    historyProof.historyHash !== recoveryHistoryHash(doc.binding.history) ||
    historyProof.recordsOwnerDigest !== doc.binding.recordsOwnerDigest
  )
    throw Error("verified_fallback_and_owned_history_required");
  // Recheck clean exact-main provenance immediately before locked core creation.
  if (recoveryHash(assertBuild(true)) !== recoveryHash(build))
    throw Error("build_changed_during_transition");
  const input = recoveryTransitionPreparationSchema.parse({
    ownerApprovalHash: approval.hash,
    originalDocumentHash: original.hash,
    originalBindingHash: recoveryHash(doc.binding),
    ownerStateHash: doc.binding.checkpoint.ownerStateHash,
    fromRelease: RECOVERY_TRANSITION_FROM,
    fromCiReceiptHash: doc.binding.gates.ciReceiptHash,
    toGate: {
      release,
      ciReceiptHash: recoveryHash(ci),
      securityReviewHash: security.hash,
      preservationHash: preservation.hash,
      preservationOwnerStateHash: preservationProof.ownerStateHash,
      providerEligibilityHash: provider.hash,
      providerEligibilityCheckedAt: providerProof.checkedAt,
      fallbackReadinessHash: fallback.hash,
      fallback: fallbackProof.fallback,
    },
    history: {
      release: historyProof.release,
      ciReceiptHash: historyProof.ciReceiptHash,
      checkedAt: historyProof.checkedAt,
      evidenceHash: history.hash,
      ownerStatusHash: recoveryHash(historyProof.ownerStatus),
      bindingHash: historyProof.originalBindingHash,
      recordsOwnerDigest: historyProof.recordsOwnerDigest,
      historyHash: historyProof.historyHash,
      existingRecoveryCredentialVerified: true,
      serverOwnedRecordsProofVerified: true,
      allOriginalPrefixesUnchanged: true,
    },
  });
  return applyNorthRecoveryTransition({
    readFallbackBuild: async () =>
      JSON.parse(
        await readFile(
          `${retainedFallbackRoot}/.next/palcare-build.json`,
          "utf8",
        ),
      ),
    readFallbackBuildId: () =>
      readFile(`${retainedFallbackRoot}/.next/BUILD_ID`, "utf8"),
    verifyFallbackInventory: () =>
      verifyNorthRecoveryInventory(
        retainedFallbackRoot,
        RECOVERY_TRANSITION_FROM,
      ),
    transition: () =>
      new StandingOwner(files).transitionEvaluationRecovery(input),
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (
      process.env.CI ||
      process.argv.length !== 3 ||
      process.argv[2] !== "--apply"
    )
      throw Error("explicit_host_transition_required");
    const recordHash = await transitionNorthRecovery();
    console.log(
      JSON.stringify({
        transition: "recorded-once",
        recordHash,
        credential: "unchanged",
        dispatches: 0,
      }),
    );
  } catch {
    console.error(
      "Transition stopped. Inspect exact protected evidence; do not bypass, reissue, replay or renew.",
    );
    process.exitCode = 1;
  }
}
