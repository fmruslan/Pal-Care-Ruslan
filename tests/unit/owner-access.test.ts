import { mkdtemp, readFile, rm, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeEach, afterEach, it, expect } from "vitest";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import { SUBSCRIPTION_SESSION } from "../../src/lib/careos/subscription/policy";
import {
  approveOwnerAccess,
  completeOwnerAccess,
  ownerAccessStatus,
  ownerWindow,
  requestOwnerAccess,
} from "../../src/lib/careos/owner-access";

let home: string,
  files: PilotFiles,
  env: Record<string, string>,
  before: Record<string, string>;
const now = Date.now(),
  customer = "a".repeat(64),
  studio = "b".repeat(64);
beforeEach(async () => {
  home = await mkdtemp("/tmp/opencode/owner-access-unit-");
  files = new PilotFiles(join(home, ".config/palcare-chatgpt-pilot"));
  await files.prepare();
  await files.write("session.json", {
    id: SUBSCRIPTION_SESSION,
    approvedAt: new Date(now - 1000).toISOString(),
    expiresAt: now + 3600000,
    creditsDisabledConfirmed: true,
    requestLimit: 50,
    blocked: null,
    attempts: Array.from({ length: 28 }, (_, i) => ({
      key: `unit:${i}`,
      scope: "customer",
      schema: "unit",
      attemptedAt: new Date(now - 1000).toISOString(),
      state: i < 2 ? "unknown" : "completed",
      summary: {},
    })),
  });
  await files.write("application.json", {
    origin: "http://127.0.0.1:3114",
    customer,
    studio,
    expiresAt: now + 3600000,
  });
  const window = await ownerWindow(files, now);
  env = { ...window.env, CAREOS_OWNER_PAIRING_ENABLED: "true" };
  before = {};
  for (const name of ["session.json", "application.json"])
    before[name] = await readFile(join(files.directory, name), "utf8");
});
afterEach(async () => {
  for (const [name, raw] of Object.entries(before))
    expect(await readFile(join(files.directory, name), "utf8")).toBe(raw);
  await rm(home, { recursive: true, force: true }); // Only this test's mkdtemp-owned fixture.
});
it("requires explicit host approval AND the originating browser, then consumes once", async () => {
  const r = await requestOwnerAccess(files, env, ["customer"], now);
  expect(r.pairing.scopes).toEqual(["customer"]);
  expect(
    await completeOwnerAccess(files, env, r.browser, r.pairing.requestId, now),
  ).toBeNull();
  await approveOwnerAccess(files, r.pairing.requestId, ["customer"], now);
  await expect(
    completeOwnerAccess(files, env, "c".repeat(64), r.pairing.requestId, now),
  ).rejects.toThrow();
  await expect(
    completeOwnerAccess(files, env, r.browser, randomUUID(), now),
  ).rejects.toThrow();
  expect(await ownerAccessStatus(files, env, undefined, now)).toBeNull();
  expect(await ownerAccessStatus(files, env, r.browser, now)).toMatchObject({
    approved: true,
  });
  expect(
    await completeOwnerAccess(files, env, r.browser, r.pairing.requestId, now),
  ).toMatchObject({
    scopes: ["customer"],
    app: { customer, studio, expiresAt: now + 3600000 },
  });
  await expect(
    completeOwnerAccess(files, env, r.browser, r.pairing.requestId, now),
  ).rejects.toThrow();
  expect(await ownerAccessStatus(files, env, r.browser, now)).toBeNull();
});
it("will not widen selected scopes or approve a consumed/already-approved request", async () => {
  const r = await requestOwnerAccess(files, env, ["studio"], now);
  await expect(
    approveOwnerAccess(files, r.pairing.requestId, ["customer", "studio"], now),
  ).rejects.toThrow();
  await expect(
    approveOwnerAccess(files, r.pairing.requestId, ["customer"], now),
  ).rejects.toThrow();
  await approveOwnerAccess(files, r.pairing.requestId, ["studio"], now);
  await expect(
    approveOwnerAccess(files, r.pairing.requestId, ["studio"], now),
  ).rejects.toThrow();
  expect(
    (await completeOwnerAccess(files, env, r.browser, r.pairing.requestId, now))
      ?.scopes,
  ).toEqual(["studio"]);
});
it("caps pairing at five minutes and rejects exact pairing/window expiry", async () => {
  const r = await requestOwnerAccess(files, env, ["customer", "studio"], now);
  expect(Date.parse(r.pairing.expiresAt)).toBe(now + 300000);
  await approveOwnerAccess(
    files,
    r.pairing.requestId,
    ["studio", "customer"],
    now + 1,
  );
  await expect(
    completeOwnerAccess(
      files,
      env,
      r.browser,
      r.pairing.requestId,
      now + 300000,
    ),
  ).rejects.toThrow();
  await expect(
    ownerAccessStatus(files, env, r.browser, now + 3600000),
  ).rejects.toThrow();
});
it("never outlives a nearly expired approved window", async () => {
  const r = await requestOwnerAccess(files, env, ["customer"], now + 3599000);
  expect(Date.parse(r.pairing.expiresAt)).toBe(now + 3600000);
  await expect(
    approveOwnerAccess(files, r.pairing.requestId, ["customer"], now + 3600000),
  ).rejects.toThrow();
});
it("denies disabled pairing, changed runtime scope hashes and wrong origin/configuration", async () => {
  for (const changed of [
    { CAREOS_OWNER_PAIRING_ENABLED: "false" },
    { CAREOS_CUSTOMER_ACCESS_HASH: "c".repeat(64) },
    { APP_ORIGIN: "http://localhost:3114" },
    { CAREOS_EVALUATION_EXPIRES_AT: new Date(now + 7200000).toISOString() },
  ])
    await expect(
      requestOwnerAccess(files, { ...env, ...changed }, ["customer"], now),
    ).rejects.toThrow();
  expect(await files.read("owner-access.json")).toBeNull();
});
it("does not expose a raw browser nonce or scope credentials in saved pairing state/status", async () => {
  const r = await requestOwnerAccess(files, env, ["customer", "studio"], now);
  const text = JSON.stringify([
    await files.read("owner-access.json"),
    await ownerAccessStatus(files, env, r.browser, now),
  ]);
  for (const secret of [r.browser, customer, studio])
    expect(text).not.toContain(secret);
});
it("persists across process-like service reconstruction without touching original authority", async () => {
  const r = await requestOwnerAccess(files, env, ["customer"], now);
  await approveOwnerAccess(
    new PilotFiles(files.directory),
    r.pairing.requestId,
    ["customer"],
    now + 1,
  );
  expect(
    await ownerAccessStatus(
      new PilotFiles(files.directory),
      { ...env },
      r.browser,
      now + 2,
    ),
  ).toMatchObject({ approved: true });
});
it("invalidates outstanding pairing on a legitimate window change instead of carrying grants forward", async () => {
  const r = await requestOwnerAccess(files, env, ["customer"], now);
  await approveOwnerAccess(files, r.pairing.requestId, ["customer"], now);
  try {
    const expiresAt = now + 3600001;
    await files.write("session.json", {
      ...JSON.parse(before["session.json"]),
      expiresAt,
    });
    await files.write("application.json", {
      ...JSON.parse(before["application.json"]),
      expiresAt,
    });
    const changed = {
      ...env,
      CAREOS_EVALUATION_EXPIRES_AT: new Date(expiresAt).toISOString(),
    };
    await expect(
      completeOwnerAccess(files, changed, r.browser, r.pairing.requestId, now),
    ).rejects.toThrow();
    expect(await ownerAccessStatus(files, changed, r.browser, now)).toBeNull();
  } finally {
    await files.write("session.json", JSON.parse(before["session.json"]));
    await files.write(
      "application.json",
      JSON.parse(before["application.json"]),
    );
  }
});
it("has persistent burst, hourly and window issuance limits even after records expire", async () => {
  await requestOwnerAccess(files, env, ["customer"], now);
  await expect(
    requestOwnerAccess(
      new PilotFiles(files.directory),
      env,
      ["customer"],
      now + 4999,
    ),
  ).rejects.toThrow();
  for (let i = 1; i < 12; i++)
    await requestOwnerAccess(files, env, ["customer"], now + i * 5000);
  await expect(
    requestOwnerAccess(files, env, ["customer"], now + 300001),
  ).rejects.toThrow();
  const s = (await files.read("owner-access.json")) as {
    window: string;
    entries: unknown[];
  };
  await files.write("owner-access.json", {
    ...s,
    entries: Array.from({ length: 32 }, () => s.entries[0]),
  });
  await expect(
    requestOwnerAccess(files, env, ["customer"], now + 3500000),
  ).rejects.toThrow();
});
it("serializes concurrent claims so only one can consume an approved request", async () => {
  const r = await requestOwnerAccess(files, env, ["customer"], now);
  await approveOwnerAccess(files, r.pairing.requestId, ["customer"], now);
  const results = await Promise.allSettled([
    completeOwnerAccess(files, env, r.browser, r.pairing.requestId, now),
    completeOwnerAccess(files, env, r.browser, r.pairing.requestId, now),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
});
it("rejects unsafe host permissions instead of weakening file guards", async () => {
  await chmod(files.directory, 0o755);
  await expect(
    requestOwnerAccess(files, env, ["customer"], now),
  ).rejects.toThrow();
  await chmod(files.directory, 0o700);
});
it("the real CLI approves only the explicitly requested scopes without printing secrets", async () => {
  const r = await requestOwnerAccess(files, env, ["customer", "studio"], now);
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/owner-access.ts",
      "approve",
      r.pairing.requestId,
      "--scopes",
      "customer,studio",
    ],
    {
      env: { PATH: process.env.PATH, HOME: home, NODE_ENV: "test" },
      timeout: 10000,
    },
  );
  expect(stdout).toContain("Approved customer + studio");
  for (const secret of [r.browser, customer, studio])
    expect(stdout).not.toContain(secret);
  expect(
    await ownerAccessStatus(files, env, r.browser, Date.now()),
  ).toMatchObject({ approved: true });
}, 15000);
