import { describe, expect, it } from "vitest";
import { solTestScope } from "../helpers/sol-scopes";

describe("injected Sol project isolation without weakening runtime quotas", () => {
  it("assigns different origins and scope owners to each project and run", () => {
    const desktop = solTestScope("desktop-light", "a".repeat(64));
    const mobile = solTestScope("mobile-dark", "a".repeat(64));
    const next = solTestScope("desktop-light", "b".repeat(64));
    expect(desktop.origin).toBe("http://127.0.0.1:3112");
    expect(mobile.origin).toBe("http://127.0.0.1:3113");
    expect(
      new Set([
        desktop.customer,
        desktop.studio,
        mobile.customer,
        mobile.studio,
        next.customer,
        next.studio,
      ]).size,
    ).toBe(6);
    for (const value of [desktop, mobile, next]) {
      expect(value.customer).toMatch(/^[a-f0-9]{64}$/);
      expect(value.studio).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(solTestScope("desktop-light", "a".repeat(64))).toEqual(desktop);
  });
  it("fails closed without the explicit test run and known project", () => {
    for (const [project, seed] of [
      ["owner", "a".repeat(64)],
      ["mobile-dark", ""],
      ["desktop-light", "not-a-test-run"],
      ["__proto__", "a".repeat(64)],
    ])
      expect(() => solTestScope(project, seed)).toThrow(
        "Explicit isolated Sol test project/run required",
      );
  });
});
