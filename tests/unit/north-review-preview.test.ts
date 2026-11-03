import { describe, expect, it } from "vitest";
import {
  northReviewOrigin,
  northReviewPresentation,
  privateHttpsPresentation,
} from "../../src/lib/private-preview-origin";
import { studioEvaluationAllowed } from "../../src/lib/intelligence/access";
import { parseCareConfig } from "../../src/lib/careos/config";
import {
  assertOwnerRequest,
  OWNER_ORIGIN,
} from "../../src/lib/careos/standing-owner";
import {
  northReviewEnvironment,
  northLiveReviewEnvironment,
} from "../../scripts/north-review-preview-policy";
import { readinessPlan } from "../../src/lib/readiness-plan";

const env = {
  PALCARE_NORTH_REVIEW_PREVIEW: "true",
  APP_ORIGIN: northReviewOrigin,
  CAREOS_PROVIDER: "disabled",
  CAREOS_OWNER_MODE: "false",
  CAREOS_STANDING_AI_ENABLED: "false",
  CAREOS_EVALUATION_ENABLED: "false",
  CAREOS_OWNER_PAIRING_ENABLED: "false",
  AG_STUDIO_PRIVATE_DEVELOPMENT_ENABLED: "true",
};
describe("separate North review presentation — no AI grant or original-preview change", () => {
  it("live review configuration still has only reader/CareOS database capabilities and no financial authority", () => {
    const runtime = northLiveReviewEnvironment({
      DEMO_DATA_SOURCE: "database",
      DATABASE_URL: "postgresql://reader@127.0.0.1/app",
      CAREOS_DATABASE_URL: "postgresql://careos@127.0.0.1/app",
    });
    expect(northReviewPresentation(runtime)).toBe(true);
    expect(parseCareConfig(runtime).mode).toBe("subscription");
    expect(
      readinessPlan(runtime).requirements.map((r) => r.capability),
    ).toEqual(["reader", "careos"]);
    expect(runtime.PAYPAL_CHECKOUT_ENABLED).toBe("false");
  });
  it("shows verified build identity without inheriting source environment labels or AI authority", () => {
    const source = {
      DEMO_DATA_SOURCE: "database",
      DATABASE_URL: "postgresql://reader@127.0.0.1/app",
      CAREOS_DATABASE_URL: "postgresql://careos@127.0.0.1/app",
      PALCARE_NORTH_REVIEW_BUILD_ID: "stale",
      PALCARE_NORTH_REVIEW_COMMIT: "invented",
    };
    expect(northReviewEnvironment(source).PALCARE_NORTH_REVIEW_BUILD_ID).toBe(
      "",
    );
    const runtime = northReviewEnvironment(source, {
      commit: "a".repeat(40),
      buildId: "actual-build_123",
      sourceHash: "b".repeat(64),
      dirty: true,
    });
    expect(runtime.PALCARE_NORTH_REVIEW_BUILD_ID).toBe("actual-build_123");
    expect(runtime.PALCARE_NORTH_REVIEW_COMMIT).toBe("a".repeat(40));
    expect(runtime.PALCARE_NORTH_REVIEW_SOURCE_HASH).toBe("b".repeat(64));
    expect(runtime.PALCARE_NORTH_REVIEW_DIRTY).toBe("true");
    expect(parseCareConfig(runtime)).toEqual({ mode: "disabled" });
    expect(() =>
      northReviewEnvironment(source, {
        commit: "not-a-commit",
        buildId: "actual",
        sourceHash: "b".repeat(64),
        dirty: false,
      }),
    ).toThrow();
  });
  it("forwards only restricted database capabilities, never source secrets or enable flags", () => {
    const source = {
      DEMO_DATA_SOURCE: "database",
      DATABASE_URL: "postgresql://reader@127.0.0.1/app",
      CAREOS_DATABASE_URL: "postgresql://careos@127.0.0.1/app",
      ADMIN_DATABASE_URL: "NEVER",
      CAREOS_API_KEY: "NEVER",
      PAYPAL_CLIENT_SECRET: "NEVER",
      CAREOS_PROVIDER: "subscription",
      PAYPAL_CHECKOUT_ENABLED: "true",
    };
    const runtime = northReviewEnvironment(source);
    expect(northReviewPresentation(runtime)).toBe(true);
    expect(parseCareConfig(runtime)).toEqual({ mode: "disabled" });
    expect(
      readinessPlan(runtime).requirements.map((r) => r.capability),
    ).toEqual(["reader", "careos"]);
    expect(runtime.PAYPAL_CHECKOUT_ENABLED).toBe("false");
    for (const key of [
      "ADMIN_DATABASE_URL",
      "CAREOS_API_KEY",
      "PAYPAL_CLIENT_SECRET",
      "MIGRATION_DATABASE_URL",
      "OPERATOR_DATABASE_URL",
    ])
      expect(runtime).not.toHaveProperty(key);
  });
  it("enables only the exact private native presentation with inference disabled", () => {
    expect(northReviewPresentation(env)).toBe(true);
    expect(studioEvaluationAllowed(env, new URL(northReviewOrigin).host)).toBe(
      true,
    );
    expect(parseCareConfig(env)).toEqual({ mode: "disabled" });
    expect(privateHttpsPresentation(env)).toBe(false);
  });
  it.each([
    "APP_ORIGIN",
    "CAREOS_PROVIDER",
    "CAREOS_OWNER_MODE",
    "CAREOS_STANDING_AI_ENABLED",
    "CAREOS_EVALUATION_ENABLED",
    "CAREOS_OWNER_PAIRING_ENABLED",
    "PALCARE_NORTH_REVIEW_PREVIEW",
  ])("fails closed when the explicit boundary changes: %s", (key) => {
    expect(northReviewPresentation({ ...env, [key]: "unexpected" })).toBe(
      false,
    );
    expect(
      studioEvaluationAllowed(
        { ...env, [key]: "unexpected" },
        new URL(northReviewOrigin).host,
      ),
    ).toBe(false);
  });
  it("rejects another Host and does not migrate the standing AI origin", () => {
    expect(studioEvaluationAllowed(env, new URL(OWNER_ORIGIN).host)).toBe(
      false,
    );
    expect(studioEvaluationAllowed(env, "127.0.0.1:3003")).toBe(false);
    expect(() =>
      assertOwnerRequest(
        new Request(`${northReviewOrigin}/api/ai/owner`, {
          method: "POST",
          headers: {
            host: new URL(northReviewOrigin).host,
            origin: northReviewOrigin,
          },
        }),
        true,
      ),
    ).toThrow();
    expect(OWNER_ORIGIN).toBe("https://greatbison.tail9e8802.ts.net:8444");
  });
});
