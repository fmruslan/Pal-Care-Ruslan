import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, lstat, readdir, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { CareError } from "./contracts";
import { PilotFiles } from "./subscription/files";
import {
  recoveryHash,
  recoveryReleaseSchema,
  recoveryRuntimeEvidence,
  RECOVERY_EVALUATION,
} from "./evaluation-recovery";
import {
  campaignBudget,
  type CampaignRecoveryResolution,
} from "./campaign-execution";
import type { OwnerState } from "./standing-owner";

export const PROVIDER_RECOVERY_APPROVAL_FILE =
  "provider-failure-recovery-approval.json" as const;
export const PROVIDER_RECOVERY_EXPIRY = 1794989744950;
export const PROVIDER_RECOVERY_REQUEST = "6f7355dc-51be-40fb-ada6-41b7ba4d5a6f";
export const PROVIDER_RECOVERY_CONVERSATION =
  "3df999f4-9cb1-48e6-b3c3-0c182d89662f";
export const PROVIDER_RECOVERY_BROWSER = "4e2bcbaf-6376-44cc-9e7e-688d0b77850f";
export const PROVIDER_RECOVERY_APPROVAL_HASH =
  "e3eca7b06136599c7e9ca3d7676a4f46c0f95e7da94e46c7bbec105ae4dcac2a";
export const PROVIDER_RECOVERY_CHECKPOINT = {
  eventCount: 1894,
  eventHash: "9567808294d587dccffc60c95bf21f1fb746f4e7f75aff53148423c7c1f28ee3",
  ownerStateHash:
    "eb06ecc10c508cfc092e0daebb9673f8f9c64785d3375c151ca8eba3442248e7",
} as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sha = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
export function providerRecoveryDenied(): never {
  throw new CareError("careos_owner_provider_failure_recovery_denied", 403);
}
/** Fixed inputs, never paths selected by a report, CLI argument or HTTP body. */
export const PROVIDER_RECOVERY_INPUT_FILES = [
  "tests/unit/provider-failure-recovery.test.ts",
  "tests/helpers/provider-failure-recovery-fixture.ts",
  "tests/helpers/provider-failure-recovery-child.ts",
  "tests/access/provider-failure-recovery.spec.ts",
  "tests/helpers/provider-failure-recovery-app.ts",
  "scripts/standing-owner.ts",
  "scripts/north-recovery-fallback.ts",
] as const;
export const PROVIDER_RECOVERY_ARTIFACT_FILES = {
  securityProof: "provider-recovery-release/security-unit-proof.json",
  securityResults: "provider-recovery-release/security-unit-results.json",
  threeEngineProof: "provider-recovery-release/three-engine-proof.json",
  threeEngineResults: "provider-recovery-release/three-engine-results.json",
  deployment: "provider-recovery-release/deployment.json",
  frozenHttps: "provider-recovery-release/candidate-frozen-https.json",
  primaryHttps: "provider-recovery-release/primary-https.json",
} as const;
export const PROVIDER_RECOVERY_SECURITY_CASES = [
  "preserves the complete checkpoint/grants/31 sessions/all335 charges/unknown; releases only held1 without browser authority",
  "requires the one normal Pair -> host approve -> Finish, reuses pending secret, denies all old/replayed identities",
  "pre-reservation stop before-publication remains denied across restart without a charge",
  "pre-reservation stop after-publication remains denied across restart without a charge",
  "pre-reservation stop directory-sync remains denied across restart without a charge",
  "provider-block write failure cannot restore continuation after restart",
  "managed-disable write failure cannot restore continuation after restart",
  "failed-settlement write failure cannot restore continuation after restart",
  "wrong and old browser proofs cannot strand the restriction lock",
  "retains whole-question exhaustion and all tail charges through563 without standing17 fallback",
  "one remaining slot at562 cannot admit a whole question or use standing17",
  "touch and restart never extend the original explicit pin; exact boundary rejects admission",
  "serializes real worker installs and competing whole-question/stage processes",
] as const;
export const PROVIDER_RECOVERY_ACCESS_CASES = [
  "stopped original proof retains exact owned unavailable GET history without mutations or provider work",
  "host install → normal pair/approve/Finish → Audio native chart → source-backed two-stage Pi care → GET-only previous result",
  "exact malformed historical guide keeps PostgreSQL fingerprint/row and restores by owned GET before/after normal admission without dispatch",
  ...[
    "known-usage-503",
    "known-user-503",
    "unknown-503",
    "partial-stream",
    "denied-403",
  ].map(
    (mode) =>
      `second provider stop ${mode} charges once, denies old/new proofs and re-pair, and never retries after restart`,
  ),
  "new-format restart parses full accounting; immutable fallback must durably disable before switch and never POST",
  "original finite pin survives admission/restart; expiry cannot refresh authority or mint a replacement browser",
] as const;
/** Local tests bind actual source/input bytes, NOT a falsely claimed future
 * main commit/build ID. Exact-main CI and deployment are checked independently. */
export const providerRecoveryArtifactProofSchema = z.strictObject({
  version: z.literal(1),
  kind: z.enum(["offline-security-units", "isolated-injected-provider"]),
  checkedAt: time,
  sourceHash: digest,
  fileHashes: z.record(z.string(), digest),
  resultsHash: digest,
  providerCalls: z.literal(0),
  externalRequests: z.array(z.string()).max(0),
  skipped: z.literal(0),
  retries: z.literal(0),
});
type RawArtifact = { value: unknown; hash: string };
export type ProviderRecoveryArtifacts = {
  fileHashes: Record<string, string>;
  frozenRoot: string;
  security: { proof: RawArtifact; results: RawArtifact };
  threeEngine: { proof: RawArtifact; results: RawArtifact };
  deployment: RawArtifact;
  frozenHttps: RawArtifact;
  primaryHttps: RawArtifact;
};
const emptyErrors = z.array(z.unknown()).max(0);
const httpsProfileSchema = z.strictObject({
  profile: z.enum([
    "desktop-light",
    "desktop-dark",
    "mobile-light",
    "mobile-dark",
  ]),
  buttonsAndDrafts: z.literal(true),
  barAbsent: z.literal(true),
  historyAndDocuments: z.literal(true),
  nativeGridAndChart: z.literal(true),
  writes: emptyErrors,
  external: emptyErrors,
  errors: emptyErrors,
});
export const providerRecoveryHttpsArtifactSchema = z.strictObject({
  phase: z.enum(["candidate-frozen", "primary"]),
  checkedAt: z.iso.datetime(),
  origin: z.literal("https://greatbison.tail9e8802.ts.net:8444"),
  results: z.array(httpsProfileSchema).length(4),
  providerCalls: z.literal(0),
  scope: z.literal(
    "GET-only actual HTTPS smoke; not recovery installation, admission, provider or real-device acceptance",
  ),
});
const releaseMetadata = recoveryReleaseSchema.passthrough();
export const providerRecoveryDeploymentArtifactSchema = z.object({
  checkedAt: z.iso.datetime(),
  release: releaseMetadata.extend({ dirty: z.literal("") }),
  ci: z
    .object({
      schema: z.literal(1),
      lane: z.literal("full"),
      exactChecks: z.literal(true),
      commit: z.string(),
      sourceHash: digest,
      buildId: z.string(),
      runId: z.number().int().positive(),
      workflow: z.literal(".github/workflows/repository-checks.yml"),
    })
    .passthrough(),
  https: providerRecoveryHttpsArtifactSchema,
  candidateFrozen: z.object({
    root: z.string(),
    release: releaseMetadata,
    startupVerified: z.literal(true),
    inventoryVerified: z.literal(true),
    https: providerRecoveryHttpsArtifactSchema,
  }),
  preservation: z.object({
    recordsPermissionsCredentialsAccountingBindingAndOriginalAuditsUnchanged:
      z.literal(true),
    originalStoppedJournalsUnchanged: z.literal(true),
  }),
  pausedCampaign: z.object({
    executionLimit: z.literal(563),
    used: z.literal(335),
    remaining: z.literal(228),
    held: z.literal(1),
    activeQuestion: z.object({
      requestId: z.literal(PROVIDER_RECOVERY_REQUEST),
      conversationId: z.literal(PROVIDER_RECOVERY_CONVERSATION),
      reservedStages: z.literal(1),
      completedStages: z.literal(0),
    }),
  }),
  providerCalls: z.literal(0),
  credentialRefreshes: z.literal(0),
  financialOperations: z.literal(0),
  recoveryInstalled: z.literal(false),
  inferenceAdmitted: z.literal(false),
  installedStateCompatibilityRequiresSeparateIsolatedEvidence: z.literal(true),
});

const object = (v: unknown) => z.record(z.string(), z.unknown()).parse(v);
const array = (v: unknown) => z.array(z.unknown()).parse(v);
const passedResult = (v: unknown) => {
  const r = object(v);
  if (
    r.status !== "passed" ||
    (r.retry !== undefined && r.retry !== 0) ||
    (r.retryCount !== undefined && r.retryCount !== 0) ||
    (r.error !== undefined && r.error !== null) ||
    (r.errors !== undefined && array(r.errors).length) ||
    (r.failureMessages !== undefined && array(r.failureMessages).length) ||
    (r.retryReasons !== undefined && array(r.retryReasons).length) ||
    (r.meta !== undefined && (object(r.meta).retryCount ?? 0) !== 0)
  )
    return providerRecoveryDenied();
  return r;
};
export function assertProviderRecoveryArtifacts(
  artifacts: ProviderRecoveryArtifacts,
  evidence: z.infer<typeof providerRecoveryReleaseEvidenceSchema>,
  runtime: ProviderRecoveryEnvironment["runtime"],
  now: number,
) {
  const groups = [artifacts.security, artifacts.threeEngine];
  for (const [index, group] of groups.entries()) {
    const proof = providerRecoveryArtifactProofSchema.parse(group.proof.value);
    if (
      group.proof.hash !==
        (index === 0
          ? evidence.securityTestsHash
          : evidence.threeEngineTestsHash) ||
      proof.resultsHash !== group.results.hash ||
      proof.sourceHash !== runtime.release.sourceHash ||
      proof.checkedAt > now ||
      proof.checkedAt > evidence.checkedAt ||
      proof.kind !==
        (index === 0
          ? "offline-security-units"
          : "isolated-injected-provider") ||
      !isDeepStrictEqual(
        Object.keys(proof.fileHashes).sort(),
        [...PROVIDER_RECOVERY_INPUT_FILES].sort(),
      ) ||
      !isDeepStrictEqual(proof.fileHashes, artifacts.fileHashes)
    )
      return providerRecoveryDenied();
  }
  const units = object(artifacts.security.results.value);
  if (
    units.success !== true ||
    units.numFailedTests !== 0 ||
    units.numPendingTests !== 0 ||
    (units.numTodoTests ?? 0) !== 0 ||
    units.numFailedTestSuites !== 0 ||
    (units.numPendingTestSuites ?? 0) !== 0 ||
    units.numPassedTestSuites !== units.numTotalTestSuites ||
    units.numTotalTestSuites === 0
  )
    return providerRecoveryDenied();
  const titles: string[] = [];
  for (const file of array(units.testResults)) {
    const result = passedResult(file);
    if (
      typeof result.name !== "string" ||
      !result.name.endsWith("/tests/unit/provider-failure-recovery.test.ts")
    )
      return providerRecoveryDenied();
    if (result.message !== undefined && result.message !== "")
      return providerRecoveryDenied();
    for (const assertion of array(result.assertionResults)) {
      const r = passedResult(assertion);
      if (typeof r.title !== "string") return providerRecoveryDenied();
      titles.push(r.title);
    }
  }
  if (
    new Set(titles).size !== titles.length ||
    units.numTotalTests !== titles.length ||
    units.numPassedTests !== titles.length ||
    PROVIDER_RECOVERY_SECURITY_CASES.some((name) => !titles.includes(name))
  )
    return providerRecoveryDenied();
  const browser = object(artifacts.threeEngine.results.value),
    stats = object(browser.stats);
  if (
    array(browser.errors).length ||
    stats.unexpected !== 0 ||
    stats.skipped !== 0 ||
    stats.flaky !== 0
  )
    return providerRecoveryDenied();
  const cases = new Map<string, Set<string>>(
    ["chromium", "firefox", "webkit"].map((engine) => [
      engine,
      new Set<string>(),
    ]),
  );
  let total = 0;
  const visit = (suites: unknown[]) => {
    for (const value of suites) {
      const suite = object(value);
      for (const specValue of array(suite.specs ?? [])) {
        const spec = object(specValue);
        if (
          spec.ok !== true ||
          typeof spec.title !== "string" ||
          typeof spec.file !== "string" ||
          !/(^|\/)provider-failure-recovery\.spec\.ts$/.test(spec.file)
        )
          return providerRecoveryDenied();
        for (const testValue of array(spec.tests)) {
          const test = object(testValue),
            results = array(test.results);
          const names =
            typeof test.projectName === "string"
              ? cases.get(test.projectName)
              : undefined;
          if (
            !names ||
            test.status !== "expected" ||
            results.length !== 1 ||
            names.has(spec.title)
          )
            return providerRecoveryDenied();
          const r = passedResult(results[0]);
          if (r.retry !== 0) return providerRecoveryDenied();
          names.add(spec.title);
          total++;
        }
      }
      visit(array(suite.suites ?? []));
    }
  };
  visit(array(browser.suites));
  if (
    stats.expected !== total ||
    [...cases.values()].some((names) =>
      PROVIDER_RECOVERY_ACCESS_CASES.some((name) => !names.has(name)),
    )
  )
    return providerRecoveryDenied();
  const deployment = providerRecoveryDeploymentArtifactSchema.parse(
    artifacts.deployment.value,
  );
  const frozen = providerRecoveryHttpsArtifactSchema.parse(
    artifacts.frozenHttps.value,
  );
  const primary = providerRecoveryHttpsArtifactSchema.parse(
    artifacts.primaryHttps.value,
  );
  for (const smoke of [frozen, primary])
    if (new Set(smoke.results.map((r) => r.profile)).size !== 4)
      return providerRecoveryDenied();
  const identity = (v: z.infer<typeof releaseMetadata>) =>
    recoveryHash({
      commit: v.commit,
      sourceHash: v.sourceHash,
      buildId: v.buildId,
    });
  if (
    artifacts.deployment.hash !== evidence.privateHttpsHash ||
    identity(deployment.release) !== recoveryHash(runtime.release) ||
    identity(deployment.candidateFrozen.release) !==
      recoveryHash(runtime.release) ||
    deployment.candidateFrozen.root !== artifacts.frozenRoot ||
    recoveryHash(object(artifacts.deployment.value).ci) !==
      runtime.ciReceiptHash ||
    deployment.ci.runId !== evidence.ciRunId ||
    frozen.phase !== "candidate-frozen" ||
    primary.phase !== "primary" ||
    !isDeepStrictEqual(deployment.candidateFrozen.https, frozen) ||
    !isDeepStrictEqual(deployment.https, primary) ||
    Date.parse(frozen.checkedAt) > Date.parse(primary.checkedAt) ||
    Date.parse(primary.checkedAt) > Date.parse(deployment.checkedAt) ||
    Date.parse(deployment.checkedAt) > evidence.checkedAt ||
    Date.parse(deployment.checkedAt) > now
  )
    return providerRecoveryDenied();
}
export const providerRecoveryReleaseEvidenceSchema = z.strictObject({
  version: z.literal(1),
  checkedAt: time,
  ownerStateHash: digest,
  release: recoveryReleaseSchema,
  ciReceiptHash: digest,
  ciRunId: z.number().int().positive(),
  securityTestsHash: digest,
  threeEngineTestsHash: digest,
  privateHttpsHash: digest,
  fallback: z.strictObject({
    release: recoveryReleaseSchema,
    manifestHash: digest,
    managedEntrypointHash: digest,
    recoveryAware: z.literal(true),
    startupInventoryHttpsPassed: z.literal(true),
    disableBeforeSwitchPassed: z.literal(true),
  }),
});
export const providerFailureRecoverySchema = z.strictObject({
  version: z.literal(1),
  sequence: z.literal(1),
  purpose: z.literal(
    "north-guide-once-only-known-prestream-failure-continuation",
  ),
  campaignId: z.literal(RECOVERY_EVALUATION),
  ownerApprovalHash: z.literal(PROVIDER_RECOVERY_APPROVAL_HASH),
  approvedAt: time,
  originalBrowserExpiresAt: z.literal(PROVIDER_RECOVERY_EXPIRY),
  checkpoint: z.strictObject({
    ownerStateHash: digest,
    eventCount: z.literal(1894),
    eventHash: digest,
    sessionCount: z.literal(31),
    policyHash: digest,
    evaluationHash: digest,
    quotaHash: digest,
    extensionHash: digest,
    guideHash: digest,
    recordsBindingHash: digest,
  }),
  identity: z.strictObject({
    revokedBrowserSessionId: z.literal(PROVIDER_RECOVERY_BROWSER),
    agentHash: digest,
    recordsOwnerDigest: digest,
    providerIdentityHash: digest,
  }),
  failedQuestion: z.strictObject({
    requestId: z.literal(PROVIDER_RECOVERY_REQUEST),
    conversationId: z.literal(PROVIDER_RECOVERY_CONVERSATION),
    openEventId: z.literal("b3a23a67-1811-481b-b6ac-8a984d073311"),
    reserveEventId: z.literal("03422799-aa6f-400a-b1a2-df0fb7a12b3d"),
    terminalEventId: z.literal("d91caf77-a3b9-4dc6-9e46-39eab042b039"),
    campaignRevocationEventId: z.literal(
      "e05e4706-4844-47c5-be4a-e6395a476003",
    ),
    browserRevocationEventId: z.literal("2540bc9f-4c6b-4189-bebb-757cffd415b9"),
    stage: z.literal("north_conversation_v1"),
    outcome: z.literal("failed"),
    httpStatus: z.literal(503),
    releasedHeldSlots: z.literal(1),
  }),
  limits: z.strictObject({
    executionLimit: z.literal(563),
    checkpointUsed: z.literal(335),
    checkpointHeld: z.literal(1),
    concurrency: z.literal(1),
    maxQuestionStages: z.literal(2),
    maxRetries: z.literal(0),
    scope: z.literal("customer-records-care-native-insights"),
  }),
  evidence: z.strictObject({
    checkpointRawHash: digest,
    providerStopRawHash: digest,
    originalActivationRawHash: digest,
    unavailableReadbackHash: digest,
    stoppedRelease: recoveryReleaseSchema,
  }),
  releaseGate: z.strictObject({
    release: recoveryReleaseSchema,
    ciReceiptHash: digest,
    ciRunId: z.number().int().positive(),
    attestationHash: digest,
    fallbackManifestHash: digest,
    fallbackEntrypointHash: digest,
  }),
});
export type ProviderFailureRecovery = z.infer<
  typeof providerFailureRecoverySchema
>;
export type ProviderRecoveryEnvironment = {
  checkpoint: { eventCount: number; eventHash: string; ownerStateHash: string };
  approvalHash: string;
  evidence: ProviderFailureRecovery["evidence"];
  runtime: {
    release: z.infer<typeof recoveryReleaseSchema>;
    ciReceiptHash: string;
  };
  releaseEvidence: z.infer<typeof providerRecoveryReleaseEvidenceSchema>;
  releaseEvidenceHash: string;
  providerIdentityHash: string;
  providerReady: boolean;
  artifacts: ProviderRecoveryArtifacts;
};
export type ProviderRecoveryEnvironmentReader = (
  proof: ProviderFailureRecovery,
) => Promise<ProviderRecoveryEnvironment>;
export const providerRecoverySubject = `customer:${PROVIDER_RECOVERY_REQUEST}:question:${PROVIDER_RECOVERY_CONVERSATION}`;

/** Core installation evidence, not a CLI assertion or a web-selectable path.
 * These host receipts attest executed checks; they are not signatures against root. */
export const readProviderRecoveryEnvironment: ProviderRecoveryEnvironmentReader =
  async (proof) => {
    // Metadata alone cannot authorize installation from edited/unbuilt source.
    const { assertBuild } = await import("../../../scripts/workspace.mjs");
    assertBuild(true);
    const base = "/tmp/opencode/north-guide-binding";
    const readOriginal = async (name: string, privateFile = false) => {
      const file = await open(
        join(base, name),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const st = await file.stat();
        if (
          !st.isFile() ||
          (privateFile && !!(st.mode & 0o077)) ||
          st.uid !== process.getuid?.() ||
          st.nlink !== 1 ||
          st.size > 131072
        )
          return providerRecoveryDenied();
        return await file.readFile();
      } finally {
        await file.close();
      }
    };
    const originals = await Promise.all(
      [
        "BOUNDED-PROVIDER-RECOVERY-APPROVAL.md",
        "provider-recovery-checkpoint.json",
        "provider-stop.json",
        "activation.json",
      ].map((name) => readOriginal(name)),
    );
    if (
      sha(originals[0]) !== PROVIDER_RECOVERY_APPROVAL_HASH ||
      sha(originals[1]) !==
        "501d8fb9a2f03393233d58604a05a1b51fb746d9acfc415fcd97df876e0ba6ae" ||
      sha(originals[2]) !==
        "228bd3da141672cc58c4ce7f6b007f8cdac6dc7ae2247e666b62ee3febd9f81a" ||
      sha(originals[3]) !==
        "7902704a862cffe7410ff6b3a1b7efbabd51fa5112b93b1fea2b38ffb794e350"
    )
      return providerRecoveryDenied();
    const artifactFiles = Object.fromEntries(
      await Promise.all(
        Object.entries(PROVIDER_RECOVERY_ARTIFACT_FILES).map(
          async ([key, name]) => {
            const raw = await readOriginal(name, true);
            return [
              key,
              { value: JSON.parse(raw.toString()) as unknown, hash: sha(raw) },
            ];
          },
        ),
      ),
    ) as Record<keyof typeof PROVIDER_RECOVERY_ARTIFACT_FILES, RawArtifact>;
    const fileHashes = Object.fromEntries(
      await Promise.all(
        PROVIDER_RECOVERY_INPUT_FILES.map(async (file) => [
          file,
          sha(await readFile(join(process.cwd(), file))),
        ]),
      ),
    );
    const stop = JSON.parse(originals[2].toString());
    const path = join(base, "provider-failure-recovery-release.json");
    const fd = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let raw: Buffer;
    try {
      const st = await fd.stat();
      if (
        !st.isFile() ||
        st.uid !== process.getuid?.() ||
        st.mode & 0o077 ||
        st.nlink !== 1 ||
        st.size > 131072
      )
        return providerRecoveryDenied();
      raw = await fd.readFile();
    } finally {
      await fd.close();
    }
    const releaseEvidence = providerRecoveryReleaseEvidenceSchema.parse(
      JSON.parse(raw.toString()),
    );
    const runtime = await recoveryRuntimeEvidence();
    // Only a same-source frozen release is accepted. Never select an old parser.
    const root = join(
      homedir(),
      ".local/state/palcare-releases",
      `release-${runtime.release.commit.slice(0, 7)}-north-provider-recovery-compatible`,
    );
    const manifestRaw = await readFile(root + "-manifest.json");
    const manifest = JSON.parse(manifestRaw.toString());
    const launcher = await readFile(root + "-launcher.mjs", "utf8");
    const inventory = async (dir = ""): Promise<Record<string, string>> => {
      const result: Record<string, string> = {};
      for (const name of (await readdir(join(root, dir))).sort()) {
        const relative = dir ? dir + "/" + name : name;
        if ([".next/cache", ".next/server/route-cache"].includes(relative))
          continue;
        const file = join(root, relative),
          st = await lstat(file);
        if (st.isSymbolicLink())
          result[relative] = "link:" + (await readlink(file));
        else if (st.isDirectory())
          Object.assign(result, await inventory(relative));
        else if (st.isFile()) result[relative] = sha(await readFile(file));
        else return providerRecoveryDenied();
      }
      return result;
    };
    const build = JSON.parse(
      await readFile(join(root, ".next/palcare-build.json"), "utf8"),
    );
    const ci = JSON.parse(
      await readFile(join(root, ".next/palcare-ci.json"), "utf8"),
    );
    if (
      manifest.commit !== runtime.release.commit ||
      manifest.sourceHash !== runtime.release.sourceHash ||
      !launcher.includes(`const expectedManifest = "${sha(manifestRaw)}";`) ||
      !isDeepStrictEqual(await inventory(), manifest.files) ||
      build.dirty ||
      !["commit", "sourceHash", "buildId"].every(
        (k) =>
          build[k] === runtime.release[k as keyof typeof runtime.release] &&
          ci[k] === build[k],
      ) ||
      (await readFile(join(root, ".next/BUILD_ID"), "utf8")).trim() !==
        runtime.release.buildId ||
      recoveryHash(ci) !== runtime.ciReceiptHash ||
      ci.runId !== proof.releaseGate.ciRunId ||
      sha(manifestRaw) !== proof.releaseGate.fallbackManifestHash ||
      sha(
        await readFile(
          join(process.cwd(), "scripts/north-recovery-fallback.ts"),
        ),
      ) !== proof.releaseGate.fallbackEntrypointHash
    )
      return providerRecoveryDenied();
    const registration = await new PilotFiles(
      join(homedir(), ".config/palcare-chatgpt-pilot"),
    ).registration();
    return {
      checkpoint: PROVIDER_RECOVERY_CHECKPOINT,
      approvalHash: sha(originals[0]),
      evidence: {
        checkpointRawHash: sha(originals[1]),
        providerStopRawHash: sha(originals[2]),
        originalActivationRawHash: sha(originals[3]),
        unavailableReadbackHash: recoveryHash(stop.GETOnlySavedUnavailable),
        stoppedRelease: recoveryReleaseSchema.parse({
          commit: stop.failedRequest.source.commit,
          sourceHash: stop.failedRequest.source.sourceHash,
          buildId: stop.failedRequest.source.buildId,
        }),
      },
      runtime,
      releaseEvidence,
      releaseEvidenceHash: sha(raw),
      providerIdentityHash: recoveryHash({
        clientId: registration?.clientId,
        subject: registration?.subject ?? null,
      }),
      providerReady:
        !!registration?.subject &&
        !!registration.tokens &&
        !registration.refreshPending &&
        // Access-token expiry is not an allowance/session renewal. Keep the
        // existing guarded refresh lifecycle; installation never refreshes it.
        ["resource.invoke", "chatgpt.tokens.use.direct"].every((s) =>
          registration.tokens!.scopes.includes(s),
        ),
      artifacts: {
        fileHashes,
        frozenRoot: root,
        security: {
          proof: artifactFiles.securityProof,
          results: artifactFiles.securityResults,
        },
        threeEngine: {
          proof: artifactFiles.threeEngineProof,
          results: artifactFiles.threeEngineResults,
        },
        deployment: artifactFiles.deployment,
        frozenHttps: artifactFiles.frozenHttps,
        primaryHttps: artifactFiles.primaryHttps,
      },
    };
  };

export function assertProviderRecoveryEnvironment(
  proof: ProviderFailureRecovery,
  env: ProviderRecoveryEnvironment,
  now: number,
) {
  const gate = proof.releaseGate,
    e = providerRecoveryReleaseEvidenceSchema.parse(env.releaseEvidence);
  if (
    !env.providerReady ||
    env.providerIdentityHash !== proof.identity.providerIdentityHash ||
    env.approvalHash !== proof.ownerApprovalHash ||
    env.checkpoint.eventCount !== proof.checkpoint.eventCount ||
    env.checkpoint.eventHash !== proof.checkpoint.eventHash ||
    env.checkpoint.ownerStateHash !== proof.checkpoint.ownerStateHash ||
    !isDeepStrictEqual(env.evidence, proof.evidence) ||
    env.releaseEvidenceHash !== gate.attestationHash ||
    recoveryHash(env.runtime.release) !== recoveryHash(gate.release) ||
    env.runtime.ciReceiptHash !== gate.ciReceiptHash ||
    e.ownerStateHash !== proof.checkpoint.ownerStateHash ||
    recoveryHash(e.release) !== recoveryHash(gate.release) ||
    recoveryHash(e.fallback.release) !== recoveryHash(gate.release) ||
    e.ciReceiptHash !== gate.ciReceiptHash ||
    e.ciRunId !== gate.ciRunId ||
    e.fallback.manifestHash !== gate.fallbackManifestHash ||
    e.fallback.managedEntrypointHash !== gate.fallbackEntrypointHash ||
    gate.release.commit === proof.evidence.stoppedRelease.commit ||
    gate.release.sourceHash === proof.evidence.stoppedRelease.sourceHash ||
    e.checkedAt > now ||
    now - e.checkedAt > 300000 ||
    proof.approvedAt > now ||
    now >= proof.originalBrowserExpiresAt
  )
    return providerRecoveryDenied();
  assertProviderRecoveryArtifacts(env.artifacts, e, env.runtime, now);
}

const recoveryKinds = [
  "approve-provider-failure-recovery",
  "resolve-provider-failed-question",
  "disable-provider-failure-recovery",
];
/** Authentication of the immutable checkpoint is independent of post-resolution
 * projection. No filtered ledger is ever used for current allowance. */
export function providerRecoveryContext(
  state: OwnerState,
  now: number,
  installing = false,
): CampaignRecoveryResolution | undefined {
  const p = state.providerFailureRecovery;
  const markers = state.events.filter((e) => recoveryKinds.includes(e.kind));
  if (!p && !markers.length) return undefined;
  if (!p) return providerRecoveryDenied();
  providerFailureRecoverySchema.parse(p);
  const c = p.checkpoint,
    f = p.failedQuestion;
  const prefix = state.events.slice(0, c.eventCount);
  const original = { ...state };
  delete original.providerFailureRecovery;
  const restored = {
    ...original,
    sessions: state.sessions.slice(0, c.sessionCount),
    events: prefix,
  };
  const old = restored.sessions.find(
    (s) => s.id === p.identity.revokedBrowserSessionId,
  );
  const budget = campaignBudget(prefix);
  const key = `customer:${f.requestId}:north_conversation_v1`;
  const check = (id: string, kind: string, subject: string) =>
    prefix.find((e) => e.id === id && e.kind === kind && e.subject === subject);
  const opened = check(f.openEventId, "question-open", providerRecoverySubject);
  const reserve = check(f.reserveEventId, "reserve", key);
  const terminal = check(f.terminalEventId, "failed", key);
  const revoked = prefix.find(
    (e) =>
      e.id === f.campaignRevocationEventId &&
      e.kind === "revoke-quota-campaign" &&
      e.allocationId === RECOVERY_EVALUATION,
  );
  const browserRevoked = check(
    f.browserRevocationEventId,
    "revoke-session",
    p.identity.revokedBrowserSessionId,
  );
  const phaseHash = recoveryHash(p);
  if (
    prefix.length !== c.eventCount ||
    recoveryHash(prefix) !== c.eventHash ||
    recoveryHash(restored) !== c.ownerStateHash ||
    recoveryHash(state.policy) !== c.policyHash ||
    recoveryHash(state.evaluation) !== c.evaluationHash ||
    recoveryHash(state.quotaCampaign) !== c.quotaHash ||
    recoveryHash(state.quotaCampaignExtension) !== c.extensionHash ||
    recoveryHash(state.northGuideCampaign) !== c.guideHash ||
    recoveryHash(state.northGuideRecordsBinding) !== c.recordsBindingHash ||
    !old?.revoked ||
    old.agentHash !== p.identity.agentHash ||
    state.northGuideRecordsBinding?.recordsOwnerDigest !==
      p.identity.recordsOwnerDigest ||
    state.quotaCampaign?.providerIdentityHash !==
      p.identity.providerIdentityHash ||
    state.quotaCampaign.agentHash !== p.identity.agentHash ||
    prefix.some((e) => e.at > p.approvedAt) ||
    state.events.some((e) => e.at > now) ||
    new Set(state.events.map((e) => e.id)).size !== state.events.length ||
    new Set(state.sessions.map((s) => s.id)).size !== state.sessions.length ||
    new Set(state.sessions.map((s) => s.tokenHash)).size !==
      state.sessions.length ||
    restored.sessions.some(
      (s) => s.allocationId === RECOVERY_EVALUATION && !s.revoked,
    ) ||
    !opened ||
    !reserve ||
    !terminal ||
    terminal.observation?.httpStatus !== 503 ||
    !revoked ||
    !browserRevoked ||
    reserve.at < opened.at ||
    terminal.at < reserve.at ||
    revoked.at < terminal.at ||
    browserRevoked.at < revoked.at ||
    [opened, reserve, terminal].some(
      (e) => e.allocationId !== RECOVERY_EVALUATION,
    ) ||
    budget.executionLimit !== 563 ||
    budget.used !== 335 ||
    budget.held !== 1 ||
    budget.activeQuestion?.requestId !== f.requestId ||
    budget.activeQuestion.conversationId !== f.conversationId ||
    budget.activeQuestion.reservedStages !== 1 ||
    budget.activeQuestion.completedStages !== 0 ||
    prefix.some((e) => ["provider-block", "revoke-policy"].includes(e.kind)) ||
    prefix.some(
      (e) =>
        e.kind === "revoke-quota-campaign" &&
        e.id !== f.campaignRevocationEventId,
    )
  )
    return providerRecoveryDenied();
  if (installing) {
    if (
      markers.length ||
      state.events.length !== c.eventCount ||
      state.sessions.length !== c.sessionCount
    )
      return providerRecoveryDenied();
  } else {
    const approval = state.events[c.eventCount],
      resolution = state.events[c.eventCount + 1];
    if (
      markers.filter((e) => e.kind === recoveryKinds[0]).length !== 1 ||
      markers.filter((e) => e.kind === recoveryKinds[1]).length !== 1 ||
      approval?.kind !== recoveryKinds[0] ||
      approval.subject !== phaseHash ||
      resolution?.kind !== recoveryKinds[1] ||
      resolution.subject !== providerRecoverySubject ||
      approval.at < p.approvedAt ||
      resolution.at < approval.at ||
      [approval, resolution].some(
        (e) =>
          e.allocationId !== RECOVERY_EVALUATION ||
          e.executionLimit !== undefined ||
          e.observation !== undefined,
      )
    )
      return providerRecoveryDenied();
  }
  return {
    approvalHash: phaseHash,
    checkpointEventCount: c.eventCount,
    questionSubject: providerRecoverySubject,
    reserveEventId: f.reserveEventId,
    terminalEventId: f.terminalEventId,
  };
}

export function providerRecoveryPhase(state: OwnerState, now: number) {
  const context = providerRecoveryContext(state, now);
  if (!context) return undefined;
  const proof = state.providerFailureRecovery!;
  const tail = state.events.slice(proof.checkpoint.eventCount + 2);
  const pairs = tail.filter(
    (e) => e.kind === "pair" && e.allocationId === RECOVERY_EVALUATION,
  );
  const sessions = state.sessions.slice(proof.checkpoint.sessionCount);
  if (
    pairs.length > 1 ||
    sessions.length !== pairs.length ||
    sessions.some(
      (s) =>
        s.id !== pairs[0]?.subject ||
        s.allocationId !== RECOVERY_EVALUATION ||
        s.agentHash !== proof.identity.agentHash ||
        s.expiresAt !== proof.originalBrowserExpiresAt,
    ) ||
    tail
      .filter((e) => e.kind === "disable-provider-failure-recovery")
      .some(
        (e) =>
          e.subject !== context.approvalHash ||
          e.allocationId !== RECOVERY_EVALUATION ||
          e.observation !== undefined ||
          e.executionLimit !== undefined,
      )
  )
    return providerRecoveryDenied();
  const entry = sessions[0];
  if (
    tail.filter((e) => e.kind === "disable-provider-failure-recovery").length >
    1
  )
    return providerRecoveryDenied();
  const disabled = tail.some(
    (e) =>
      [
        "disable-provider-failure-recovery",
        "provider-block",
        "revoke-policy",
        "revoke-quota-campaign",
      ].includes(e.kind) ||
      (e.allocationId === RECOVERY_EVALUATION &&
        ["failed", "unknown"].includes(e.kind)) ||
      (entry &&
        e.subject === entry.id &&
        ["logout", "revoke-session"].includes(e.kind)),
  );
  if (disabled || entry?.revoked)
    return { phase: "disabled" as const, context, entry };
  if (
    now >= proof.originalBrowserExpiresAt ||
    (entry &&
      (now < entry.createdAt ||
        now >= entry.createdAt + 30 * 86400000 ||
        now >= entry.lastSeen + 7 * 86400000 ||
        (entry.approvedAt === null && now >= entry.createdAt + 300000)))
  )
    return { phase: "expired" as const, context, entry };
  if (!entry) return { phase: "awaiting-browser" as const, context, entry };
  const approvals = tail.filter(
    (e) => e.kind === "approve" && e.subject === entry.id,
  );
  const finishes = tail.filter(
    (e) => e.kind === "finish-browser" && e.subject === entry.id,
  );
  if (
    pairs[0].at < entry.createdAt ||
    pairs[0].at >= entry.createdAt + 300000 ||
    entry.createdAt < state.events[proof.checkpoint.eventCount + 1].at ||
    (entry.approvedAt === null
      ? approvals.length !== 0 ||
        finishes.length !== 0 ||
        entry.finishedAt !== undefined
      : approvals.length !== 1 ||
        approvals[0].at < entry.approvedAt ||
        entry.approvedAt < entry.createdAt ||
        entry.approvedAt >= entry.createdAt + 300000 ||
        tail.indexOf(approvals[0]) <= tail.indexOf(pairs[0]) ||
        (entry.finishedAt === undefined
          ? finishes.length !== 0
          : finishes.length !== 1 ||
            finishes[0].at < entry.finishedAt ||
            entry.finishedAt < entry.approvedAt ||
            tail.indexOf(finishes[0]) <= tail.indexOf(approvals[0])))
  )
    return providerRecoveryDenied();
  return {
    phase:
      entry.approvedAt === null
        ? ("pending-browser" as const)
        : entry.finishedAt === undefined
          ? ("finish-needed" as const)
          : ("active" as const),
    context,
    entry,
  };
}
