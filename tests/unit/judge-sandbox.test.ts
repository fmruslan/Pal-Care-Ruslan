import { describe, expect, it } from "vitest";
import {
  judgeSandboxSchema,
  sanitizedSandbox,
} from "../../scripts/judge-sandbox";
import { syntheticJudgeSource } from "../helpers/judge-sandbox-fixture";
describe("historical archive sanitization (synthetic input only)", () => {
  it("removes original sessions, operation keys, payee, origins and provider references", () => {
    const s = syntheticJudgeSource();
    const original = JSON.stringify(s);
    const archive = sanitizedSandbox(s.checkout, s.twin, s.documents, s.events);
    const text = JSON.stringify(archive);
    for (const secret of [
      s.checkout.sessionHash,
      s.checkout.createKey,
      s.checkout.captureKey,
      s.checkout.requestId,
      s.checkout.expectedPayeeId,
      s.checkout.returnOrigin,
      s.checkout.providerOrderId!,
      s.checkout.providerCaptureId!,
    ])
      expect(text).not.toContain(secret);
    expect(archive.twin.verifiedAt).toBe(s.twin.verifiedAt);
    expect(archive.checkout.capturedAt).toBe(s.checkout.capturedAt);
    expect(archive.note).toContain("No new payment or provider verification");
    expect(JSON.stringify(s)).toBe(original);
  });
  it("rejects incomplete/mismatched source evidence and private content", () => {
    const s = syntheticJudgeSource();
    expect(() =>
      sanitizedSandbox(
        { ...s.checkout, state: "pending" },
        s.twin,
        s.documents,
        s.events,
      ),
    ).toThrow();
    expect(() =>
      sanitizedSandbox(
        { ...s.checkout, providerCaptureId: "DIFFERENT" },
        s.twin,
        s.documents,
        s.events,
      ),
    ).toThrow();
    expect(() =>
      sanitizedSandbox(
        s.checkout,
        s.twin,
        [{ ...s.documents[0], content: "buyer@example.com" }],
        s.events,
      ),
    ).toThrow();
    const archive = sanitizedSandbox(s.checkout, s.twin, s.documents, s.events);
    expect(() =>
      judgeSandboxSchema.parse({
        ...archive,
        twin: { ...archive.twin, paypalCaptureId: "WRONG" },
      }),
    ).toThrow();
  });
});
