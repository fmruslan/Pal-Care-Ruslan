import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  StandingOwner,
  evaluationRecoveryCheckpoint,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import {
  EvaluationRecovery,
  RECOVERY_FILE,
  RECOVERY_SESSION,
  RECOVERY_EVALUATION,
  RECOVERY_DEADLINE,
  RECOVERY_TRANSITION_FROM,
  RECOVERY_OWNER_APPROVAL,
  POST_STOP_RESTRICTION_EVENT,
  evaluationRecoverySchema,
  recoveryHash,
  recoveryHistoryHash,
  createPostStopProposal,
  postStopApprovalSchema,
  type RecoveryTransitionPreparation,
} from "../../src/lib/careos/evaluation-recovery";
import type { CareTurn } from "../../src/lib/careos/contracts";
import { preparePostStopContinuation } from "../../scripts/transition-north-recovery";
import {
  quotaCampaignSchema,
  subscriptionIdentityHash,
} from "../../src/lib/careos/quota-campaign";

export const north150Hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export const north150Token = "e".repeat(64);
export const north150OldToken = "d".repeat(64);
export function north150Clock(root: string) {
  if (!root.startsWith("/tmp/opencode/north150-"))
    throw Error("isolated clock root required");
  const wallStarted = Date.now(),
    started = performance.now();
  // Deliberately BEFORE the original immutable deadline, AFTER the exact stop.
  // Clock progresses with real elapsed time; no fixed-clock equality illusion.
  const epoch = 1794034945391 + 3600000;
  const offsetFile = join(root, "clock-offset");
  writeFileSync(offsetFile, "0", { mode: 0o600 });
  const offset = () => Number(readFileSync(offsetFile, "utf8"));
  return {
    epoch,
    wallStarted,
    offsetFile,
    now: () => epoch + offset() + Math.floor(performance.now() - started),
    advance(milliseconds: number) {
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
        throw Error("clock cannot rewind");
      writeFileSync(offsetFile + ".next", String(offset() + milliseconds), {
        mode: 0o600,
      });
      renameSync(offsetFile + ".next", offsetFile);
    },
  };
}

/** New owner policy fixture; never modifies the historical disabled document. */
export async function north150QuotaApproval(
  f: Awaited<ReturnType<typeof north150Fixture>>,
) {
  return quotaCampaignSchema.parse({
    version: 1,
    campaignId: RECOVERY_EVALUATION,
    ownerApprovalHash: north150Hash(
      "explicit synthetic quota-only policy approval",
    ),
    approvedAt: f.clock.now(),
    calendarExpiresAt: null,
    baselineUsed: 63,
    executionLimit: 150,
    maxAdditional: 87,
    scope: "customer-records-care-native-insights",
    concurrency: 1,
    maxRetries: 0,
    policyHash: recoveryHash(f.state.policy),
    historicalEvaluationHash: recoveryHash(f.state.evaluation),
    historicalRecoveryRawHash: (await f.files.snapshot(RECOVERY_FILE))!.hash,
    historicalEventCount: 785,
    historicalEventHash: recoveryHash(f.state.events),
    originalSessionHash: recoveryHash(f.state.sessions[0]),
    recordsOwnerDigest: f.recordsOwner,
    agentHash: f.state.sessions[0].agentHash,
    providerIdentityHash: subscriptionIdentityHash(
      await f.provider.registration(),
    ),
  });
}
type Clock = ReturnType<typeof north150Clock>;
type Release = RecoveryTransitionPreparation["toGate"]["release"];

/** Only the supplied restricted CAREOS login in an explicit dedicated test DB.
 * Namespaced fixture rows, not production rows or customer documents. */
export async function seedNorth150History(
  pool: Pool,
  recordsOwner: string,
  expiresAt: string,
) {
  const history = [];
  const ids: string[] = [];
  for (let n = 0; n < 15; n++) {
    const id = randomUUID();
    ids.push(id);
    await pool.query(
      "insert into care_conversations(id,owner,expires_at) values($1,$2,greatest($3::timestamptz,now()+interval '1 day'))",
      [id, recordsOwner, expiresAt],
    );
    const turns: CareTurn[] = [];
    for (let t = 0; t < (n === 14 ? 2 : 4); t++) {
      const input = {
        requestId: randomUUID(),
        twinId: null,
        revision: 0,
        message: `Synthetic retained history ${n}/${t}`,
      };
      const turn: CareTurn = {
        requestId: input.requestId,
        message: input.message,
        answer: {
          outcome: "unsupported",
          mode: "deterministic",
          questionScope: "library",
          context: null,
          revision: 0,
          text: "Synthetic retained answer; not provider evidence.",
          steps: [],
          sources: [],
          actions: [],
        },
      };
      turns.push(turn);
      await pool.query(
        "insert into care_requests(id,conversation_id,fingerprint,result,created_at) values($1,$2,$3,$4,now()+$5*interval '1 millisecond')",
        [
          input.requestId,
          id,
          north150Hash(JSON.stringify(input)),
          JSON.stringify(turn),
          t,
        ],
      );
    }
    history.push({
      conversationId: id,
      turnCount: turns.length,
      turnsHash: recoveryHistoryHash(turns),
    });
  }
  return { history, ids };
}

/** All hashes/approvals below are SYNTHETIC TEST evidence, never release claims.
 * The REAL core transition writes its one record only inside this fixture HOME. */
export async function north150Fixture(options: {
  home: string;
  agent: string;
  recordsToken: string;
  clock: Clock;
  release: Release;
  ciReceiptHash: string;
  pool: Pool;
  fallbackManifestHash: string;
}) {
  if (!options.home.startsWith("/tmp/opencode/north150-"))
    throw Error("isolated HOME required");
  const { clock, release } = options;
  const files = new PilotFiles(
    join(options.home, ".config/palcare-standing-owner"),
  );
  const provider = new PilotFiles(
    join(options.home, ".config/palcare-chatgpt-pilot"),
  );
  await files.prepare();
  await provider.prepare();
  const recordsOwner = north150Hash(`records-v1:${options.recordsToken}`);
  const seeded = await seedNorth150History(
    options.pool,
    recordsOwner,
    new Date(clock.now() + 86400000).toISOString(),
  );
  const journal = { fixture: "north150-synthetic-only", attempts: [] };
  await provider.write("session.json", journal);
  await provider.write("registration.json", {
    format: "palcare-chatgpt-pilot-v1",
    clientId: "north150-synthetic-client",
    subject: "north150-synthetic-owner",
    tokens: {
      accessToken: "north150-synthetic-access",
      refreshToken: "north150-never-refresh",
      idToken: "north150-synthetic-id",
      nonce: "north150-synthetic-nonce",
      scopes: ["openid", "resource.invoke", "chatgpt.tokens.use.direct"],
      savedAt: clock.now(),
      expiresAt: clock.now() + 3600000,
    },
  });
  const challengeAt = 1794021095092;
  const state: OwnerState = {
    version: 1,
    policy: {
      id: randomUUID(),
      approvedAt: RECOVERY_DEADLINE - 90000000,
      provider: "chatgpt-subscription",
      model: "gpt-6.1-sol",
      reasoning: "medium",
      origin: "https://greatbison.tail9e8802.ts.net:8444",
      scopes: ["customer", "customer-studio"],
      requestLimit: 300,
      concurrency: 4,
      requestsPerMinute: 30,
      maxRetries: 1,
      creditsDisabledConfirmed: true,
      providerPermissionConfirmed: true,
      historicalJournalHash: recoveryHash(journal),
    },
    sessions: [
      {
        id: RECOVERY_SESSION,
        tokenHash: north150Hash(north150OldToken),
        agentHash: north150Hash(options.agent),
        createdAt: RECOVERY_DEADLINE - 86400000,
        lastSeen: challengeAt - 1000,
        approvedAt: challengeAt - 2000,
        finishedAt: challengeAt - 1500,
        expiresAt: RECOVERY_DEADLINE,
        revoked: true,
      },
    ],
    events: [],
  };
  for (let n = 0; n < 337; n++) {
    const subject = `customer:${randomUUID()}:north_conversation_v1`;
    const allocation = n >= 274 ? { allocationId: RECOVERY_EVALUATION } : {};
    const at = challengeAt - 3600000 + n * 2000;
    state.events.push(
      { id: randomUUID(), at, kind: "reserve", subject, ...allocation },
      {
        id: randomUUID(),
        at: at + 1,
        kind: n === 0 ? "unknown" : "completed",
        subject,
        ...allocation,
        observation: { httpStatus: 200 },
      },
    );
  }
  for (let n = 0; n < 109; n++)
    state.events.push({
      id: randomUUID(),
      at: challengeAt - 10000 + n,
      kind: "touch",
      subject: RECOVERY_SESSION,
    });
  state.events.push({
    id: randomUUID(),
    at: challengeAt - 1000,
    kind: "revoke-session",
    subject: RECOVERY_SESSION,
  });
  state.evaluation = {
    id: RECOVERY_EVALUATION,
    policyId: state.policy!.id,
    policyHash: recoveryHash(state.policy),
    approvedAt: challengeAt - 2000,
    expiresAt: RECOVERY_DEADLINE,
    sessionId: RECOVERY_SESSION,
    requestLimit: 300,
    purpose: "north-language-300",
    fastApplicationQuotaApproved: true,
    baselineEventCount: 548,
    baselineEventHash: recoveryHash(state.events.slice(0, 548)),
  };
  // Normalize the property order through the existing pure checkpoint helper;
  // all later preservation hashes use the same actual state-schema ordering.
  const normalized = {
    version: state.version,
    policy: state.policy,
    evaluation: state.evaluation,
    sessions: state.sessions,
    events: state.events,
  };
  const checkpoint = evaluationRecoveryCheckpoint(normalized);
  const oldGate = {
    release: { ...RECOVERY_TRANSITION_FROM },
    ciReceiptHash: north150Hash("synthetic original CI"),
    securityReviewHash: north150Hash("synthetic original security"),
    preservationHash: north150Hash("synthetic original preservation"),
    preservationOwnerStateHash: checkpoint.ownerStateHash,
    providerEligibilityHash: north150Hash("synthetic original eligibility"),
    providerEligibilityCheckedAt: challengeAt - 1000,
    fallback: {
      release: { ...RECOVERY_TRANSITION_FROM },
      evidenceHash: north150Hash("synthetic original fallback"),
      ciReceiptHash: north150Hash("synthetic original fallback CI"),
      ciRunId: 1,
      recoveryAware: true as const,
      startupHttpsPassed: true as const,
      oldCredentialDenied: true as const,
      injectedRecoveryLogoutPassed: true as const,
    },
  };
  const binding = {
    recordsOwnerDigest: recordsOwner,
    history: seeded.history,
    checkpoint,
    gates: oldGate,
    evaluationId: RECOVERY_EVALUATION,
    sessionId: RECOVERY_SESSION,
    expiresAt: RECOVERY_DEADLINE,
    baselineUsed: 63,
    maxAdditional: 237,
    requestLimit: 300,
    ownerApprovalHash: RECOVERY_OWNER_APPROVAL,
    policyHash: checkpoint.policyHash,
    evaluationHash: checkpoint.evaluationHash,
    originalSessionHash: checkpoint.originalSessionHash,
    agentHash: normalized.sessions[0].agentHash,
    checkpointEventCount: 784,
    checkpointEventHash: checkpoint.eventHash,
  };
  const challengeId = randomUUID();
  const doc = evaluationRecoverySchema.parse({
    version: 1,
    phase: "disabled",
    binding,
    challenge: {
      id: challengeId,
      tokenHash: north150Hash("c".repeat(64)),
      createdAt: challengeAt,
      expiresAt: challengeAt + 300000,
    },
    approval: {
      at: challengeAt + 100,
      challengeId,
      bindingHash: recoveryHash(binding),
    },
    activation: {
      at: challengeAt + 200,
      tokenHash: north150Hash(north150Token),
      sequence: 1,
    },
    disabled: { at: 1794034945390, reason: "synthetic-terminal-stop" },
    audit: [
      { sequence: 1, at: challengeAt - 500, action: "prepare" },
      { sequence: 2, at: challengeAt + 1, action: "challenge" },
      { sequence: 3, at: challengeAt + 100, action: "approve" },
      { sequence: 4, at: challengeAt + 200, action: "activate" },
      { sequence: 5, at: 1794034945390, action: "disable" },
    ],
  });
  // Recompute against the parsed binding, never mutate the saved chronology.
  doc.approval!.bindingHash = recoveryHash(doc.binding);
  normalized.events.push({
    id: POST_STOP_RESTRICTION_EVENT,
    at: 1794034945391,
    kind: "revoke-session",
    subject: RECOVERY_SESSION,
  });
  await files.write("owner-state.json", normalized);
  await files.write(RECOVERY_FILE, doc);
  const terminal = evaluationRecoveryCheckpoint(normalized);
  const runtime = { release, ciReceiptHash: options.ciReceiptHash };
  const owner = new StandingOwner(
    files,
    clock.now,
    new EvaluationRecovery(files, clock.now, async () => runtime),
  );
  async function approveSyntheticContinuation() {
    const now = clock.now();
    const fallback = {
      ...oldGate.fallback,
      startupHttpsPassed: false as const,
      release,
      ciReceiptHash: options.ciReceiptHash,
      evidenceHash: options.fallbackManifestHash,
      disableBeforeSwitch: true as const,
      managedEntrypointHash: north150Hash("synthetic managed fallback"),
    };
    const bounds = {
      historicalLimit: 300 as const,
      executionLimit: 150 as const,
      baselineUsed: 63 as const,
      maxAdditional: 87 as const,
      questionMaxStages: 2 as const,
      maxRetries: 0 as const,
      scope: "customer-records-including-personal-insights-native-sdk" as const,
    };
    const proposed = createPostStopProposal({
      version: 1,
      kind: "explicit-post-stop-150",
      createdAt: now - 3000,
      expiresAt: RECOVERY_DEADLINE,
      originalDocumentHash: (await files.snapshot(RECOVERY_FILE))!.hash,
      originalBindingHash: recoveryHash(doc.binding),
      activationTokenHash: doc.activation!.tokenHash,
      terminalCheckpoint: terminal,
      terminalRestrictionEventId: POST_STOP_RESTRICTION_EVENT,
      fromRelease: oldGate.release,
      fromCiReceiptHash: oldGate.ciReceiptHash,
      release,
      ciReceiptHash: options.ciReceiptHash,
      securityReviewHash: north150Hash("synthetic new security"),
      preservationHash: north150Hash("synthetic new preservation"),
      offlineQaHash: north150Hash("synthetic offline QA"),
      fallbackReadinessHash: north150Hash("synthetic new fallback readiness"),
      fallback,
      pendingLiveChecks: [
        "private-production-https-switch",
        "same-source-fallback-https-smoke",
        "fresh-disabled-cookie-owned-records-get-and-provider-eligibility",
      ],
      ...bounds,
    });
    const approval = postStopApprovalSchema.parse({
      version: 1,
      decision: "approve",
      kind: "explicit-post-stop-150",
      proposalHash: proposed.proposalHash,
      approvedAt: now - 2000,
      sameCredentialOnly: true,
      noWindowExtension: true,
    });
    const receipt = {
      version: 1,
      release,
      checkedAt: now - 1000,
      originalDocumentHash: proposed.proposal.originalDocumentHash,
      originalBindingHash: recoveryHash(doc.binding),
      ownerStateHash: terminal.ownerStateHash,
    };
    const input = preparePostStopContinuation({
      proposal: proposed.proposal,
      approval,
      history: {
        ...receipt,
        ciReceiptHash: options.ciReceiptHash,
        recordsOwnerDigest: recordsOwner,
        historyHash: recoveryHistoryHash(doc.binding.history),
        history: doc.binding.history,
        existingRecoveryCredentialVerified: true,
        serverOwnedRecordsProofVerified: true,
        allOriginalPrefixesUnchanged: true,
        ownerStatus: {
          browserAccess: "cookie-rejected",
          recoveryActive: false,
          originalBrowserRevoked: true,
          credentialRecognizedButDisabled: true,
          originalCredentialDenied: true,
          used: 63,
          historicalLimit: 300,
          effectiveLimit: 150,
          remaining: 87,
          unknown: 1,
          standingUsed: 274,
          standingRemaining: 26,
        },
      },
      provider: {
        ...receipt,
        eligible: true,
        provider: "chatgpt-subscription",
        model: "gpt-6.1-sol",
        reasoning: "medium",
        creditsDisabledConfirmed: true,
        paidFallbackDisabled: true,
      },
      // These flags are explicit SYNTHETIC receipts to exercise the core. They
      // are not evidence that private production HTTPS/provider checks ran.
      live: {
        ...receipt,
        productionHttpsPassed: true,
        sameSourceFallbackHttpsPassed: true,
        originalGrantUnchanged: true,
      },
    });
    return owner.transitionEvaluationRecovery(input);
  }
  return {
    files,
    provider,
    owner,
    doc,
    state: normalized,
    recordsOwner,
    seeded,
    clock,
    approveSyntheticContinuation,
  };
}
