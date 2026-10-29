import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  privatePreviewEnvironment,
  previewExitCode,
  previewOrigin,
} from "../../scripts/private-preview-policy";
import { SUBSCRIPTION_SESSION } from "../../src/lib/careos/subscription/policy";
import {
  assertEvaluationAccess,
  evaluationAccessStatus,
} from "../../src/lib/careos/evaluation-access";
import { readinessPlan } from "../../src/lib/readiness-plan";
import { subscriptionSession } from "../../src/lib/careos/subscription/session";
import { studioEvaluationAllowed } from "../../src/lib/intelligence/access";
import type { PilotFiles } from "../../src/lib/careos/subscription/files";
import { evaluationWindowExpired } from "../../src/lib/careos/window";

const source = {
  DEMO_DATA_SOURCE: "database",
  DATABASE_URL: "postgresql://reader@127.0.0.1/app",
  CAREOS_DATABASE_URL: "postgresql://careos@127.0.0.1/app",
  ADMIN_DATABASE_URL: "NEVER",
  OPENAI_API_KEY: "NEVER",
  PAYPAL_CHECKOUT_ENABLED: "true",
};
const expiry = Date.now() - 60000;
const app = {
  origin: previewOrigin,
  customer: "a".repeat(64),
  studio: "b".repeat(64),
  expiresAt: expiry,
};
const session = {
  id: SUBSCRIPTION_SESSION,
  approvedAt: new Date(expiry - 3600000).toISOString(),
  expiresAt: expiry,
  creditsDisabledConfirmed: true,
  requestLimit: 50,
  blocked: null,
  attempts: [
    {
      key: "retained-unknown",
      scope: "customer",
      schema: "answer",
      attemptedAt: new Date(expiry - 1000).toISOString(),
      state: "unknown",
      summary: {},
    },
  ],
};

describe("persistent private website is not AI authorization", () => {
  it("distinguishes an intentional supervisor stop from an unexpected child crash", () => {
    expect(previewExitCode(null, "SIGKILL", false)).toBe(1);
    expect(previewExitCode(null, "SIGTERM", true)).toBe(0);
    expect(previewExitCode(0, null, true)).toBe(0);
    expect(previewExitCode(2, null, false)).toBe(2);
  });
  it("checks the original deadline at event time, including resume and invalid clocks", () => {
    expect(evaluationWindowExpired(expiry, expiry - 1)).toBe(false);
    expect(evaluationWindowExpired(expiry, expiry)).toBe(true);
    expect(evaluationWindowExpired(expiry, expiry + 86400000)).toBe(true);
    expect(evaluationWindowExpired(NaN)).toBe(true);
    expect(evaluationWindowExpired(undefined)).toBe(false);
  });
  it("starts website configuration after expiry, preserving exact hashes/deadline/history", async () => {
    const before = JSON.stringify({ app, session });
    const env = privatePreviewEnvironment(source, app, session);
    expect(JSON.stringify({ app, session })).toBe(before);
    expect(env.CAREOS_EVALUATION_EXPIRES_AT).toBe(
      new Date(expiry).toISOString(),
    );
    expect(evaluationAccessStatus({}, env).window).toBe("expired");
    expect(() =>
      assertEvaluationAccess("customer", app.customer, env),
    ).toThrow();
    const files = {
      read: vi.fn().mockResolvedValue(session),
    } as unknown as PilotFiles;
    await expect(subscriptionSession(files)).rejects.toThrow();
    expect(readinessPlan(env).requirements.map((r) => r.capability)).toEqual([
      "reader",
      "careos",
    ]);
    expect(studioEvaluationAllowed(env, "127.0.0.1:3002")).toBe(true);
    expect(studioEvaluationAllowed(env, "example.com")).toBe(false);
    expect(env).not.toHaveProperty("ADMIN_DATABASE_URL");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
    expect(env.PAYPAL_CHECKOUT_ENABLED).toBe("false");
    expect(env.CAREOS_OWNER_PAIRING_ENABLED).toBe("false");
  });
  it("never turns missing, corrupt, mismatched or identical scope records into authority or fixture AI", () => {
    for (const [a, s] of [
      [null, null],
      [app, {}],
      [{ ...app, expiresAt: expiry + 1 }, session],
      [{ ...app, studio: app.customer }, session],
      [{ ...app, origin: "https://public.example" }, session],
    ]) {
      const env = privatePreviewEnvironment(source, a, s);
      expect(env.CAREOS_PROVIDER).toBe("subscription");
      expect(env.CAREOS_EVALUATION_ENABLED).toBe("false");
      expect(evaluationAccessStatus({}, env).window).toBe("unavailable");
      expect(() => assertEvaluationAccess("studio", app.studio, env)).toThrow();
      expect(readinessPlan(env).requirements).toHaveLength(2);
    }
  });
  it("does not alter valid existing capability checks, blocks or exhausted history", async () => {
    const future = Date.now() + 3600000;
    const env = privatePreviewEnvironment(
      source,
      { ...app, expiresAt: future },
      { ...session, expiresAt: future },
    );
    expect(() =>
      assertEvaluationAccess("customer", app.customer, env),
    ).not.toThrow();
    expect(() => assertEvaluationAccess("studio", app.customer, env)).toThrow();
    const files = {
      read: vi.fn().mockResolvedValue({
        ...session,
        expiresAt: future,
        blocked: "retained-denial",
      }),
    } as unknown as PilotFiles;
    await expect(subscriptionSession(files)).rejects.toThrow(
      "subscription_session_blocked",
    );
  });
  it("only separates website readiness within the exact private disabled-provider boundary", () => {
    const env = privatePreviewEnvironment(source, app, session);
    for (const change of [
      { PALCARE_PERSISTENT_PREVIEW: "false" },
      { APP_ORIGIN: "https://public.example" },
      { PAYPAL_CHECKOUT_ENABLED: "true" },
      { GUARDIAN_REFUNDS_ENABLED: "true" },
      { CAREOS_PROVIDER: "responses" },
      { ADMIN_DATABASE_URL: "postgresql://localhost/admin" },
    ])
      expect(() => readinessPlan({ ...env, ...change })).toThrow();
    expect(() =>
      privatePreviewEnvironment(
        { ...source, DATABASE_URL: "postgresql://remote/reader" },
        app,
        session,
      ),
    ).toThrow();
  });
  it("uses a reboot-enabled restartable supervisor without an AI runtime deadline", () => {
    const unit = readFileSync("ops/palcare-preview.service", "utf8");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("WantedBy=default.target");
    expect(unit).toContain("WorkingDirectory=/home/bigrus/projects/palcare");
    expect(unit).not.toContain("RuntimeMaxSec");
    const launcher = readFileSync("scripts/private-preview.ts", "utf8");
    expect(launcher).toContain("assertBuild(true)");
    expect(launcher).toContain("assertDatabaseAuthority");
    expect(launcher).not.toContain("subscriptionSession(");
    expect(launcher).not.toContain("files.write");
    expect(launcher).toContain('"127.0.0.1"');
    expect(launcher).not.toContain("0.0.0.0");
  });
  it("Mac tunnel retains strict authentication, conflict detection and loopback binding", () => {
    const script = readFileSync("ops/macos/tunnel.sh", "utf8");
    for (const option of [
      "exec /usr/bin/ssh",
      "BatchMode=yes",
      "StrictHostKeyChecking=yes",
      "ExitOnForwardFailure=yes",
      "ServerAliveCountMax=3",
      "ControlPath=none",
      "127.0.0.1:3002:127.0.0.1:3002",
    ])
      expect(script).toContain(option);
    const install = readFileSync("ops/macos/install.sh", "utf8");
    expect(install).toContain("Nothing was killed or replaced");
    expect(install).toContain("KeepAlive -bool true");
    expect(install).not.toContain("ssh-keygen");
    expect(install).not.toContain("StrictHostKeyChecking=no");
  });
});
