import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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
async function start(standingLive = false) {
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
        CAREOS_STANDING_AI_ENABLED: standingLive ? "true" : "false",
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
  const temporary = (await context.cookies()).find(
    (v) => v.name === OWNER_COOKIE,
  )!;
  await page.reload();
  await expect(page.locator("code")).toContainText(id);
  await expect(
    page.getByLabel("Browser verification diagnostic"),
  ).toContainText("pending-approval");
  await page
    .getByRole("button", { name: "Finish remembering browser" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "waiting for host approval",
  );
  // A repeated pair from another tab must not replace or renew the proof.
  const repeated = await page.evaluate(async () => {
    const response = await fetch("/api/ai/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pair" }),
    });
    return response.json();
  });
  expect(repeated.id).toBe(id);
  expect(
    (await context.cookies()).find((v) => v.name === OWNER_COOKIE),
  ).toEqual(temporary);
  const owner = new StandingOwner(
    new PilotFiles(join(home, ".config/palcare-standing-owner")),
  );
  await owner.approve(id);
  await expect(
    page.getByLabel("Browser verification diagnostic"),
  ).toContainText("finish-needed", { timeout: 10000 });
  await page
    .getByRole("button", { name: "Finish remembering browser" })
    .click();
  await expect(page.getByText("Remembered", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Browser verification diagnostic"),
  ).toContainText("remembered");
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

test("cookie disappearance after Finish never produces a false success message", async ({
  page,
  context,
}) => {
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  await page
    .getByRole("button", { name: "Remember this browser", exact: true })
    .click();
  const id = (await page.locator("code").textContent())!.match(
    /[a-f0-9-]{36}$/,
  )![0];
  const owner = new StandingOwner(
    new PilotFiles(join(home, ".config/palcare-standing-owner")),
  );
  await owner.approve(id);
  // Simulate browser storage loss between a successful mutation and read-back.
  let finished = false;
  await page.route("**/api/ai/owner", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.postDataJSON().action === "finish"
    ) {
      finished = true;
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (finished && request.method() === "GET") {
      await context.clearCookies();
      const headers = await request.allHeaders();
      delete headers.cookie;
      return route.fallback({ headers });
    }
    return route.fallback();
  });
  await page
    .getByRole("button", { name: "Finish remembering browser" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "next request did not confirm",
  );
  await expect(page.getByText("Remembered", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Browser verification diagnostic"),
  ).toContainText("missing-cookie");
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

test("current browser auth gates Send and legacy unsent hello recovers without clearing history or draft", async ({
  page,
}) => {
  // Actual production routes/cookies in an isolated HOME, fictional data and a
  // synthetic provider-status record only. No inference/provider transport.
  await stop();
  await start(true);
  await page.goto(OWNER_ORIGIN + "/dashboard");
  await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
  const input = dialog.getByRole("textbox", {
    name: "Ask about your purchase",
  });
  await input.fill("Keep my current draft");
  await expect(dialog.getByLabel("Browser AI access")).toContainText(
    "not verified yet",
  );
  await expect(
    dialog.getByRole("button", { name: "Send to CareOS" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Find receipt", exact: true }),
  ).toBeDisabled();
  await expect(input).toHaveValue("Keep my current draft");
  await dialog.getByRole("button", { name: "Close CareOS" }).click();
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  await page
    .getByRole("button", { name: "Remember this browser", exact: true })
    .click();
  const id = (await page.locator("code").textContent())!.match(
    /[a-f0-9-]{36}$/,
  )![0];
  const owner = new StandingOwner(
    new PilotFiles(join(home, ".config/palcare-standing-owner")),
  );
  await owner.approve(id);
  await page
    .getByRole("button", { name: "Finish remembering browser" })
    .click();
  await expect(page.getByText("Remembered", { exact: true })).toBeVisible();
  await owner.installPolicy({
    id: randomUUID(),
    approvedAt: Date.now(),
    provider: "chatgpt-subscription",
    model: "gpt-6.1-sol",
    reasoning: "medium",
    origin: OWNER_ORIGIN,
    scopes: ["customer"],
    requestLimit: 300,
    concurrency: 4,
    requestsPerMinute: 30,
    maxRetries: 1,
    creditsDisabledConfirmed: true,
    providerPermissionConfirmed: true,
    historicalJournalHash: "a".repeat(64),
  });
  const provider = new PilotFiles(join(home, ".config/palcare-chatgpt-pilot"));
  await provider.prepare();
  await provider.write("registration.json", {
    format: "palcare-chatgpt-pilot-v1",
    clientId: "synthetic-client",
    subject: "synthetic-owner",
    tokens: {
      accessToken: "synthetic",
      refreshToken: "synthetic",
      idToken: "synthetic",
      nonce: "synthetic",
      scopes: ["openid", "resource.invoke", "chatgpt.tokens.use.direct"],
      savedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    },
  });
  await page.evaluate(() =>
    sessionStorage.setItem(
      "palcare-careos-pending-v1",
      JSON.stringify({
        input: {
          requestId: crypto.randomUUID(),
          twinId: null,
          revision: 0,
          message: "hello",
        },
        context: null,
        conversationId: null,
        createdAt: Date.now(),
      }),
    ),
  );
  await page.goto(OWNER_ORIGIN + "/dashboard");
  await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
  await expect(dialog.locator("[data-unsent-question]")).toContainText("hello");
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await input.fill("What does CareOS do?");
  await expect(
    dialog.getByRole("button", { name: "Send to CareOS" }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Find receipt", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Send to CareOS" }).click();
  await expect(dialog.locator("[data-latest-answer]")).toContainText(
    "not an official PayPal",
  );
  await input.fill("Keep this draft after revocation");
  await owner.revokeSession(id);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog.getByLabel("Browser AI access")).toContainText(
    "not verified yet",
  );
  await expect(
    dialog.getByRole("button", { name: "Send to CareOS" }),
  ).toBeDisabled();
  await expect(input).toHaveValue("Keep this draft after revocation");
  expect((await owner.status({ agent: "" })).used).toBe(0);
});
