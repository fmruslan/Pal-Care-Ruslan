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
