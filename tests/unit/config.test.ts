import { describe, expect, it } from "vitest";
import { parseEnvironment, databaseUrlSchema } from "../../src/lib/config";

describe("server configuration", () => {
  it("defaults explicitly to the labeled fixture preview", () => {
    expect(parseEnvironment({}).data).toEqual({
      dataSource: "fixtures",
      databaseUrl: undefined,
    });
  });
  it("requires a database URL in database mode", () => {
    expect(parseEnvironment({ DEMO_DATA_SOURCE: "database" }).success).toBe(
      false,
    );
  });
  it("accepts a database mode without any provider credentials", () => {
    expect(
      parseEnvironment({
        DEMO_DATA_SOURCE: "database",
        DATABASE_URL: "postgresql://localhost/palcare",
      }).success,
    ).toBe(true);
  });
  it.each([
    "https://example.com",
    "file:///private",
    "postgresql://localhost",
    "not-a-url",
  ])("rejects invalid database URL %s", (url) => {
    expect(databaseUrlSchema.safeParse(url).success).toBe(false);
  });
  it("rejects unknown data sources instead of quietly falling back", () => {
    expect(
      parseEnvironment({ DEMO_DATA_SOURCE: "production-customers" }).success,
    ).toBe(false);
  });
});
