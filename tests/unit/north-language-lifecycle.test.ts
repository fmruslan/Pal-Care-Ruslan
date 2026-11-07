import { describe, expect, it, vi } from "vitest";
import {
  languageAttemptCount,
  languageOriginalPrefixIntact,
  languageKnownUnsentContinuation,
  languageLocalPreflightIsKnownUnsent,
  withLanguageRecoveryCleanup,
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

describe("exact local rejection binding and fail-closed recovery cleanup", () => {
  const source = {
    commit: "ca53d1d0ff8bf0aa03b16b4386150a654518d48f",
    sourceHash:
      "d162f9caaaeff26648446d3418127434f19e654c80b77f528eb33aa1e6a0ca7d",
    buildId: "HpBZ3Jjn83Ppm5lKox0QF",
  };
  const failed = {
    caseId: "NC-12-9-R1",
    httpStatus: 503,
    providerAttempts: 0,
    events: [],
    source,
    applicationRequest: { requestId: "fc156121-ed51-4def-945e-6c0f72bf42d6" },
  };
  const diagnosis = {
    offlineOnly: true,
    limit: 20000,
    model: "gpt-6.1-sol",
    reasoning: "medium",
    rows: [
      {
        caseId: failed.caseId,
        source,
        httpStatus: 503,
        actualProviderAttempts: 0,
        bodyBytes: 21232,
        overLimitBytes: 1232,
        bodySha256:
          "cc4418038e831115e0653d8395e859c55157713022caf69143222f1b136b420f",
        historyTurns: 8,
        latestRecordCount: 11,
      },
    ],
    reproduction: {
      error: "pilot_request_too_large",
      counters: {
        globalFetch: 0,
        transport: 0,
        beforeDispatch: 0,
        sdkConstruction: 0,
        observation: 0,
      },
    },
  };
  it("requires the exact failed request, source, case measurement and zero dispatch callbacks", () => {
    expect(
      languageLocalPreflightIsKnownUnsent({
        failed,
        diagnosis,
        ownerEvents: [],
      }),
    ).toBe(true);
    for (const change of [
      { applicationRequest: { requestId: "a-different-request" } },
      { caseId: "NC-12-8-R1" },
      { source: { ...source, commit: "a".repeat(40) } },
      { providerAttempts: 1 },
    ])
      expect(
        languageLocalPreflightIsKnownUnsent({
          failed: { ...failed, ...change },
          diagnosis,
          ownerEvents: [],
        }),
      ).toBe(false);
    for (const row of [
      { ...diagnosis.rows[0], caseId: "another-case" },
      { ...diagnosis.rows[0], bodyBytes: 20001 },
      { ...diagnosis.rows[0], source: { ...source, buildId: "stale" } },
    ])
      expect(
        languageLocalPreflightIsKnownUnsent({
          failed,
          diagnosis: { ...diagnosis, rows: [row] },
          ownerEvents: [],
        }),
      ).toBe(false);
    expect(
      languageLocalPreflightIsKnownUnsent({
        failed,
        diagnosis: {
          ...diagnosis,
          rows: [...diagnosis.rows, ...diagnosis.rows],
        },
        ownerEvents: [],
      }),
    ).toBe(false);
    expect(
      languageLocalPreflightIsKnownUnsent({
        failed,
        diagnosis: { text: "21232 pilot_request_too_large" },
        ownerEvents: [],
      }),
    ).toBe(false);
  });
  it("rejects any reservation/outcome for the rejected UUID, including unknown or other allocation", () => {
    for (const kind of ["reserve", "completed", "failed", "unknown"])
      expect(
        languageLocalPreflightIsKnownUnsent({
          failed,
          diagnosis,
          ownerEvents: [
            {
              kind,
              subject: `customer:${failed.applicationRequest.requestId}:north_conversation_v1`,
              allocationId: "other-allocation",
            },
          ],
        }),
      ).toBe(false);
    expect(
      languageLocalPreflightIsKnownUnsent({
        failed,
        diagnosis: {
          ...diagnosis,
          reproduction: {
            ...diagnosis.reproduction,
            counters: { ...diagnosis.reproduction.counters, beforeDispatch: 1 },
          },
        },
        ownerEvents: [],
      }),
    ).toBe(false);
  });
  it("disables when browser/lock cleanup fails AFTER a successful activation/progress update", async () => {
    const disable = vi.fn(async () => {}),
      cleanup = vi.fn(async () => {
        throw Error("close-or-unlock-failed");
      });
    await expect(
      withLanguageRecoveryCleanup({
        work: async () => "issued-and-queued",
        cleanup,
        disable,
      }),
    ).rejects.toThrow("close-or-unlock-failed");
    expect(disable).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it("disables before cleaning up a failed protocol, never reissues or reports success", async () => {
    const calls: string[] = [];
    await expect(
      withLanguageRecoveryCleanup({
        work: async () => {
          calls.push("work");
          throw Error("lost-finish-response");
        },
        cleanup: async () => {
          calls.push("cleanup");
        },
        disable: async () => {
          calls.push("disable");
        },
      }),
    ).rejects.toThrow("lost-finish-response");
    expect(calls).toEqual(["work", "disable", "cleanup"]);
  });
  it("propagates failed terminal disable and still attempts cleanup, not another activation/fallback", async () => {
    const cleanup = vi.fn(async () => {});
    await expect(
      withLanguageRecoveryCleanup({
        work: async () => {
          throw Error("protocol-failed");
        },
        cleanup,
        disable: async () => {
          throw Error("disable-failed");
        },
      }),
    ).rejects.toThrow("disable-failed");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe("known local preflight continuation without authority or completed replay", () => {
  const original = {
    id: "NC-12-9",
    group: "NC-12",
    input: "Which have no recorded price?",
    goal: { price: "missing" },
  };
  const pending = [
    {
      id: "NC-12-10-R1",
      group: "NC-12-R1",
      input: "Explain that more simply",
      goal: { price: "missing" },
    },
  ];
  const failed = {
    caseId: "NC-12-9-R1",
    group: "NC-12-R1",
    input: original.input,
    providerAttempts: 0,
    events: [],
    httpStatus: 503,
    applicationRequest: {
      requestId: "rejected-request-must-stay-rejected",
      followupRequestId: "accepted-eighth-request",
    },
  };
  const acceptedAnchor = {
    caseId: "NC-12-8-R1",
    group: "NC-12-R1",
    applicationRequest: { requestId: "accepted-eighth-request" },
    automatedPass: true,
  };
  const options = {
    original,
    pending,
    failed,
    acceptedAnchor,
    knownLocalPreflight: true,
  };
  it("queues only the genuinely untested ninth/tenth questions against accepted8, preserving their exact language", () => {
    const before = JSON.stringify(options);
    const result = languageKnownUnsentContinuation(options);
    expect(result.queue.map((item) => item.id)).toEqual([
      "NC-12-9-R2",
      "NC-12-10-R1",
    ]);
    expect(result.queue.map((item) => item.input)).toEqual([
      original.input,
      pending[0].input,
    ]);
    expect(result.anchorRequestId).toBe("accepted-eighth-request");
    expect(result.rejectedRequestIdMustNotBeReplayed).toBe(
      failed.applicationRequest.requestId,
    );
    expect(result.newRequestIdRequired).toBe(true);
    expect(result.completedPrefixReplayPermitted).toBe(false);
    expect(result.queue[0].goal).toEqual(original.goal);
    expect(JSON.stringify(options)).toBe(before);
  });
  it("rejects a counted or uncertain request instead of replaying it", () => {
    for (const change of [
      { providerAttempts: 1 },
      { events: [{ kind: "reserve", subject: "unknown-dispatch" }] },
      { events: [{ kind: "unknown", subject: "unknown-dispatch" }] },
      { httpStatus: 200 },
    ])
      expect(() =>
        languageKnownUnsentContinuation({
          ...options,
          failed: { ...failed, ...change },
        }),
      ).toThrow("exact_known_unsent");
    expect(() =>
      languageKnownUnsentContinuation({
        ...options,
        knownLocalPreflight: false,
      }),
    ).toThrow("exact_known_unsent");
  });
  it("rejects different language, wrong owned anchor, or a failed anchor", () => {
    for (const change of [
      { original: { ...original, input: "a changed question" } },
      { original: { ...original, group: "another-conversation" } },
      { acceptedAnchor: { ...acceptedAnchor, automatedPass: false } },
      {
        acceptedAnchor: {
          ...acceptedAnchor,
          applicationRequest: { requestId: "different-anchor" },
        },
      },
      { acceptedAnchor: { ...acceptedAnchor, group: "another-conversation" } },
    ])
      expect(() =>
        languageKnownUnsentContinuation({ ...options, ...change }),
      ).toThrow("exact_known_unsent");
  });
  it("never replaces the queue with a completed prefix or loses the genuinely unstarted tenth turn", () => {
    for (const queue of [
      [],
      [...pending, original],
      [{ ...pending[0], id: "NC-12-1-R1" }],
    ])
      expect(() =>
        languageKnownUnsentContinuation({ ...options, pending: queue }),
      ).toThrow("exact_known_unsent");
  });
});
