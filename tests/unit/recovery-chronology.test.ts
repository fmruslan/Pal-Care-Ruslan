import { describe, expect, it } from "vitest";
import { validRecoveryChronology } from "../../src/lib/careos/evaluation-recovery";

// Timestamp-only projection of the preserved real failure. No cookie, owner
// digest, credential, purchase data or protected authorization is bundled.
const actual = {
  audit: [
    { action: "prepare", at: 1794021090332 },
    { action: "challenge", at: 1794021095093 },
    { action: "approve", at: 1794021096393 },
    { action: "activate", at: 1794021097017 },
  ],
  challenge: { createdAt: 1794021095092, expiresAt: 1794021395092 },
  approval: { at: 1794021096393 },
  activation: { at: 1794021097017 },
};
describe("recovery event and audit chronology", () => {
  it("rejects equal-time reordered audit actions and missing lifecycle fields", () => {
    const changed = structuredClone(actual);
    for (const event of changed.audit) event.at = 1000;
    changed.challenge = { createdAt: 1000, expiresAt: 2000 };
    changed.approval.at = changed.activation.at = 1000;
    [changed.audit[1].action, changed.audit[2].action] = [
      "approve",
      "challenge",
    ];
    expect(validRecoveryChronology(changed)).toBe(false);
    expect(
      validRecoveryChronology({
        audit: actual.audit,
        challenge: actual.challenge,
      }),
    ).toBe(false);
  });
  it("accepts the actual one-millisecond difference without rewriting history", () => {
    const before = JSON.stringify(actual);
    expect(actual.audit[1].at - actual.challenge.createdAt).toBe(1);
    expect(validRecoveryChronology(actual)).toBe(true);
    expect(JSON.stringify(actual)).toBe(before);
  });
  it.each([0, 1, 7, 1000])(
    "accepts separately sampled advancing clock reads (%i ms), not equality assumptions",
    (step) => {
      let clock = 100000;
      const now = () => (clock += step);
      const prepare = now(),
        createdAt = now(),
        challengeAudit = now();
      const approval = now(),
        approvalAudit = now();
      const activation = now(),
        activationAudit = now();
      expect(
        validRecoveryChronology({
          audit: [
            { action: "prepare", at: prepare },
            { action: "challenge", at: challengeAudit },
            { action: "approve", at: approvalAudit },
            { action: "activate", at: activationAudit },
          ],
          challenge: { createdAt, expiresAt: clock + 300000 },
          approval: { at: approval },
          activation: { at: activation },
        }),
      ).toBe(true);
    },
  );
  it.each([
    (d: typeof actual) => {
      d.audit[1].at = d.challenge.createdAt - 1;
    },
    (d: typeof actual) => {
      d.approval.at = d.audit[1].at - 1;
    },
    (d: typeof actual) => {
      d.audit[2].at = d.approval.at - 1;
    },
    (d: typeof actual) => {
      d.activation.at = d.audit[2].at - 1;
    },
    (d: typeof actual) => {
      d.audit[3].at = d.activation.at - 1;
    },
    (d: typeof actual) => {
      d.challenge.expiresAt = d.audit[3].at;
    },
    (d: typeof actual) => {
      d.audit[1].action = "prepare";
    },
    (d: typeof actual) => {
      d.challenge.createdAt = Number.NaN;
    },
    (d: typeof actual) => {
      d.approval.at = Number.POSITIVE_INFINITY;
    },
    (d: typeof actual) => {
      d.activation.at = Number.MAX_SAFE_INTEGER + 1;
    },
  ])(
    "rejects invalid event order or manipulated timestamp metadata (%#)",
    (mutate) => {
      const changed = structuredClone(actual);
      mutate(changed);
      const before = JSON.stringify(changed);
      expect(validRecoveryChronology(changed)).toBe(false);
      expect(JSON.stringify(changed)).toBe(before);
    },
  );
  it("preserves a later terminal stop and rejects a stop recorded before activation", () => {
    const stopped = {
      ...structuredClone(actual),
      disabled: { at: actual.activation.at + 10000 },
      audit: [
        ...actual.audit,
        { action: "disable", at: actual.activation.at + 10001 },
      ],
    };
    expect(validRecoveryChronology(stopped)).toBe(true);
    stopped.disabled.at = actual.activation.at - 1;
    expect(validRecoveryChronology(stopped)).toBe(false);
  });
});
