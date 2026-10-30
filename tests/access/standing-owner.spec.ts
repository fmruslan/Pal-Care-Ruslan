import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  StandingOwner,
  OWNER_COOKIE,
  OWNER_ORIGIN,
} from "../../src/lib/careos/standing-owner";

// Browser HTTPS transport is intercepted to this isolated loopback production
// server. Real routes/storage/cookie behavior, fictional records, zero providers;
// this is NOT proof of live Tailscale/TLS or real-device acceptance.
const local = "http://127.0.0.1:3116";
let home: string;
let server: ChildProcess | undefined;
async function start() {
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3116",
    ],
    {
      stdio: "ignore",
      env: {
        PATH: process.env.PATH,
        HOME: home,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        APP_ORIGIN: OWNER_ORIGIN,
        DEMO_DATA_SOURCE: "fixtures",
        CAREOS_PROVIDER: "fixture",
        CAREOS_OWNER_MODE: "true",
        CAREOS_STANDING_AI_ENABLED: "false",
        CAREOS_EVALUATION_ENABLED: "false",
        CAREOS_OWNER_PAIRING_ENABLED: "false",
        PAYPAL_CHECKOUT_ENABLED: "false",
        GUARDIAN_OPERATIONS_ENABLED: "false",
        GUARDIAN_REFUNDS_ENABLED: "false",
        PALCARE_PERSISTENT_PREVIEW: "true",
        PALCARE_PRIVATE_HTTPS_PREVIEW: "true",
        AG_STUDIO_PRIVATE_DEVELOPMENT_ENABLED: "true",
      },
    },
  );
  await expect
    .poll(async () => {
      try {
        return (await fetch(local + "/api/health")).status;
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
test.beforeEach(async ({ context }) => {
  home = await mkdtemp("/tmp/opencode/standing-owner-browser-");
  await start();
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== OWNER_ORIGIN) return route.abort();
    const response = await route.fetch({
      url: local + url.pathname + url.search,
      headers: {
        ...(await request.allHeaders()),
        host: new URL(OWNER_ORIGIN).host,
      },
    });
    await route.fulfill({ response });
  });
});
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: "wait" });
  await stop();
  await rm(home, { recursive: true, force: true });
});

test("pair once, remember across reload/server restart, logout and deny stolen replay", async ({
  page,
  context,
}) => {
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  await expect(
    page.getByRole("heading", { name: "CareOS AI access" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remember this browser", exact: true })
    .click();
  const code = await page.locator("code").textContent();
  const id = code!.match(/[a-f0-9-]{36}$/)![0];
  const owner = new StandingOwner(
    new PilotFiles(join(home, ".config/palcare-standing-owner")),
  );
  await owner.approve(id);
  await page
    .getByRole("button", { name: "Finish remembering browser" })
    .click();
  await expect(page.getByText("Remembered", { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(
    (v) => v.name === OWNER_COOKIE,
  )!;
  expect(cookie).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
  });
  expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(29 * 86400000);
  await page.reload();
  await expect(page.getByText("Remembered", { exact: true })).toBeVisible();
  await stop();
  await start();
  await page.reload();
  await expect(page.getByText("Remembered", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Not enabled — awaiting separate owner approval", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Not verified", { exact: true })).toBeVisible();
  await context.addCookies([cookie]);
  await page.reload();
  await expect(page.getByText("Not verified", { exact: true })).toBeVisible();
  expect(
    (
      await owner.status({
        token: cookie.value,
        agent: await page.evaluate(() => navigator.userAgent),
      })
    ).used,
  ).toBe(0);
});

test("exact HTTPS origin rejects cross-origin and HTTP approval/activation attempts", async ({
  request,
}) => {
  const headers = {
    host: new URL(OWNER_ORIGIN).host,
    "content-type": "application/json",
  };
  for (const origin of [
    undefined,
    "https://evil.invalid",
    "https://greatbison.tail9e8802.ts.net:8443",
  ]) {
    const response = await request.post(local + "/api/ai/owner", {
      headers: { ...headers, ...(origin ? { origin } : {}) },
      data: { action: "pair" },
    });
    expect(response.status()).toBe(403);
  }
  for (const action of ["approve", "activate", "renew"]) {
    const response = await request.post(local + "/api/ai/owner", {
      headers: { ...headers, origin: OWNER_ORIGIN },
      data: { action },
    });
    expect(response.status()).toBe(400);
  }
});

test("owner settings replace testing requests without making saved records depend on AI", async ({
  page,
}) => {
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  await expect(
    page.getByText(
      "0 used · 0 approved requests remaining · 0 unknown/reserved",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /copy|request testing|renew/i }),
  ).toHaveCount(0);
  for (const path of ["/dashboard", "/vault", "/documents", "/insights"]) {
    await page.goto(OWNER_ORIGIN + path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByText("Application error", { exact: false }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByTestId("customer-studio").locator(".ag-studio-grid-widget"),
  ).toBeVisible({ timeout: 20000 });
  for (const name of [
    "Documents & Care",
    "Price Adjustments",
    "My Purchases",
  ]) {
    const button = page
      .getByLabel("Insight views", { exact: true })
      .getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await page.waitForLoadState("networkidle");
});
