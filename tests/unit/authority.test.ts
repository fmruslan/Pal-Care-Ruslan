import { describe, it, expect } from "vitest";
import { runtimeWriterUrl } from "../../src/db/authority";
describe("writer connection isolation", () => {
  it("never falls back to the general reader or migration secret", () => {
    expect(() =>
      runtimeWriterUrl("CAREOS_DATABASE_URL", {
        DATABASE_URL: "postgresql://localhost/example",
      }),
    ).toThrow();
    expect(() =>
      runtimeWriterUrl("CAREOS_DATABASE_URL", {
        CAREOS_DATABASE_URL: "postgresql://localhost/example",
        MIGRATION_DATABASE_URL: "postgresql://localhost/owner",
      }),
    ).toThrow();
    expect(
      runtimeWriterUrl("CAREOS_DATABASE_URL", {
        CAREOS_DATABASE_URL: "postgresql://localhost/example",
      }),
    ).toBe("postgresql://localhost/example");
  });
});
