/** Synthetic isolated host files only. No import-time work, DB, browser, live
 * profile, actual credentials, network or copies of production state. */
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  StandingOwner,
  OWNER_ORIGIN,
  parseOwnerState,
  standingPolicySchema,
  type OwnerProof,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import {
  recoveryHash,
  RECOVERY_EVALUATION,
  RECOVERY_SESSION,
  RECOVERY_DEADLINE,
  recoveryReleaseSchema,
} from "../../src/lib/careos/evaluation-recovery";
import {
  quotaCampaignSchema,
  quotaCampaignExtensionSchema,
  northGuideCampaignSchema,
  northGuideRecordsBindingSchema,
  campaignSessionsAtCheckpoint,
} from "../../src/lib/careos/quota-campaign";
import {
  providerFailureRecoverySchema,
  providerRecoveryReleaseEvidenceSchema,
  providerRecoveryContext,
  PROVIDER_RECOVERY_APPROVAL_HASH,
  PROVIDER_RECOVERY_BROWSER,
  PROVIDER_RECOVERY_REQUEST,
  PROVIDER_RECOVERY_CONVERSATION,
  PROVIDER_RECOVERY_EXPIRY,
  providerRecoverySubject,
  PROVIDER_RECOVERY_INPUT_FILES,
  PROVIDER_RECOVERY_SECURITY_CASES,
  PROVIDER_RECOVERY_ACCESS_CASES,
  type ProviderRecoveryEnvironment,
} from "../../src/lib/careos/provider-failure-recovery";
import { campaignBudget } from "../../src/lib/careos/campaign-execution";
import type { z } from "zod";
import type { CareTurn } from "../../src/lib/careos/contracts";

export async function createProviderFailureRecoveryFixture(options: {
  directory: string;
  providerDirectory?: string;
  now?: () => number;
  release?: z.infer<typeof recoveryReleaseSchema>;
  ciReceiptHash?: string;
  ciReceipt?: Record<string, unknown>;
  agent?: string;
  recordsOwnerDigest?: string;
}) {
  if (
    ![
      options.directory,
      options.providerDirectory ?? options.directory + "/provider",
    ].every((p) => resolve(p).startsWith("/tmp/opencode/"))
  )
    throw Error("isolated_provider_recovery_fixture_required");
  let clock = 1794390000000;
  const now = options.now ?? (() => clock);
  const files = new PilotFiles(options.directory);
  const provider = new PilotFiles(
    options.providerDirectory ?? options.directory + "/provider",
  );
  await files.prepare();
  await provider.prepare();
  const agent = options.agent ?? "synthetic-provider-recovery-browser";
  const secretHash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const recordsOwnerDigest =
    options.recordsOwnerDigest ??
    recoveryHash("synthetic existing records namespace");
  const oldToken = "a".repeat(64);
  const registration = {
    format: "palcare-chatgpt-pilot-v1" as const,
    clientId: "synthetic-provider-recovery-client",
    subject: "synthetic-existing-subject",
    tokens: {
      accessToken: "north150-synthetic-access",
      refreshToken: "synthetic-unused-refresh",
      idToken: "synthetic-id",
      nonce: "synthetic-nonce",
      scopes: ["resource.invoke", "chatgpt.tokens.use.direct"],
      savedAt: now(),
      expiresAt: Math.max(now(), Date.now()) + 86400000,
    },
  };
  await provider.write("registration.json", registration);
  const providerIdentityHash = recoveryHash({
    clientId: registration.clientId,
    subject: registration.subject,
  });
  const journal = { syntheticProviderRecoveryHistory: true };
  await provider.write("session.json", journal);
  // The quota chain pins these bytes without reviving the legacy recovery path.
  await files.write("evaluation-recovery.json", {
    phase: "disabled",
    syntheticOnly: true,
  });
  const oldRecoveryRawHash = (await files.snapshot("evaluation-recovery.json"))!
    .hash;
  let at = now() - 1200000;
  const state: OwnerState = {
    version: 1,
    policy: standingPolicySchema.parse({
      id: randomUUID(),
      approvedAt: at - 1000,
      provider: "chatgpt-subscription",
      model: "gpt-6.1-sol",
      reasoning: "medium",
      origin: OWNER_ORIGIN,
      scopes: ["customer", "customer-studio"],
      requestLimit: 300,
      concurrency: 4,
      requestsPerMinute: 30,
      maxRetries: 1,
      creditsDisabledConfirmed: true,
      providerPermissionConfirmed: true,
      historicalJournalHash: recoveryHash(journal),
    }),
    sessions: [],
    events: [],
  };
  for (let n = 0; n < 31; n++) {
    const id =
      n === 0
        ? RECOVERY_SESSION
        : n === 30
          ? PROVIDER_RECOVERY_BROWSER
          : randomUUID();
    state.sessions.push({
      id,
      tokenHash: secretHash(n === 30 ? oldToken : `synthetic-revoked-${n}`),
      agentHash: secretHash(agent),
      createdAt: at - 10000,
      lastSeen: at - 1000,
      approvedAt: at - 9000,
      finishedAt: at - 8000,
      ...(n === 0 ? { expiresAt: RECOVERY_DEADLINE } : {}),
      revoked: true,
      ...(n === 30 ? { allocationId: RECOVERY_EVALUATION } : {}),
    });
  }
  const add = (
    kind: OwnerState["events"][number]["kind"],
    subject: string,
    allocationId?: string,
    extra: Partial<OwnerState["events"][number]> = {},
  ) => {
    const e = {
      ...(extra.executionLimit ? { executionLimit: extra.executionLimit } : {}),
      id: extra.id ?? randomUUID(),
      at: ++at,
      kind,
      subject,
      ...(allocationId ? { allocationId } : {}),
      ...(extra.observation ? { observation: extra.observation } : {}),
    };
    state.events.push(e);
    return e;
  };
  for (let n = 0; n < 283; n++) {
    const key = `customer:${randomUUID()}:standing-synthetic`;
    add("reserve", key);
    add(n === 0 ? "unknown" : "completed", key, undefined, {
      observation: { httpStatus: 200 },
    });
  }
  for (let n = 0; n < 63; n++) {
    const key = `customer:${randomUUID()}:north_conversation_v1`;
    add("reserve", key, RECOVERY_EVALUATION);
    add("completed", key, RECOVERY_EVALUATION, {
      observation: { httpStatus: 200 },
    });
  }
  while (state.events.length < 785) add("touch", RECOVERY_SESSION);
  state.evaluation = {
    id: RECOVERY_EVALUATION,
    policyId: state.policy!.id,
    policyHash: recoveryHash(state.policy),
    approvedAt: state.policy!.approvedAt,
    expiresAt: RECOVERY_DEADLINE,
    sessionId: RECOVERY_SESSION,
    requestLimit: 300,
    purpose: "north-language-300",
    fastApplicationQuotaApproved: true,
    baselineEventCount: 566,
    baselineEventHash: recoveryHash(state.events.slice(0, 566)),
  };
  // Normalize before hashing, matching the strict production decoder's key order.
  Object.assign(state, parseOwnerState(state));
  state.quotaCampaign = quotaCampaignSchema.parse({
    version: 1,
    campaignId: RECOVERY_EVALUATION,
    ownerApprovalHash: recoveryHash("synthetic163"),
    approvedAt: at + 1,
    calendarExpiresAt: null,
    baselineUsed: 63,
    executionLimit: 163,
    maxAdditional: 100,
    scope: "customer-records-care-native-insights",
    concurrency: 1,
    maxRetries: 0,
    policyHash: recoveryHash(state.policy),
    historicalEvaluationHash: recoveryHash(state.evaluation),
    historicalRecoveryRawHash: oldRecoveryRawHash,
    historicalEventCount: 785,
    historicalEventHash: recoveryHash(state.events),
    originalSessionHash: recoveryHash(state.sessions[0]),
    recordsOwnerDigest: recoveryHash("original namespace"),
    agentHash: secretHash(agent),
    providerIdentityHash,
  });
  add(
    "approve-quota-campaign",
    recoveryHash(state.quotaCampaign),
    RECOVERY_EVALUATION,
    { executionLimit: 163 },
  );
  const appendSuccessful = (target: number) => {
    let used = state.events.filter(
      (e) => e.kind === "reserve" && e.allocationId === RECOVERY_EVALUATION,
    ).length;
    while (used < target) {
      const request = randomUUID(),
        question = `customer:${request}:question:${randomUUID()}`;
      add("question-open", question, RECOVERY_EVALUATION);
      for (const name of target - used >= 2
        ? ["north_conversation_v1", "careos_care"]
        : ["north_conversation_v1"]) {
        const key = `customer:${request}:${name}`;
        add("reserve", key, RECOVERY_EVALUATION);
        add("completed", key, RECOVERY_EVALUATION, {
          observation: { httpStatus: 200 },
        });
        used++;
      }
      add("question-close", question, RECOVERY_EVALUATION);
    }
  };
  appendSuccessful(163);
  state.quotaCampaignExtension = quotaCampaignExtensionSchema.parse({
    version: 1,
    campaignId: RECOVERY_EVALUATION,
    approvedAt: at + 1,
    ownerApprovalHash: recoveryHash("synthetic263"),
    calendarExpiresAt: null,
    baselineUsed: 163,
    executionLimit: 263,
    maxAdditional: 100,
    previousAuthorizationHash: recoveryHash(state.quotaCampaign),
    checkpointEventCount: state.events.length,
    checkpointEventHash: recoveryHash(state.events),
  });
  add(
    "approve-quota-campaign-extension",
    recoveryHash(state.quotaCampaignExtension),
    RECOVERY_EVALUATION,
    { executionLimit: 263 },
  );
  appendSuccessful(263);
  state.northGuideCampaign = northGuideCampaignSchema.parse({
    version: 1,
    campaignId: RECOVERY_EVALUATION,
    approvedAt: at + 1,
    ownerApprovalHash: recoveryHash("synthetic563"),
    calendarExpiresAt: null,
    baselineUsed: 263,
    executionLimit: 563,
    maxAdditional: 300,
    purpose: "north-current-interface-guidance-300",
    previousAuthorizationHash: recoveryHash(state.quotaCampaignExtension),
    checkpointEventCount: state.events.length,
    checkpointEventHash: recoveryHash(state.events),
  });
  add(
    "approve-north-guide-campaign",
    recoveryHash(state.northGuideCampaign),
    RECOVERY_EVALUATION,
    { executionLimit: 563 },
  );
  state.northGuideRecordsBinding = northGuideRecordsBindingSchema.parse({
    version: 1,
    campaignId: RECOVERY_EVALUATION,
    ownerApprovalHash: recoveryHash("synthetic-binding"),
    approvedAt: at + 1,
    purpose: "north-guide-fresh-empty-records-session",
    guideAuthorizationHash: recoveryHash(state.northGuideCampaign),
    previousRecordsOwnerDigest: state.quotaCampaign.recordsOwnerDigest,
    recordsOwnerDigest,
    agentHash: secretHash(agent),
    providerIdentityHash,
    emptyConversationId: randomUUID(),
    checkpointEventCount: state.events.length,
    checkpointEventHash: recoveryHash(state.events),
    checkpointCampaignSessionsHash: recoveryHash(
      campaignSessionsAtCheckpoint(state, state.events),
    ),
  });
  add(
    "approve-north-guide-records-binding",
    recoveryHash(state.northGuideRecordsBinding),
    RECOVERY_EVALUATION,
  );
  add("pair", PROVIDER_RECOVERY_BROWSER, RECOVERY_EVALUATION);
  add("approve", PROVIDER_RECOVERY_BROWSER);
  add("finish-browser", PROVIDER_RECOVERY_BROWSER);
  appendSuccessful(334);
  while (state.events.length < 1889) add("touch", PROVIDER_RECOVERY_BROWSER);
  add("question-open", providerRecoverySubject, RECOVERY_EVALUATION, {
    id: "b3a23a67-1811-481b-b6ac-8a984d073311",
  });
  const failedKey = `customer:${PROVIDER_RECOVERY_REQUEST}:north_conversation_v1`;
  add("reserve", failedKey, RECOVERY_EVALUATION, {
    id: "03422799-aa6f-400a-b1a2-df0fb7a12b3d",
  });
  add("failed", failedKey, RECOVERY_EVALUATION, {
    id: "d91caf77-a3b9-4dc6-9e46-39eab042b039",
    observation: { httpStatus: 503 },
  });
  add(
    "revoke-quota-campaign",
    recoveryHash(state.quotaCampaign),
    RECOVERY_EVALUATION,
    { id: "e05e4706-4844-47c5-be4a-e6395a476003" },
  );
  add("revoke-session", PROVIDER_RECOVERY_BROWSER, undefined, {
    id: "2540bc9f-4c6b-4189-bebb-757cffd415b9",
  });
  const baseline = parseOwnerState(state);
  await files.write("owner-state.json", baseline);
  const release = options.release ?? {
    commit: "b".repeat(40),
    sourceHash: "c".repeat(64),
    buildId: "synthetic-provider-recovery",
  };
  const ciReceipt = options.ciReceipt ?? {
    schema: 1,
    ...release,
    runId: 123,
    lane: "full",
    exactChecks: true,
    workflow: ".github/workflows/repository-checks.yml",
    checkedAt: new Date(now()).toISOString(),
  };
  const ciReceiptHash = recoveryHash(ciReceipt);
  if (options.ciReceiptHash && options.ciReceiptHash !== ciReceiptHash)
    throw Error(
      "provide the actual synthetic ciReceipt object matching ciReceiptHash",
    );
  if (
    typeof ciReceipt.runId !== "number" ||
    !Number.isSafeInteger(ciReceipt.runId)
  )
    throw Error("synthetic_ci_run_required");
  const ciRunId = ciReceipt.runId;
  const artifact = (value: unknown) => {
    const decoded: unknown = JSON.parse(JSON.stringify(value));
    return { value: decoded, hash: recoveryHash(decoded) };
  };
  // Deliberate dependency-injected fixtures, NEVER actual test/TLS evidence.
  const fileHashes = Object.fromEntries(
    PROVIDER_RECOVERY_INPUT_FILES.map((file) => [
      file,
      recoveryHash("synthetic fixture input:" + file),
    ]),
  );
  const securityResults = artifact({
    success: true,
    numTotalTests: PROVIDER_RECOVERY_SECURITY_CASES.length,
    numPassedTests: PROVIDER_RECOVERY_SECURITY_CASES.length,
    numFailedTests: 0,
    numPendingTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numPassedTestSuites: 1,
    numTotalTestSuites: 1,
    testResults: [
      {
        name: "/tmp/opencode/synthetic/tests/unit/provider-failure-recovery.test.ts",
        status: "passed",
        assertionResults: PROVIDER_RECOVERY_SECURITY_CASES.map((title) => ({
          title,
          status: "passed",
          failureMessages: [],
        })),
      },
    ],
  });
  const threeEngineResults = artifact({
    errors: [],
    stats: {
      expected: PROVIDER_RECOVERY_ACCESS_CASES.length * 3,
      unexpected: 0,
      skipped: 0,
      flaky: 0,
    },
    suites: [
      {
        specs: PROVIDER_RECOVERY_ACCESS_CASES.map((title) => ({
          title,
          file: "provider-failure-recovery.spec.ts",
          ok: true,
          tests: ["chromium", "firefox", "webkit"].map((projectName) => ({
            projectName,
            status: "expected",
            results: [{ status: "passed", retry: 0, errors: [] }],
          })),
        })),
      },
    ],
  });
  const localProof = (
    kind: "offline-security-units" | "isolated-injected-provider",
    resultsHash: string,
  ) =>
    artifact({
      version: 1,
      kind,
      checkedAt: now(),
      sourceHash: release.sourceHash,
      fileHashes,
      resultsHash,
      providerCalls: 0,
      externalRequests: [],
      skipped: 0,
      retries: 0,
    });
  const smoke = (phase: "primary" | "candidate-frozen") =>
    artifact({
      phase,
      checkedAt: new Date(now()).toISOString(),
      origin: OWNER_ORIGIN,
      results: [
        "desktop-light",
        "desktop-dark",
        "mobile-light",
        "mobile-dark",
      ].map((profile) => ({
        profile,
        buttonsAndDrafts: true,
        barAbsent: true,
        historyAndDocuments: true,
        nativeGridAndChart: true,
        writes: [],
        external: [],
        errors: [],
      })),
      providerCalls: 0,
      scope:
        "GET-only actual HTTPS smoke; not recovery installation, admission, provider or real-device acceptance",
    });
  const frozenHttps = smoke("candidate-frozen"),
    primaryHttps = smoke("primary");
  const frozenRoot = options.directory + "/synthetic-frozen";
  const deployment = artifact({
    checkedAt: new Date(now()).toISOString(),
    release: { ...release, dirty: "" },
    ci: ciReceipt,
    https: primaryHttps.value,
    candidateFrozen: {
      root: frozenRoot,
      release,
      startupVerified: true,
      inventoryVerified: true,
      https: frozenHttps.value,
    },
    preservation: {
      recordsPermissionsCredentialsAccountingBindingAndOriginalAuditsUnchanged: true,
      originalStoppedJournalsUnchanged: true,
    },
    pausedCampaign: {
      executionLimit: 563,
      used: 335,
      remaining: 228,
      held: 1,
      activeQuestion: {
        requestId: PROVIDER_RECOVERY_REQUEST,
        conversationId: PROVIDER_RECOVERY_CONVERSATION,
        reservedStages: 1,
        completedStages: 0,
      },
    },
    providerCalls: 0,
    credentialRefreshes: 0,
    financialOperations: 0,
    recoveryInstalled: false,
    inferenceAdmitted: false,
    installedStateCompatibilityRequiresSeparateIsolatedEvidence: true,
  });
  const artifacts = {
    fileHashes,
    frozenRoot,
    security: {
      proof: localProof("offline-security-units", securityResults.hash),
      results: securityResults,
    },
    threeEngine: {
      proof: localProof("isolated-injected-provider", threeEngineResults.hash),
      results: threeEngineResults,
    },
    deployment,
    frozenHttps,
    primaryHttps,
  };
  const releaseEvidence = providerRecoveryReleaseEvidenceSchema.parse({
    version: 1,
    checkedAt: now(),
    ownerStateHash: recoveryHash(baseline),
    release,
    ciReceiptHash,
    ciRunId,
    securityTestsHash: artifacts.security.proof.hash,
    threeEngineTestsHash: artifacts.threeEngine.proof.hash,
    privateHttpsHash: artifacts.deployment.hash,
    fallback: {
      release,
      manifestHash: recoveryHash("synthetic-manifest"),
      managedEntrypointHash: recoveryHash("synthetic-entrypoint"),
      recoveryAware: true,
      startupInventoryHttpsPassed: true,
      disableBeforeSwitchPassed: true,
    },
  });
  const approval = providerFailureRecoverySchema.parse({
    version: 1,
    sequence: 1,
    purpose: "north-guide-once-only-known-prestream-failure-continuation",
    campaignId: RECOVERY_EVALUATION,
    ownerApprovalHash: PROVIDER_RECOVERY_APPROVAL_HASH,
    approvedAt: now(),
    originalBrowserExpiresAt: PROVIDER_RECOVERY_EXPIRY,
    checkpoint: {
      ownerStateHash: recoveryHash(baseline),
      eventCount: 1894,
      eventHash: recoveryHash(baseline.events),
      sessionCount: 31,
      policyHash: recoveryHash(baseline.policy),
      evaluationHash: recoveryHash(baseline.evaluation),
      quotaHash: recoveryHash(baseline.quotaCampaign),
      extensionHash: recoveryHash(baseline.quotaCampaignExtension),
      guideHash: recoveryHash(baseline.northGuideCampaign),
      recordsBindingHash: recoveryHash(baseline.northGuideRecordsBinding),
    },
    identity: {
      revokedBrowserSessionId: PROVIDER_RECOVERY_BROWSER,
      agentHash: secretHash(agent),
      recordsOwnerDigest,
      providerIdentityHash,
    },
    failedQuestion: {
      requestId: PROVIDER_RECOVERY_REQUEST,
      conversationId: PROVIDER_RECOVERY_CONVERSATION,
      openEventId: "b3a23a67-1811-481b-b6ac-8a984d073311",
      reserveEventId: "03422799-aa6f-400a-b1a2-df0fb7a12b3d",
      terminalEventId: "d91caf77-a3b9-4dc6-9e46-39eab042b039",
      campaignRevocationEventId: "e05e4706-4844-47c5-be4a-e6395a476003",
      browserRevocationEventId: "2540bc9f-4c6b-4189-bebb-757cffd415b9",
      stage: "north_conversation_v1",
      outcome: "failed",
      httpStatus: 503,
      releasedHeldSlots: 1,
    },
    limits: {
      executionLimit: 563,
      checkpointUsed: 335,
      checkpointHeld: 1,
      concurrency: 1,
      maxQuestionStages: 2,
      maxRetries: 0,
      scope: "customer-records-care-native-insights",
    },
    evidence: {
      checkpointRawHash: recoveryHash("synthetic-checkpoint-bytes"),
      providerStopRawHash: recoveryHash("synthetic-stop-bytes"),
      originalActivationRawHash: recoveryHash("synthetic-activation-bytes"),
      unavailableReadbackHash: recoveryHash("synthetic-unavailable-turn"),
      stoppedRelease: {
        commit: "d".repeat(40),
        sourceHash: "e".repeat(64),
        buildId: "synthetic-stopped",
      },
    },
    releaseGate: {
      release,
      ciReceiptHash,
      ciRunId,
      attestationHash: recoveryHash(releaseEvidence),
      fallbackManifestHash: releaseEvidence.fallback.manifestHash,
      fallbackEntrypointHash: releaseEvidence.fallback.managedEntrypointHash,
    },
  });
  const environment: ProviderRecoveryEnvironment = {
    checkpoint: approval.checkpoint,
    approvalHash: approval.ownerApprovalHash,
    evidence: approval.evidence,
    runtime: { release, ciReceiptHash },
    releaseEvidence,
    releaseEvidenceHash: approval.releaseGate.attestationHash,
    providerIdentityHash,
    providerReady: true,
    artifacts,
  };
  await files.write("provider-failure-recovery-approval.json", approval);
  await writeFile(
    resolve(options.directory, "synthetic-environment.json"),
    JSON.stringify(environment),
    { mode: 0o600 },
  );
  const restart = (selectedFiles = files) =>
    new StandingOwner(selectedFiles, now, undefined, async () =>
      structuredClone(environment),
    );
  const owner = restart();
  const read = async () =>
    parseOwnerState(await files.read("owner-state.json"));
  const oldProof: OwnerProof = {
    token: oldToken,
    agent,
    recordsOwnerDigest,
    origin: OWNER_ORIGIN,
    channel: "records",
  };
  const failedTurn: CareTurn = {
    requestId: PROVIDER_RECOVERY_REQUEST,
    message:
      "Does a still-pending payment count as a verified completed purchase?",
    answer: {
      mode: "deterministic",
      text: "AI query interpretation could not be confirmed. Your records are unchanged; no automatic replay or provider fallback will occur. Supported saved-record queries remain available.",
      steps: [],
      actions: [],
      context: null,
      outcome: "unavailable",
      sources: [],
      revision: 0,
      questionScope: "library",
    },
  };
  return {
    owner,
    files,
    provider,
    approval,
    environment,
    baseline,
    oldProof,
    agent,
    recordsOwnerDigest,
    read,
    restart,
    advance: (ms: number) => {
      if (options.now) throw Error("advance caller's injected clock");
      clock += ms;
    },
    now,
    original: baseline,
    revokedToken: oldToken,
    pinnedExpiresAt: PROVIDER_RECOVERY_EXPIRY,
    failedConversationId: PROVIDER_RECOVERY_CONVERSATION,
    failedTurn,
    install: () => owner.installProviderFailureRecovery(approval),
    budget: async () => {
      const s = await read();
      return campaignBudget(s.events, providerRecoveryContext(s, now()));
    },
    async authorize() {
      const pair = await owner.pair(agent, oldToken, recordsOwnerDigest);
      const proof = { ...oldProof, token: pair.token };
      await owner.approve(pair.id);
      await owner.finishBrowser(proof);
      return { pair, proof };
    },
    async fill(target: number) {
      const s = await read();
      const context = providerRecoveryContext(s, now());
      let used = campaignBudget(s.events, context).used;
      const emit = (
        kind: OwnerState["events"][number]["kind"],
        subject: string,
      ) =>
        s.events.push({
          id: randomUUID(),
          at: now(),
          kind,
          subject,
          allocationId: RECOVERY_EVALUATION,
          ...(kind === "completed" ? { observation: { httpStatus: 200 } } : {}),
        });
      while (used < target) {
        const id = randomUUID(),
          question = `customer:${id}:question:${randomUUID()}`;
        emit("question-open", question);
        for (const name of target - used >= 2
          ? ["north_conversation_v1", "careos_care"]
          : ["north_conversation_v1"]) {
          emit("reserve", `customer:${id}:${name}`);
          emit("completed", `customer:${id}:${name}`);
          used++;
        }
        emit("question-close", question);
      }
      await files.write("owner-state.json", parseOwnerState(s));
      if (!options.now) clock += 60001;
    },
  };
}
export type ProviderFailureRecoveryFixture = Awaited<
  ReturnType<typeof createProviderFailureRecoveryFixture>
>;
