/** Campaign engineering state only. Never grants authority, changes a provider
 * reservation, supplies trusted conversation history or permits replay. */
export type LanguageLedgerEvent = {
  kind: string;
  subject: string;
  allocationId?: string;
};

export function languageAttemptCount(
  events: LanguageLedgerEvent[],
  allocationId?: string,
) {
  return allocationId
    ? events.filter(
        (e) => e.kind === "reserve" && e.allocationId === allocationId,
      ).length
    : 0;
}

export function languageOriginalPrefixIntact(
  current: LanguageLedgerEvent[],
  original: LanguageLedgerEvent[],
) {
  return (
    current.length >= original.length &&
    original.every(
      (event, index) =>
        JSON.stringify(current[index]) === JSON.stringify(event),
    )
  );
}

export function languageStopDisposition(input: {
  reason: string;
  allocationId: string;
  events: LanguageLedgerEvent[];
  pendingDispatch: boolean;
  unsafeBoundary: boolean;
  expired: boolean;
}): "unchanged" | "pause" | "revoke" {
  // Merely inspecting an already-paused/finished run must not change its
  // browser, original failure, authority or accounting.
  if (
    [
      "campaign_paused_review_required_no_replay",
      "campaign_already_closed_no_replay",
    ].includes(input.reason)
  )
    return "unchanged";
  const allocationEvents = input.events.filter(
    (e) => e.allocationId === input.allocationId,
  );
  const uncertain =
    allocationEvents.some((e) => e.kind === "unknown") ||
    allocationEvents.some(
      (e) =>
        e.kind === "reserve" &&
        !allocationEvents.some(
          (t) =>
            t.subject === e.subject &&
            ["completed", "failed", "unknown"].includes(t.kind),
        ),
    );
  const safetyStop = new Set([
    "provider_or_policy_blocked",
    "campaign_authority_changed",
    "original_event_prefix_changed",
    "original_policy_changed",
    "actual_browser_authority_denied",
    "new_unknown_unsettled_or_provider_block_no_replay",
    "genuine_completion_not_established",
    "evaluation_finish_failed",
    "independent_database_snapshot_required",
    "provider_connection_not_ready_no_new_access_or_inference",
    "campaign_journal_write_failed",
    "unreconciled_application_dispatch_no_replay",
  ]);
  if (
    input.pendingDispatch ||
    input.unsafeBoundary ||
    input.expired ||
    uncertain ||
    safetyStop.has(input.reason) ||
    input.events.some((e) => e.kind === "provider-block")
  )
    return "revoke";
  // A fully observed, settled response followed by a rendering/locator failure
  // is a reviewable engineering pause, not a reason to replace the sole browser.
  return "pause";
}

export type LanguageGroupHints = {
  activeGroup: string | null;
  storage: Record<string, string>;
  groupStorage?: Record<string, Record<string, string>>;
};
export function rememberLanguageGroup(
  state: LanguageGroupHints,
  storage: Record<string, string>,
) {
  state.storage = { ...storage };
  if (state.activeGroup) {
    state.groupStorage ??= {};
    state.groupStorage[state.activeGroup] = { ...storage };
  }
}
export function restoreLanguageGroup(state: LanguageGroupHints, group: string) {
  const saved =
    state.groupStorage?.[group] ??
    (state.activeGroup === group ? state.storage : undefined);
  return saved ? { ...saved } : undefined;
}

/** Engineering queue only, never recovery/identity/dispatch authority. Resume
 * the known local rejection with a NEW request, not its eight completed turns.
 * Actual recovery, source gates, owned GET and visible History read-back must
 * be established separately before applying this plan. */
export function languageKnownUnsentContinuation<
  T extends { id: string; group: string; input: string },
>(options: {
  failed: {
    caseId: string;
    group: string;
    input: string;
    providerAttempts: number;
    events: LanguageLedgerEvent[];
    httpStatus: number;
    applicationRequest: { requestId: string; followupRequestId?: string };
  };
  acceptedAnchor: {
    caseId: string;
    group: string;
    applicationRequest: { requestId: string };
    automatedPass: boolean;
  };
  original: T;
  pending: T[];
  knownLocalPreflight: boolean;
}) {
  const { failed, acceptedAnchor, original, pending } = options;
  if (
    !options.knownLocalPreflight ||
    failed.caseId !== "NC-12-9-R1" ||
    failed.group !== "NC-12-R1" ||
    failed.providerAttempts !== 0 ||
    failed.events.length !== 0 ||
    failed.httpStatus !== 503 ||
    original.id !== "NC-12-9" ||
    original.group !== "NC-12" ||
    original.input !== failed.input ||
    acceptedAnchor.caseId !== "NC-12-8-R1" ||
    acceptedAnchor.group !== failed.group ||
    !acceptedAnchor.automatedPass ||
    failed.applicationRequest.requestId ===
      acceptedAnchor.applicationRequest.requestId ||
    failed.applicationRequest.followupRequestId !==
      acceptedAnchor.applicationRequest.requestId ||
    pending.length !== 1 ||
    pending[0].id !== "NC-12-10-R1" ||
    pending[0].group !== failed.group
  )
    throw Error("exact_known_unsent_next_case_required_no_completed_replay");
  return {
    anchorRequestId: acceptedAnchor.applicationRequest.requestId,
    rejectedRequestIdMustNotBeReplayed: failed.applicationRequest.requestId,
    newRequestIdRequired: true as const,
    completedPrefixReplayPermitted: false as const,
    queue: [
      { ...original, id: "NC-12-9-R2", group: failed.group },
      ...pending.map((item) => ({ ...item })),
    ],
  };
}

/** Case-specific offline evidence, not identity/dispatch permission. Do not infer
 * known-unsent from HTTP503 or a string somewhere in an unrelated report. */
export function languageLocalPreflightIsKnownUnsent(options: {
  failed: {
    caseId: string;
    httpStatus: number;
    providerAttempts: number;
    events: LanguageLedgerEvent[];
    applicationRequest: { requestId: string };
    source: { commit: string; sourceHash: string; buildId: string };
  };
  diagnosis: unknown;
  ownerEvents: LanguageLedgerEvent[];
}) {
  const { failed, ownerEvents } = options;
  const raw = options.diagnosis as {
    offlineOnly?: unknown;
    limit?: unknown;
    model?: unknown;
    reasoning?: unknown;
    rows?: {
      caseId?: unknown;
      source?: unknown;
      httpStatus?: unknown;
      actualProviderAttempts?: unknown;
      bodyBytes?: unknown;
      overLimitBytes?: unknown;
      bodySha256?: unknown;
      historyTurns?: unknown;
      latestRecordCount?: unknown;
    }[];
    reproduction?: { error?: unknown; counters?: Record<string, unknown> };
  } | null;
  const matches = Array.isArray(raw?.rows)
    ? raw.rows.filter((r) => r.caseId === failed.caseId)
    : [];
  const row = matches[0],
    counters = raw?.reproduction?.counters;
  const source = failed.source;
  const sameSource =
    row?.source &&
    typeof row.source === "object" &&
    ["commit", "sourceHash", "buildId"].every(
      (k) =>
        (row.source as Record<string, unknown>)[k] ===
        source[k as keyof typeof source],
    );
  return (
    failed.caseId === "NC-12-9-R1" &&
    failed.applicationRequest.requestId ===
      "fc156121-ed51-4def-945e-6c0f72bf42d6" &&
    failed.httpStatus === 503 &&
    failed.providerAttempts === 0 &&
    failed.events.length === 0 &&
    source.commit === "ca53d1d0ff8bf0aa03b16b4386150a654518d48f" &&
    source.sourceHash ===
      "d162f9caaaeff26648446d3418127434f19e654c80b77f528eb33aa1e6a0ca7d" &&
    source.buildId === "HpBZ3Jjn83Ppm5lKox0QF" &&
    raw?.offlineOnly === true &&
    raw.limit === 20000 &&
    raw.model === "gpt-6.1-sol" &&
    raw.reasoning === "medium" &&
    matches.length === 1 &&
    !!sameSource &&
    row.httpStatus === 503 &&
    row.actualProviderAttempts === 0 &&
    row.bodyBytes === 21232 &&
    row.overLimitBytes === 1232 &&
    row.historyTurns === 8 &&
    row.latestRecordCount === 11 &&
    row.bodySha256 ===
      "cc4418038e831115e0653d8395e859c55157713022caf69143222f1b136b420f" &&
    raw.reproduction?.error === "pilot_request_too_large" &&
    !!counters &&
    [
      "globalFetch",
      "transport",
      "beforeDispatch",
      "sdkConstruction",
      "observation",
    ].every((k) => counters[k] === 0) &&
    !ownerEvents.some(
      (e) =>
        ["reserve", "completed", "failed", "unknown"].includes(e.kind) &&
        e.subject.split(":")[1] === failed.applicationRequest.requestId,
    )
  );
}

/** Covers proof AND browser/lock cleanup. A failed cleanup after successful
 * issuance must disable recovery too, never leave a supposedly failed grant
 * active or mint a replacement credential. Errors never trigger reactivation. */
export async function withLanguageRecoveryCleanup<T>(ops: {
  work: () => Promise<T>;
  cleanup: () => Promise<void>;
  disable: () => Promise<void>;
}): Promise<T> {
  let cleanupAttempted = false;
  try {
    const result = await ops.work();
    cleanupAttempted = true;
    await ops.cleanup();
    return result;
  } catch (error) {
    try {
      await ops.disable();
    } finally {
      if (!cleanupAttempted) await ops.cleanup();
    }
    throw error;
  }
}
