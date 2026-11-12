import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertEvaluationAccess,
  evaluationCookie,
  newGuestAccess,
} from "../../src/lib/careos/evaluation-access";
import { parseCareConfig } from "../../src/lib/careos/config";
const jar = vi.hoisted(() => new Map<string, string>());
const setCookie = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => (jar.has(key) ? { value: jar.get(key) } : undefined),
    set: (key: string, value: string, options: unknown) => {
      jar.set(key, value);
      setCookie(key, value, options);
    },
  }),
}));
import { POST } from "../../src/app/api/ai/evaluation/route";
const now = Date.parse("2026-11-12T00:00:00Z");
const env = {
  RENDER: "true",
  PALCARE_HOSTED_DEMO: "true",
  APP_ORIGIN: "https://palcare-judge.onrender.com",
  CAREOS_PROVIDER: "responses",
  CAREOS_MODEL: "deepseek-flash",
  CAREOS_API_KEY: "test-only-not-a-real-secret",
  CAREOS_EVALUATION_ENABLED: "true",
  CAREOS_EVALUATION_EXPIRES_AT: "2027-01-01T08:00:00Z",
  CAREOS_LIVE_ENABLED: "true",
  DEMO_DATA_SOURCE: "database",
  CAREOS_PROVIDER_LIMIT_CONFIRMED: "true",
  CAREOS_DATABASE_URL: "postgres://care:example@db/palcare",
  CAREOS_BUDGET_ID: "render-judge",
  CAREOS_DAILY_BUDGET_MICRO: "5000000",
  CAREOS_TOTAL_BUDGET_MICRO: "5000000",
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  jar.clear();
  setCookie.mockClear();
});
describe("bounded hosted guests, no model/database calls", () => {
  function setup() {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.spyOn(Date, "now").mockReturnValue(now);
  }
  function request(body: unknown = {}, origin = env.APP_ORIGIN) {
    return new Request(env.APP_ORIGIN + "/api/ai/evaluation", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  it("automatically issues distinct private scope cookies, with no tokens in the response; repeated bootstrap never rotates or slides them", async () => {
    setup();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ guest: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(setCookie).toHaveBeenCalledTimes(2);
    for (const scope of ["customer", "studio"] as const) {
      const token = jar.get(evaluationCookie(scope));
      expect(assertEvaluationAccess(scope, token, env, now).expires).toBe(
        now + 86400000,
      );
      expect(setCookie).toHaveBeenCalledWith(evaluationCookie(scope), token, {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
        expires: new Date(now + 86400000),
      });
    }
    const original = [...jar];
    await POST(request());
    expect([...jar]).toEqual(original);
    expect(setCookie).toHaveBeenCalledTimes(2);
  });
  it("gives separate visitors unpredictable identities and rejects swaps, tampering, expiry, changed origins/keys and private runtimes", () => {
    const a = newGuestAccess("studio", env, now),
      b = newGuestAccess("studio", env, now);
    expect(a.token).not.toBe(b.token);
    for (const [scope, token, settings, time] of [
      ["customer", a.token, env, now],
      ["studio", a.token.slice(0, -1) + "z", env, now],
      ["studio", a.token, env, a.expires],
      [
        "studio",
        a.token,
        { ...env, APP_ORIGIN: "https://other.onrender.com" },
        now,
      ],
      [
        "studio",
        a.token,
        { ...env, CAREOS_API_KEY: "different-test-only-secret" },
        now,
      ],
      ["studio", a.token, { ...env, RENDER: "false" }, now],
    ] as const)
      expect(() =>
        assertEvaluationAccess(scope, token, settings, time),
      ).toThrow();
    expect(() =>
      newGuestAccess("customer", { ...env, RENDER: "false" }, now),
    ).toThrow();
    expect(() =>
      newGuestAccess(
        "customer",
        { ...env, PAYPAL_CHECKOUT_ENABLED: "true" },
        now,
      ),
    ).toThrow();
  });
  it("requires same-origin bounded empty JSON and active hosted configuration", async () => {
    setup();
    expect((await POST(request({}, "https://foreign.example"))).status).toBe(
      403,
    );
    expect(
      (await POST(request({ scope: "studio", token: "a".repeat(64) }))).status,
    ).not.toBe(200);
    vi.stubEnv("CAREOS_EVALUATION_ENABLED", "false");
    expect((await POST(request())).status).toBe(403);
    expect(setCookie).not.toHaveBeenCalled();
  });
  it("caps the existing hosted ledger at $18 without changing its ID, preserving explicit lower limits and private $5 maximum", () => {
    expect(parseCareConfig(env)).toMatchObject({
      dailyMicro: 18000000,
      totalMicro: 18000000,
      budgetId: "render-judge",
    });
    expect(
      parseCareConfig({ ...env, CAREOS_TOTAL_BUDGET_MICRO: "1000000" }),
    ).toMatchObject({ totalMicro: 1000000 });
    expect(() =>
      parseCareConfig({ ...env, CAREOS_TOTAL_BUDGET_MICRO: "18000001" }),
    ).toThrow();
    expect(() =>
      parseCareConfig({
        ...env,
        PALCARE_HOSTED_DEMO: "false",
        CAREOS_TOTAL_BUDGET_MICRO: "18000000",
      }),
    ).toThrow();
  });
});
