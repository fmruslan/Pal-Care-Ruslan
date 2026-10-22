import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";

const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  createDatabase: vi.fn(() => ({ db: {}, pool: {} })),
  readDemoData: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("../../src/lib/config", () => ({ getEnvironment: mocks.environment }));
vi.mock("../../src/db/connection", () => ({
  createDatabase: mocks.createDatabase,
}));
vi.mock("../../src/db/read-demo", () => ({ readDemoData: mocks.readDemoData }));

import { getDemoData } from "../../src/lib/demo/repository";

beforeEach(() => {
  vi.clearAllMocks();
  delete (globalThis as { palcareDatabase?: unknown }).palcareDatabase;
});

describe("explicit data-source boundary (unit mocks, not provider evidence)", () => {
  it("fixture mode does not open a database connection", async () => {
    mocks.environment.mockReturnValue({ dataSource: "fixtures" });
    const data = await getDemoData();
    expect(data.source).toBe("fixtures");
    expect(mocks.createDatabase).not.toHaveBeenCalled();
    expect(mocks.readDemoData).not.toHaveBeenCalled();
  });
  it("database mode opens a read-only connection and reports its true source", async () => {
    mocks.environment.mockReturnValue({
      dataSource: "database",
      databaseUrl: "postgresql://localhost/unit",
    });
    mocks.readDemoData.mockResolvedValue(demoData);
    expect((await getDemoData()).source).toBe("database");
    expect(mocks.createDatabase).toHaveBeenCalledWith(
      "postgresql://localhost/unit",
      { readOnly: true },
    );
  });
  it("database failure is redacted and never replaced by sample fixtures", async () => {
    mocks.environment.mockReturnValue({
      dataSource: "database",
      databaseUrl: "postgresql://localhost/unit",
    });
    mocks.readDemoData.mockRejectedValue(
      new Error("PRIVATE DRIVER DIAGNOSTIC"),
    );
    await expect(getDemoData()).rejects.toThrow(
      "Demo records are temporarily unavailable. Check migrations and seed setup.",
    );
  });
});
