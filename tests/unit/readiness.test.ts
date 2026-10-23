import { describe, it, expect } from "vitest";
import { readinessPlan } from "../../src/lib/readiness-plan";
import { validAppOrigin } from "../../src/lib/origin";
describe("provider-free readiness configuration", () => {
  const base = {
    APP_ORIGIN: "https://palcare.example",
    DEMO_DATA_SOURCE: "database",
    DATABASE_URL: "postgresql://localhost/reader",
    CAREOS_DATABASE_URL: "postgresql://localhost/careos",
  };
  it("requires exact origin, distinct explicit capabilities and no migration credentials", () => {
    expect(readinessPlan(base).requirements.map((r) => r.capability)).toEqual([
      "reader",
      "careos",
    ]);
    for (const bad of [
      { APP_ORIGIN: "" },
      { APP_ORIGIN: "https://palcare.example/" },
      { CAREOS_DATABASE_URL: "" },
      { MIGRATION_DATABASE_URL: "postgresql://localhost/owner" },
      { OPERATOR_DATABASE_URL: "postgresql://localhost/issuer" },
      { LOCAL_POSTGRES_PASSWORD: "test-bootstrap-only" },
    ])
      expect(() => readinessPlan({ ...base, ...bad })).toThrow();
    expect(validAppOrigin("https://user:password@palcare.example")).toBe(false);
  });
  it("does not require disabled provider credentials or call providers", () => {
    expect(
      readinessPlan({
        APP_ORIGIN: "http://localhost:3000",
        DEMO_DATA_SOURCE: "fixtures",
      }).requirements,
    ).toEqual([]);
    expect(readinessPlan(base).features.checkout).toBe("disabled");
    expect(() =>
      readinessPlan({ ...base, GUARDIAN_OPERATIONS_ENABLED: "true" }),
    ).toThrow();
    expect(() =>
      readinessPlan({ ...base, PAYPAL_CHECKOUT_ENABLED: "true" }),
    ).toThrow();
    expect(() =>
      readinessPlan({ ...base, DISCOVERY_PROVIDER: "channel3" }),
    ).toThrow();
  });
});
