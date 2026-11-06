import { describe, expect, it } from "vitest";
import {
  languageAttemptCount,
  languageOriginalPrefixIntact,
  languageStopDisposition,
  rememberLanguageGroup,
  restoreLanguageGroup,
  type LanguageGroupHints,
} from "../../scripts/north-language-lifecycle";

describe("North language campaign lifecycle without live authority", () => {
  const allocationId = "evaluation";
  const reserve = {
    kind: "reserve",
    subject: "customer:original-request:stage",
    allocationId,
  };
  const completed = { ...reserve, kind: "completed" };
  const known = {
    reason: "campaign_execution_stopped_review_private_evidence",
    allocationId,
    events: [reserve, completed],
    pendingDispatch: false,
    unsafeBoundary: false,
    expired: false,
  };
  it("pauses a locator/observation failure after known completion without revoking or replaying it", () => {
    expect(languageStopDisposition(known)).toBe("pause");
    expect(languageAttemptCount(known.events, allocationId)).toBe(1);
  });
  it("does not mutate an already paused or finished run merely because the command was invoked again", () => {
    for (const reason of [
      "campaign_paused_review_required_no_replay",
      "campaign_already_closed_no_replay",
    ])
      expect(languageStopDisposition({ ...known, reason })).toBe("unchanged");
  });
  it("still revokes on unknowns, unsettled calls, provider denial, pending dispatch, expiry, unsafe browser actions or journal failures", () => {
    for (const change of [
      { events: [reserve] },
      { events: [reserve, { ...reserve, kind: "unknown" }] },
      {
        events: [
          ...known.events,
          { kind: "provider-block", subject: "denied" },
        ],
      },
      { pendingDispatch: true },
      { expired: true },
      { unsafeBoundary: true },
      { reason: "actual_browser_authority_denied" },
      { reason: "original_policy_changed" },
      { reason: "campaign_journal_write_failed" },
    ])
      expect(languageStopDisposition({ ...known, ...change })).toBe("revoke");
  });
  it("keeps original historical unknowns and reservations outside the separate evaluation counter", () => {
    const events = [
      { kind: "reserve", subject: "old" },
      { kind: "unknown", subject: "old" },
      reserve,
      completed,
    ];
    expect(languageStopDisposition({ ...known, events })).toBe("pause");
    expect(languageAttemptCount(events)).toBe(0);
    expect(languageAttemptCount(events, allocationId)).toBe(1);
  });
  it("rejects truncated, reordered or rewritten original journals, while permitting appended campaign events", () => {
    const original = [
      { kind: "reserve", subject: "old" },
      { kind: "unknown", subject: "old" },
    ];
    expect(languageOriginalPrefixIntact([...original, reserve], original)).toBe(
      true,
    );
    expect(languageOriginalPrefixIntact(original.slice(0, 1), original)).toBe(
      false,
    );
    expect(
      languageOriginalPrefixIntact([...original].reverse(), original),
    ).toBe(false);
    expect(
      languageOriginalPrefixIntact([original[0], completed], original),
    ).toBe(false);
  });
  it("restores each original owned group's hints after a separate retest prefix without inventing or replacing history", () => {
    const original = { "palcare-records-conversation": "original-owned-uuid" };
    const state: LanguageGroupHints = { activeGroup: "NC-01", storage: {} };
    rememberLanguageGroup(state, original);
    state.activeGroup = "NC-01-R1";
    rememberLanguageGroup(state, {
      "palcare-records-conversation": "retest-owned-uuid",
    });
    expect(restoreLanguageGroup(state, "NC-01")).toEqual(original);
    expect(restoreLanguageGroup(state, "NC-01-R1")).not.toEqual(original);
    expect(restoreLanguageGroup(state, "unseen-group")).toBeUndefined();
    restoreLanguageGroup(state, "NC-01")!["palcare-records-conversation"] =
      "changed-copy";
    expect(restoreLanguageGroup(state, "NC-01")).toEqual(original);
  });
});
