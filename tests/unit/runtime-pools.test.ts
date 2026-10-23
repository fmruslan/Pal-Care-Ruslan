import { beforeEach, describe, it, expect, vi } from "vitest";
const create = vi.hoisted(() => vi.fn(() => ({ db: {}, pool: {} })));
vi.mock("../../src/db/connection", () => ({ createDatabase: create }));
import { runtimeDatabase } from "../../src/db/runtime";
beforeEach(() => {
  delete (globalThis as { runtimePools?: unknown }).runtimePools;
  create.mockClear();
});
describe("bounded capability pools", () => {
  it("shares compatible readers but never merges writer identities or read-only sessions", () => {
    const a = runtimeDatabase("postgresql://localhost/reader", {
      readOnly: true,
    });
    expect(
      runtimeDatabase("postgresql://localhost/reader", { readOnly: true }),
    ).toBe(a);
    expect(runtimeDatabase("postgresql://localhost/reader")).not.toBe(a);
    runtimeDatabase("postgresql://localhost/writer");
    expect(create).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenNthCalledWith(1, "postgresql://localhost/reader", {
      readOnly: true,
      max: 3,
    });
  });
});
