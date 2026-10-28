import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertEvaluationAccess,
  evaluationAccessStatus,
} from "../../src/lib/careos/evaluation-access";

const customer = "a".repeat(64),
  studio = "b".repeat(64);
const now = Date.parse("2026-10-28T23:00:00Z");
const env = {
  APP_ORIGIN: "http://127.0.0.1:3002",
  CAREOS_EVALUATION_ENABLED: "true",
  CAREOS_EVALUATION_EXPIRES_AT: new Date(now + 60000).toISOString(),
  CAREOS_CUSTOMER_ACCESS_HASH: createHash("sha256")
    .update(customer)
    .digest("hex"),
  CAREOS_STUDIO_ACCESS_HASH: createHash("sha256").update(studio).digest("hex"),
};
const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
import { GET, POST } from "../../src/app/api/ai/evaluation/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  jar.get.mockReset();
  jar.set.mockReset();
});

describe("read-only private access status", () => {
  it("reports only the independently authorized scopes, without any token/hash", () => {
    for (const tokens of [
      {},
      { customer },
      { studio },
      { customer, studio },
      { customer: studio, studio: customer },
    ]) {
      const result = evaluationAccessStatus(tokens, env, now);
      expect(result).toEqual({
        window: "active",
        expiresAt: env.CAREOS_EVALUATION_EXPIRES_AT,
        scopes: {
          customer: tokens.customer === customer,
          studio: tokens.studio === studio,
        },
      });
      expect(JSON.stringify(result)).not.toContain(customer);
      expect(JSON.stringify(result)).not.toContain(
        env.CAREOS_CUSTOMER_ACCESS_HASH,
      );
    }
  });
  it("keeps authorization across equivalent process configuration, not a changed capability", () => {
    const before = evaluationAccessStatus({ customer, studio }, env, now);
    expect(
      evaluationAccessStatus({ customer, studio }, { ...env }, now + 1),
    ).toEqual(before);
    expect(
      evaluationAccessStatus(
        { customer, studio },
        {
          ...env,
          CAREOS_CUSTOMER_ACCESS_HASH: createHash("sha256")
            .update("c".repeat(64))
            .digest("hex"),
        },
        now,
      ).scopes,
    ).toEqual({ customer: false, studio: true });
  });
  it("rejects at the exact deadline; a status read cannot renew anything", () => {
    const deadline = Date.parse(env.CAREOS_EVALUATION_EXPIRES_AT);
    expect(
      evaluationAccessStatus({ customer, studio }, env, deadline - 1).scopes
        .customer,
    ).toBe(true);
    expect(evaluationAccessStatus({ customer, studio }, env, deadline)).toEqual(
      {
        window: "expired",
        expiresAt: env.CAREOS_EVALUATION_EXPIRES_AT,
        scopes: { customer: false, studio: false },
      },
    );
    expect(() =>
      assertEvaluationAccess("customer", customer, env, deadline),
    ).toThrow();
    expect(env.CAREOS_EVALUATION_EXPIRES_AT).toBe(
      new Date(now + 60000).toISOString(),
    );
  });
  it.each([
    { CAREOS_EVALUATION_ENABLED: "false" },
    { APP_ORIGIN: "https://public.example" },
    { CAREOS_EVALUATION_EXPIRES_AT: "invalid" },
    { CAREOS_EVALUATION_EXPIRES_AT: new Date(now + 86400001).toISOString() },
    { CAREOS_STUDIO_ACCESS_HASH: env.CAREOS_CUSTOMER_ACCESS_HASH },
  ])("fails closed for unavailable/unsafe settings %j", (change) => {
    expect(
      evaluationAccessStatus({ customer, studio }, { ...env, ...change }, now),
    ).toEqual({
      window: "unavailable",
      expiresAt: null,
      scopes: { customer: false, studio: false },
    });
  });
});

describe("access HTTP contract (no provider or database)", () => {
  function setup(origin = env.APP_ORIGIN) {
    for (const [key, value] of Object.entries({ ...env, APP_ORIGIN: origin }))
      vi.stubEnv(key, value);
    vi.spyOn(Date, "now").mockReturnValue(now);
    jar.get.mockImplementation((name: string) =>
      name === "palcare-ai-customer" ? { value: customer } : undefined,
    );
  }
  const request = (scope: string, token: string, origin = env.APP_ORIGIN) =>
    new Request(env.APP_ORIGIN + "/api/ai/evaluation", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ scope, token }),
    });
  it("GET is private/no-store, never sets/slides a cookie, and needs no provider", async () => {
    setup();
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(await response.json()).toMatchObject({
      scopes: { customer: true, studio: false },
    });
    expect(jar.set).not.toHaveBeenCalled();
  });
  it.each(["http://127.0.0.1:3002", "https://localhost:3002"])(
    "retains persistent HttpOnly host-only Strict cookies for %s",
    async (origin) => {
      setup(origin);
      const response = await POST(request("customer", customer, origin));
      expect(response.status).toBe(200);
      expect(jar.set).toHaveBeenCalledExactlyOnceWith(
        "palcare-ai-customer",
        customer,
        {
          httpOnly: true,
          sameSite: "strict",
          secure: origin.startsWith("https:"),
          path: "/",
          expires: new Date(env.CAREOS_EVALUATION_EXPIRES_AT),
        },
      );
    },
  );
  it("rejects wrong scope, cross-origin POST and expired windows without setting cookies", async () => {
    setup();
    expect((await POST(request("studio", customer))).status).toBe(403);
    expect(
      (await POST(request("customer", customer, "http://evil.example"))).status,
    ).toBe(403);
    vi.spyOn(Date, "now").mockReturnValue(now + 60000);
    expect((await POST(request("customer", customer))).status).toBe(403);
    expect(jar.set).not.toHaveBeenCalled();
  });
});
