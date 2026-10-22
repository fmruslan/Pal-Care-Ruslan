import { describe, expect, it } from "vitest";
import { checkoutHasExpired } from "../../src/lib/commerce/expiry";
import type { CheckoutView } from "../../src/lib/commerce/contracts";

const now = Date.parse("2026-10-22T12:00:00Z");
const deadline = new Date(now).toISOString();
describe("unattempted checkout expiry", () => {
  it.each([
    "creating",
    "create_unknown",
    "created",
    "pending",
    "expired",
  ] as const)("%s expires exactly at its deadline", (state) => {
    expect(
      checkoutHasExpired(
        { state, expiresAt: deadline, captureAttempted: false },
        now,
      ),
    ).toBe(true);
    expect(
      checkoutHasExpired(
        { state, expiresAt: deadline, captureAttempted: false },
        now - 1,
      ),
    ).toBe(false);
  });
  it.each(["completed", "cancelled", "failed", "review"] as const)(
    "does not replace terminal %s evidence",
    (state) => {
      expect(
        checkoutHasExpired(
          { state, expiresAt: deadline, captureAttempted: false },
          now + 1,
        ),
      ).toBe(false);
    },
  );
  it.each(["capturing", "pending", "created"] as const)(
    "keeps attempted %s payments reconcilable after expiry",
    (state) => {
      expect(
        checkoutHasExpired(
          { state, expiresAt: deadline, captureAttempted: true },
          now + 1,
        ),
      ).toBe(false);
    },
  );
  it("requires an explicit deadline rather than treating absent data as authorization", () => {
    expect(
      checkoutHasExpired(
        {
          state: "created",
          expiresAt: "",
          captureAttempted: false,
        } satisfies Pick<
          CheckoutView,
          "state" | "expiresAt" | "captureAttempted"
        >,
        now,
      ),
    ).toBe(false);
  });
});
