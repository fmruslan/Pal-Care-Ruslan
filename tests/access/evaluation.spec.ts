import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import { SUBSCRIPTION_SESSION } from "../../src/lib/careos/subscription/policy";
import { expect, test } from "@playwright/test";

// Actual isolated production HTTP/browser cookies; synthetic scopes, fixture data.
// No runtime credentials, database, model transport, or financial capability.
const origin = "http://127.0.0.1:3114";
const customer = "a".repeat(64),
  studio = "b".repeat(64);
let server: ChildProcess | undefined;
let deadline: string;
let home: string;
async function start(expiresAt = new Date(Date.now() + 3600000).toISOString()) {
  deadline = expiresAt;
  const files = new PilotFiles(join(home, ".config/palcare-chatgpt-pilot"));
  await files.prepare();
  if (!(await files.read("session.json")))
    await files.write("session.json", {
      id: SUBSCRIPTION_SESSION,
      approvedAt: new Date().toISOString(),
      expiresAt: Date.parse(deadline),
      creditsDisabledConfirmed: true,
      requestLimit: 50,
      attempts: [],
      blocked: null,
    });
  else {
    const saved = (await files.read("session.json")) as object;
    await files.write("session.json", {
      ...saved,
      expiresAt: Date.parse(deadline),
    });
  }
  await files.write("application.json", {
    origin,
    customer,
    studio,
    expiresAt: Date.parse(deadline),
  });
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3114",
    ],
    {
      stdio: "ignore",
      env: {
        PATH: process.env.PATH,
        HOME: home,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        APP_ORIGIN: origin,
        DEMO_DATA_SOURCE: "fixtures",
        CAREOS_PROVIDER: "fixture",
        CAREOS_LIVE_ENABLED: "false",
        CAREOS_SUBSCRIPTION_ENABLED: "false",
        PAYPAL_CHECKOUT_ENABLED: "false",
        GUARDIAN_OPERATIONS_ENABLED: "false",
        GUARDIAN_REFUNDS_ENABLED: "false",
        AG_STUDIO_LOCAL_EVALUATION_ENABLED: "true",
        CAREOS_EVALUATION_ENABLED: "true",
        CAREOS_OWNER_PAIRING_ENABLED: "true",
        CAREOS_OWNER_SSH_TARGET: "bigrus@greatbison.tail9e8802.ts.net",
        CAREOS_EVALUATION_EXPIRES_AT: deadline,
        CAREOS_CUSTOMER_ACCESS_HASH: createHash("sha256")
          .update(customer)
          .digest("hex"),
        CAREOS_STUDIO_ACCESS_HASH: createHash("sha256")
          .update(studio)
          .digest("hex"),
      },
    },
  );
  await expect
    .poll(async () => {
      if (server?.exitCode !== null)
        throw new Error("Isolated access server failed to start");
      try {
        return (await fetch(origin + "/api/health")).status;
      } catch {
        return 0;
      }
    })
    .toBe(200);
}
async function stop() {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  server = undefined;
}
test.beforeEach(async () => {
  home = await mkdtemp("/tmp/opencode/owner-access-browser-");
  await start();
});
test.afterEach(async () => {
  await stop();
  await rm(home, { recursive: true, force: true }); // Only this scenario's dedicated mkdtemp home.
});

test("one unlock survives refresh, browser reconnect and server restart; Customer and Studio stay separate", async ({
  page,
  context,
  browser,
}) => {
  let unexpected = 0;
  await context.route("**/*", async (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (
      url.origin !== origin ||
      (r.method() !== "GET" && url.pathname !== "/api/ai/evaluation")
    ) {
      unexpected++;
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/ai-evaluation");
  await page
    .getByText("Advanced: private scope token", { exact: true })
    .click();
  await expect(page.getByLabel("Private scope token")).toBeVisible();
  await page.getByLabel("Private scope token").fill(customer);
  await page
    .getByRole("button", { name: "Authorize this browser", exact: true })
    .click();
  await expect(
    page.getByText("No token needed for this scope.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Private scope token")).toHaveCount(0);
  const cookies = await context.cookies();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({
    name: "palcare-ai-customer",
    httpOnly: true,
    secure: false,
    sameSite: "Strict",
    path: "/",
    domain: "127.0.0.1",
  });
  // Chromium adjusts Expires for response Date/clock skew and may retain fractions.
  expect(
    Math.abs(cookies[0].expires - Date.parse(deadline) / 1000),
  ).toBeLessThan(1.5);
  expect(await page.evaluate(() => document.cookie)).not.toContain(customer);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Open Customer CareOS" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Check access", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Reconnect your SSH tunnel",
  );
  await context.setOffline(false);
  await page.getByRole("button", { name: "Check access", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open Customer CareOS" }),
  ).toBeVisible();
  await page
    .getByText("Advanced: private scope token", { exact: true })
    .click();
  await page.getByLabel("Evaluation scope").selectOption("studio");
  await page.getByLabel("Private scope token").fill(customer);
  await page
    .getByRole("button", { name: "Authorize this browser", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Scope not authorized" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open AG Studio" })).toHaveCount(
    0,
  );
  await page.getByLabel("Private scope token").fill(studio);
  await page
    .getByRole("button", { name: "Authorize this browser", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open AG Studio" }),
  ).toBeVisible();
  const state = await context.storageState();
  await stop();
  await start(deadline);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Open AG Studio" }),
  ).toBeVisible();
  const reconnect = await browser.newContext({ storageState: state });
  try {
    const reconnected = await reconnect.newPage();
    await reconnected.goto(origin + "/ai-evaluation");
    await expect(
      reconnected.getByRole("link", { name: "Open Customer CareOS" }),
    ).toBeVisible();
    await expect(
      reconnected.getByRole("link", { name: "Open AG Studio" }),
    ).toBeVisible();
    await expect(reconnected.getByLabel("Private scope token")).toHaveCount(0);
    const status = await reconnect.request.get(origin + "/api/ai/evaluation");
    expect(status.headers()["cache-control"]).toBe("private, no-store");
    expect(status.headers()["set-cookie"]).toBeUndefined();
    expect((await reconnect.cookies()).map((c) => c.expires)).toEqual(
      state.cookies.map((c) => c.expires),
    );
  } finally {
    await reconnect.close();
  }
  expect(unexpected).toBe(0);
});

test("expiry denies even retained tokens; only an operator-renewed server window restores access", async ({
  page,
  context,
}) => {
  const unlocked = await context.request.post(origin + "/api/ai/evaluation", {
    headers: { Origin: origin },
    data: { scope: "customer", token: customer },
  });
  expect(unlocked.status()).toBe(200);
  // Emulate a legitimately shorter configured window without changing the stored cookie.
  await stop();
  await start(new Date(Date.now() + 8000).toISOString());
  await page.goto("/ai-evaluation");
  await expect(
    page.getByRole("link", { name: "Open Customer CareOS" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "testing window has expired" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Private scope token")).toHaveCount(0);
  expect(
    (
      await context.request.post(origin + "/api/ai/evaluation", {
        headers: { Origin: origin },
        data: { scope: "customer", token: customer },
      })
    ).status(),
  ).toBe(403);
  const expired = await context.request.get(origin + "/api/ai/evaluation");
  expect(await expired.json()).toMatchObject({
    window: "expired",
    scopes: { customer: false, studio: false },
  });
  await stop();
  await start(); // Explicit operator configuration in this isolated fixture only.
  await page.getByRole("button", { name: "Check access", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open Customer CareOS" }),
  ).toBeVisible();
});

test("browser-deleted expired cookies are not recreated by a renewed window or status read", async ({
  context,
  page,
}) => {
  const result = await context.request.post(origin + "/api/ai/evaluation", {
    headers: { Origin: origin },
    data: { scope: "customer", token: customer },
  });
  expect(result.status()).toBe(200);
  const [cookie] = await context.cookies();
  // Browser expiry, not an application logout or a new session/allowance.
  await context.addCookies([
    { ...cookie, expires: Math.floor(Date.now() / 1000) - 1 },
  ]);
  expect(await context.cookies()).toEqual([]);
  await stop();
  await start();
  await page.goto("/ai-evaluation");
  await page
    .getByText("Advanced: private scope token", { exact: true })
    .click();
  await expect(page.getByLabel("Private scope token")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Customer CareOS" }),
  ).toHaveCount(0);
  const status = await context.request.get(origin + "/api/ai/evaluation");
  expect(status.headers()["set-cookie"]).toBeUndefined();
  expect(await context.cookies()).toEqual([]);
});

test("anonymous and wrong-origin requests cannot authorize; a fresh browser needs its scope token", async ({
  page,
  context,
}) => {
  await page.goto("/ai-evaluation");
  await expect(
    page.getByRole("link", { name: "Open Customer CareOS" }),
  ).toHaveCount(0);
  expect(
    await (await context.request.get(origin + "/api/ai/evaluation")).json(),
  ).toMatchObject({ scopes: { customer: false, studio: false } });
  expect(
    (
      await context.request.post(origin + "/api/ai/evaluation", {
        headers: { Origin: "http://evil.example" },
        data: { scope: "customer", token: customer },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post(origin + "/api/ai/evaluation", {
        headers: { Origin: origin },
        data: { scope: "studio", token: customer },
      })
    ).status(),
  ).toBe(403);
  expect(await context.cookies()).toEqual([]);
  const fresh = await context.request.get(origin + "/api/ai/evaluation", {
    headers: { Cookie: `palcare-ai-studio=${studio}` },
  });
  expect(await fresh.json()).toMatchObject({
    scopes: { customer: false, studio: true },
  });
});

async function approve(id: string, scopes: string) {
  return promisify(execFile)(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/owner-access.ts",
      "approve",
      id,
      "--scopes",
      scopes,
    ],
    {
      env: { PATH: process.env.PATH, HOME: home, NODE_ENV: "test" },
      timeout: 10000,
    },
  );
}

test("owner uses a browser-bound request and real host CLI, not pasted private tokens", async ({
  page,
  context,
  browser,
}) => {
  let forbidden = 0;
  await context.route("**/*", async (route) => {
    const r = route.request(),
      u = new URL(r.url());
    if (
      u.origin !== origin ||
      (r.method() !== "GET" && u.pathname !== "/api/ai/owner-access")
    ) {
      forbidden++;
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/ai-evaluation");
  await expect(page.getByLabel("Private scope token")).not.toBeVisible();
  const response = page.waitForResponse(
    (r) =>
      r.url() === origin + "/api/ai/owner-access" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Connect selected scopes via SSH",
      exact: true,
    })
    .click();
  const { pairing } = await (await response).json();
  await expect(page.getByLabel("SSH owner approval command")).toContainText(
    pairing.requestId,
  );
  await expect(page.getByLabel("SSH owner approval command")).toContainText(
    "--scopes customer,studio",
  );
  const pairingCookie = (await context.cookies()).find(
    (c) => c.name === "palcare-owner-pairing",
  )!;
  expect(pairingCookie).toMatchObject({
    httpOnly: true,
    sameSite: "Strict",
    path: "/api/ai/owner-access",
  });
  const command = await page
    .getByLabel("SSH owner approval command")
    .innerText();
  for (const secret of [customer, studio, pairingCookie.value])
    expect(command).not.toContain(secret);
  await page
    .getByRole("button", { name: "Finish owner connection", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Waiting for your SSH approval" }),
  ).toBeVisible();
  expect(
    (await context.cookies()).filter((c) => c.name.startsWith("palcare-ai-")),
  ).toEqual([]);
  expect(
    (
      await context.request.post(origin + "/api/ai/owner-access", {
        headers: { Origin: origin },
        data: { action: "approve", requestId: pairing.requestId },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await context.request.post(origin + "/api/ai/owner-access", {
        headers: { Origin: "http://evil.example" },
        data: { action: "complete", requestId: pairing.requestId },
      })
    ).status(),
  ).toBe(403);
  const stranger = await browser.newContext();
  try {
    await approve(pairing.requestId, "customer,studio");
    expect(
      (
        await stranger.request.post(origin + "/api/ai/owner-access", {
          headers: { Origin: origin },
          data: { action: "complete", requestId: pairing.requestId },
        })
      ).status(),
    ).toBe(403);
    await page.reload(); // Pending browser binding and host approval survive reload.
    await expect(
      page.getByRole("button", {
        name: "Finish owner connection",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Finish owner connection", exact: true })
      .click();
    for (const name of ["Open Customer CareOS", "Open AG Studio"])
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    const saved = await context.storageState();
    expect(saved.cookies.map((c) => c.name).sort()).toEqual([
      "palcare-ai-customer",
      "palcare-ai-studio",
    ]);
    expect(await page.evaluate(() => document.cookie)).toBe("");
    expect(
      (
        await context.request.post(origin + "/api/ai/owner-access", {
          headers: {
            Origin: origin,
            Cookie: `palcare-owner-pairing=${pairingCookie.value}`,
          },
          data: { action: "complete", requestId: pairing.requestId },
        })
      ).status(),
    ).toBe(403);
    await stop();
    await start(deadline);
    await page.reload();
    for (const name of ["Open Customer CareOS", "Open AG Studio"])
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    expect(await context.cookies()).toEqual(saved.cookies);
    await page.screenshot({
      path: test.info().outputPath("owner-connected.png"),
    });
  } finally {
    await stranger.close();
  }
  expect(forbidden).toBe(0);
});

test("owner approval cannot silently widen Customer-only to Studio", async ({
  page,
  context,
}) => {
  await page.goto("/ai-evaluation");
  await page
    .getByRole("checkbox", { name: "AG Studio", exact: true })
    .uncheck();
  const response = page.waitForResponse(
    (r) =>
      r.url() === origin + "/api/ai/owner-access" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Connect selected scopes via SSH",
      exact: true,
    })
    .click();
  const { pairing } = await (await response).json();
  await expect(approve(pairing.requestId, "customer,studio")).rejects.toThrow();
  await approve(pairing.requestId, "customer");
  await page
    .getByRole("button", { name: "Finish owner connection", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open Customer CareOS", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open AG Studio", exact: true }),
  ).toHaveCount(0);
  expect((await context.cookies()).map((c) => c.name)).toEqual([
    "palcare-ai-customer",
  ]);
});
