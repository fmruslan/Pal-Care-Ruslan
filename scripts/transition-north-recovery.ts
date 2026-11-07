/** Explicit host-only one-shot continuity; never imported by HTTP/startup.
 * No cookies, provider/DB requests, service changes, replay or grant mutation. */
import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  StandingOwner,
  ownerFiles,
  evaluationRecoveryCheckpoint,
} from "../src/lib/careos/standing-owner";
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
  createPostStopProposal,
  postStopProposalSchema,
  postStopApprovalSchema,
  POST_STOP_RESTRICTION_EVENT,
  RECOVERY_SESSION,
  RECOVERY_TRANSITION_FILE,
} from "../src/lib/careos/evaluation-recovery";
import { assertBuild } from "./workspace.mjs";
import { assertCiReceipt } from "./ci-receipt.mjs";
import { verifyNorthRecoveryInventory } from "./north-recovery-fallback";

const receiptsDirectory = "/tmp/opencode/north-language-300";
const retainedFallbackRoot =
  "/home/bigrus/.local/state/palcare-releases/release-63a877f-north300-compatible";
export const postStopReceiptsDirectory = `${receiptsDirectory}/recovery-150`;
export const postStopFallbackRoot =
  "/home/bigrus/.local/state/palcare-releases/release-north-recovery-150-compatible";
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

/** Offline engineering receipts do NOT claim that production was switched.
 * Private host attestations retain the existing owner/root trust limitation. */
export const postStopEngineeringReceiptSchema = receiptSchema.extend({
  ciReceiptHash: digest,
  independentStaticSecurityReviewPassed: z.literal(true),
  offlineActualApplicationQaPassed: z.literal(true),
  all63CompletedUnchanged: z.literal(true),
  original274AndUnknownUnchanged: z.literal(true),
  originalGrantAndCredentialUnchanged: z.literal(true),
  purchaseDataAndAccountingUnchanged: z.literal(true),
  offlineSameSourceFallbackPassed: z.literal(true),
  cap150AndQuestionMarkersVerified: z.literal(true),
  securityReviewHash: digest,
  preservationHash: digest,
  offlineQaHash: digest,
  fallbackReadinessHash: digest,
  fallback: postStopProposalSchema.shape.fallback,
  fallbackCiReceipt: z.unknown(),
});
export const postStopHistoryReceiptSchema = transitionHistoryReceiptSchema
  .omit({ ownerStatus: true })
  .extend({
    ownerStatus: z.strictObject({
      browserAccess: z.literal("cookie-rejected"),
      recoveryActive: z.literal(false),
      originalBrowserRevoked: z.literal(true),
      credentialRecognizedButDisabled: z.literal(true),
      originalCredentialDenied: z.literal(true),
      used: z.literal(63),
      historicalLimit: z.literal(300),
      effectiveLimit: z.literal(150),
      remaining: z.literal(87),
      unknown: z.literal(1),
      standingUsed: z.literal(274),
      standingRemaining: z.literal(26),
    }),
  });
export const postStopLiveReceiptSchema = receiptSchema.extend({
  productionHttpsPassed: z.literal(true),
  sameSourceFallbackHttpsPassed: z.literal(true),
  originalGrantUnchanged: z.literal(true),
});

/** Pure assembly for offline tests and host receipts. Does not approve or write.
 * The core revalidates all bindings and fresh evidence under the owner lock. */
export function preparePostStopContinuation(value: {
  proposal: unknown;
  approval: unknown;
  history: unknown;
  provider: unknown;
  live: unknown;
}) {
  const p = postStopProposalSchema.parse(value.proposal);
  const a = postStopApprovalSchema.parse(value.approval);
  const history = postStopHistoryReceiptSchema.parse(value.history);
  const provider = transitionProviderReceiptSchema.parse(value.provider);
  const live = postStopLiveReceiptSchema.parse(value.live);
  const proposalHash = recoveryHash(p),
    approvalHash = recoveryHash(a);
  if (
    a.proposalHash !== proposalHash ||
    approvalHash === RECOVERY_TRANSITION_OWNER_APPROVAL
  )
    throw Error("separate_exact_proposal_approval_required");
  for (const receipt of [history, provider, live]) {
    if (
      recoveryHash(receipt.release) !== recoveryHash(p.release) ||
      receipt.originalDocumentHash !== p.originalDocumentHash ||
      receipt.originalBindingHash !== p.originalBindingHash ||
      receipt.ownerStateHash !== p.terminalCheckpoint.ownerStateHash ||
      receipt.checkedAt <= a.approvedAt
    )
      throw Error("fresh_post_approval_exact_source_receipts_required");
  }
  if (
    history.ciReceiptHash !== p.ciReceiptHash ||
    history.historyHash !== recoveryHistoryHash(history.history)
  )
    throw Error("exact_owned_history_required");
  return recoveryTransitionPreparationSchema.parse({
    ownerApprovalHash: approvalHash,
    originalDocumentHash: p.originalDocumentHash,
    originalBindingHash: p.originalBindingHash,
    ownerStateHash: p.terminalCheckpoint.ownerStateHash,
    fromRelease: p.fromRelease,
    fromCiReceiptHash: p.fromCiReceiptHash,
    toGate: {
      release: p.release,
      ciReceiptHash: p.ciReceiptHash,
      securityReviewHash: p.securityReviewHash,
      preservationHash: p.preservationHash,
      preservationOwnerStateHash: p.terminalCheckpoint.ownerStateHash,
      providerEligibilityHash: recoveryHash(provider),
      providerEligibilityCheckedAt: provider.checkedAt,
      fallbackReadinessHash: p.fallbackReadinessHash,
      // Live receipt parsing above requires actual post-approval HTTPS checks.
      // Only then can the active gate carry a true startup-HTTPS flag.
      fallback: { ...p.fallback, startupHttpsPassed: true },
    },
    history: {
      release: history.release,
      ciReceiptHash: history.ciReceiptHash,
      checkedAt: history.checkedAt,
      evidenceHash: recoveryHash(history),
      ownerStatusHash: recoveryHash(history.ownerStatus),
      bindingHash: history.originalBindingHash,
      recordsOwnerDigest: history.recordsOwnerDigest,
      historyHash: history.historyHash,
      existingRecoveryCredentialVerified: true,
      serverOwnedRecordsProofVerified: true,
      allOriginalPrefixesUnchanged: true,
    },
    postStop: {
      kind: p.kind,
      proposalHash,
      approvalHash,
      approvedAt: a.approvedAt,
      proposal: p,
      approval: a,
      terminalCheckpoint: p.terminalCheckpoint,
      terminalRestrictionEventId: p.terminalRestrictionEventId,
      activationTokenHash: p.activationTokenHash,
      historicalLimit: p.historicalLimit,
      executionLimit: p.executionLimit,
      baselineUsed: p.baselineUsed,
      maxAdditional: p.maxAdditional,
      questionMaxStages: p.questionMaxStages,
      maxRetries: p.maxRetries,
      scope: p.scope,
      liveChecks: {
        release: live.release,
        checkedAt: live.checkedAt,
        evidenceHash: recoveryHash(live),
        productionHttpsPassed: true,
        sameSourceFallbackHttpsPassed: true,
        originalGrantUnchanged: true,
      },
    },
  });
}

async function protectedFile(name: string, root = receiptsDirectory) {
  // Only fixed internal names; no command-line/env path or source override.
  const path = join(root, name);
  const directory = await lstat(root);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid?.() ||
    directory.mode & 0o077 ||
    (await realpath(root)) !== resolve(root)
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
      (root === postStopReceiptsDirectory && (stat.mode & 0o777) !== 0o600) ||
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

const postStopReceipt = (name: string) =>
  protectedFile(name, postStopReceiptsDirectory);

async function verifyPostStopFallback(
  release: z.infer<typeof recoveryReleaseSchema>,
  fallback: z.infer<typeof postStopProposalSchema>["fallback"],
) {
  const [rawBuild, buildId, manifest, managed] = await Promise.all([
    readFile(`${postStopFallbackRoot}/.next/palcare-build.json`, "utf8"),
    readFile(`${postStopFallbackRoot}/.next/BUILD_ID`, "utf8"),
    readFile(`${postStopFallbackRoot}-manifest.json`),
    readFile("scripts/north-recovery-fallback.ts"),
  ]);
  const build = JSON.parse(rawBuild);
  const sha = (raw: Buffer) => createHash("sha256").update(raw).digest("hex");
  if (
    build.commit !== release.commit ||
    build.sourceHash !== release.sourceHash ||
    build.buildId !== release.buildId ||
    buildId.trim() !== release.buildId ||
    !["", false].includes(build.dirty) ||
    recoveryHash(fallback.release) !== recoveryHash(release) ||
    fallback.evidenceHash !== sha(manifest) ||
    fallback.managedEntrypointHash !== sha(managed)
  )
    throw Error("same_source_frozen_post_stop_fallback_required");
  // For the post-stop variant evidenceHash is the exact frozen manifest hash;
  // fallbackReadinessHash separately binds the offline acceptance receipt.
  await verifyNorthRecoveryInventory(postStopFallbackRoot, release);
}

async function postStopBuild() {
  const build = assertBuild(true);
  if (build.dirty) throw Error("clean_exact_main_build_required");
  const ci = assertCiReceipt(
    build,
    JSON.parse(await readFile(".next/palcare-ci.json", "utf8")),
  );
  if (ci.lane !== "full") throw Error("full_exact_source_ci_required");
  return {
    build,
    ci,
    release: recoveryReleaseSchema.parse({
      commit: build.commit,
      sourceHash: build.sourceHash,
      buildId: build.buildId,
    }),
  };
}

async function terminalPostStopInputs() {
  const files = ownerFiles(); // Read only: no prepare, grant/ledger write or lock here.
  if (await files.snapshot(RECOVERY_TRANSITION_FILE))
    throw Error("one_shot_transition_already_used");
  const original = await files.snapshot(RECOVERY_FILE);
  const owner = await files.snapshot("owner-state.json");
  if (!original || !owner) throw Error("terminal_originals_required");
  const doc = evaluationRecoverySchema.parse(original.value);
  const checkpoint = evaluationRecoveryCheckpoint(owner.value);
  // evaluationRecoveryCheckpoint has already parsed the full strict owner schema.
  const state =
    owner.value as import("../src/lib/careos/standing-owner").OwnerState;
  const stop = state.events.at(-1);
  if (
    doc.phase !== "disabled" ||
    !doc.activation ||
    !doc.disabled ||
    doc.audit.length !== 5 ||
    checkpoint.eventCount !== 785 ||
    doc.binding.checkpointEventCount !== 784 ||
    stop?.id !== POST_STOP_RESTRICTION_EVENT ||
    stop.kind !== "revoke-session" ||
    stop.subject !== RECOVERY_SESSION ||
    stop.at !== 1794034945391 ||
    recoveryHash(
      evaluationRecoveryCheckpoint({
        ...state,
        events: state.events.slice(0, 784),
      }),
    ) !== recoveryHash(doc.binding.checkpoint) ||
    recoveryHash(checkpoint) !==
      recoveryHash({
        ...doc.binding.checkpoint,
        ownerStateHash: recoveryHash(state),
        eventCount: 785,
        eventHash: recoveryHash(state.events),
      })
  )
    throw Error("exact_disabled_terminal_checkpoint_required");
  return { files, original, doc, checkpoint };
}

/** No service switch and no protected authority write. Only the fixed private
 * proposal is created, exclusively, after the offline/full-CI engineering gates. */
export async function proposeNorthRecovery150() {
  const { build, ci, release } = await postStopBuild();
  const { original, doc, checkpoint } = await terminalPostStopInputs();
  const engineering = postStopEngineeringReceiptSchema.parse(
    (await postStopReceipt("engineering.json")).value,
  );
  const fallbackCi = assertCiReceipt(
    engineering.fallback.release,
    engineering.fallbackCiReceipt,
  );
  const now = Date.now();
  if (
    now >= RECOVERY_DEADLINE ||
    now < (doc.disabled?.at ?? Infinity) ||
    engineering.checkedAt > now ||
    engineering.checkedAt < Date.parse(build.builtAt) ||
    engineering.originalDocumentHash !== original.hash ||
    engineering.originalBindingHash !== recoveryHash(doc.binding) ||
    engineering.ownerStateHash !== checkpoint.ownerStateHash ||
    recoveryHash(engineering.release) !== recoveryHash(release) ||
    engineering.ciReceiptHash !== recoveryHash(ci) ||
    recoveryHash(engineering.fallback.release) !== recoveryHash(release) ||
    engineering.fallback.ciReceiptHash !== recoveryHash(ci) ||
    fallbackCi.lane !== "full" ||
    recoveryHash(fallbackCi) !== recoveryHash(ci) ||
    fallbackCi.runId !== engineering.fallback.ciRunId
  )
    throw Error("exact_offline_engineering_receipts_required");
  await verifyPostStopFallback(release, engineering.fallback);
  if (recoveryHash(assertBuild(true)) !== recoveryHash(build))
    throw Error("build_changed_during_proposal");
  const current = await terminalPostStopInputs();
  if (
    current.original.hash !== original.hash ||
    recoveryHash(current.checkpoint) !== recoveryHash(checkpoint)
  )
    throw Error("terminal_inputs_changed");
  const result = createPostStopProposal({
    version: 1,
    kind: "explicit-post-stop-150",
    createdAt: now,
    expiresAt: RECOVERY_DEADLINE,
    originalDocumentHash: original.hash,
    originalBindingHash: recoveryHash(doc.binding),
    activationTokenHash: doc.activation!.tokenHash,
    terminalCheckpoint: checkpoint,
    terminalRestrictionEventId: POST_STOP_RESTRICTION_EVENT,
    fromRelease: doc.binding.gates.release,
    fromCiReceiptHash: doc.binding.gates.ciReceiptHash,
    release,
    ciReceiptHash: recoveryHash(ci),
    securityReviewHash: engineering.securityReviewHash,
    preservationHash: engineering.preservationHash,
    offlineQaHash: engineering.offlineQaHash,
    fallbackReadinessHash: engineering.fallbackReadinessHash,
    fallback: engineering.fallback,
    pendingLiveChecks: [
      "private-production-https-switch",
      "same-source-fallback-https-smoke",
      "fresh-disabled-cookie-owned-records-get-and-provider-eligibility",
    ],
    historicalLimit: 300,
    executionLimit: 150,
    baselineUsed: 63,
    maxAdditional: 87,
    questionMaxStages: 2,
    maxRetries: 0,
    scope: "customer-records-including-personal-insights-native-sdk",
  });
  // Fixed path, exclusive create: never overwrite any proposal/approval/evidence.
  const handle = await open(
    join(postStopReceiptsDirectory, "proposal.json"),
    "wx",
    0o600,
  );
  try {
    await handle.writeFile(JSON.stringify(result.proposal, null, 2) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await open(postStopReceiptsDirectory, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  return {
    proposalHash: result.proposalHash,
    authority: "disabled",
    pendingLiveChecks: result.proposal.pendingLiveChecks,
  };
}

/** Future explicit owner approval only. All inputs are fixed 0600 host files;
 * no argv/env approval, cookie, path, provider or source overrides exist. */
export async function resumeNorthRecovery150() {
  const { build, ci, release } = await postStopBuild();
  const p = postStopProposalSchema.parse(
    (await postStopReceipt("proposal.json")).value,
  );
  const a = postStopApprovalSchema.parse(
    (await postStopReceipt("owner-approval.json")).value,
  );
  const { files, original, doc, checkpoint } = await terminalPostStopInputs();
  const now = Date.now();
  if (
    a.proposalHash !== recoveryHash(p) ||
    a.approvedAt <= p.createdAt ||
    a.approvedAt > now ||
    now >= RECOVERY_DEADLINE ||
    p.originalDocumentHash !== original.hash ||
    p.originalBindingHash !== recoveryHash(doc.binding) ||
    recoveryHash(p.terminalCheckpoint) !== recoveryHash(checkpoint) ||
    recoveryHash(p.release) !== recoveryHash(release) ||
    p.ciReceiptHash !== recoveryHash(ci)
  )
    throw Error("future_explicit_exact_proposal_approval_required");
  const [history, provider, live] = await Promise.all([
    postStopReceipt("history.json"),
    postStopReceipt("provider.json"),
    postStopReceipt("live-checks.json"),
  ]);
  const input = preparePostStopContinuation({
    proposal: p,
    approval: a,
    history: history.value,
    provider: provider.value,
    live: live.value,
  });
  // Last asynchronous preflight is actual same-source frozen inventory; core
  // repeats release/state/grant/clock checks under the durable owner lock.
  if (recoveryHash(assertBuild(true)) !== recoveryHash(build))
    throw Error("build_changed_during_transition");
  await verifyPostStopFallback(release, p.fallback);
  return new StandingOwner(files).transitionEvaluationRecovery(input);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (
      process.env.CI ||
      process.argv.length !== 3 ||
      !["--apply", "--propose-150", "--resume-150"].includes(process.argv[2])
    )
      throw Error("explicit_host_transition_required");
    const action = process.argv[2];
    const result =
      action === "--propose-150"
        ? await proposeNorthRecovery150()
        : {
            recordHash: await (action === "--resume-150"
              ? resumeNorthRecovery150()
              : transitionNorthRecovery()),
          };
    console.log(
      JSON.stringify({
        transition:
          action === "--propose-150"
            ? "proposal-only-no-authority"
            : "recorded-once",
        ...result,
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
