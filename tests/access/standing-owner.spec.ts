import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import { isolatedCareEnvironment } from "../helpers/isolated-care-environment";
import {
  StandingOwner,
  OWNER_COOKIE,
  OWNER_ORIGIN,
} from "../../src/lib/careos/standing-owner";
import { submitLanguageTurn } from "../../scripts/north-language-browser";
import {
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import { demoData } from "../../src/lib/demo/fixtures";
import { testRuntimeRoles } from "../helpers/runtime-roles";
import { SUBSCRIPTION_SESSION } from "../../src/lib/careos/subscription/policy";

// Browser HTTPS transport is intercepted to this isolated loopback production
// server. Real routes/storage/cookie behavior, fictional records, zero providers;
// this is NOT proof of live Tailscale/TLS or real-device acceptance.
const local = "http://127.0.0.1:3116";
let home: string;
let server: ChildProcess | undefined;
let roles: Awaited<ReturnType<typeof testRuntimeRoles>> | undefined;
async function start(standingLive = false, conversational = false) {
  if (conversational)
    roles = await testRuntimeRoles(process.env.TEST_DATABASE_URL ?? "");
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
        ...isolatedCareEnvironment,
        PATH: process.env.PATH,
        HOME: home,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        APP_ORIGIN: OWNER_ORIGIN,
        DEMO_DATA_SOURCE: conversational ? "database" : "fixtures",
        DATABASE_URL: roles?.urls.reader ?? "",
        CAREOS_DATABASE_URL: roles?.urls.careos ?? "",
        CAREOS_PROVIDER: conversational ? "subscription" : "fixture",
        CAREOS_OWNER_MODE: "true",
        CAREOS_STANDING_AI_ENABLED: standingLive ? "true" : "false",
        CAREOS_EVALUATION_ENABLED: "false",
        CAREOS_OWNER_PAIRING_ENABLED: "false",
        PALCARE_NORTH_MAIN_ENABLED: conversational ? "true" : "false",
        CAREOS_SUBSCRIPTION_ENABLED: conversational ? "true" : "false",
        CAREOS_SUBSCRIPTION_CREDITS_DISABLED: "true",
        CAREOS_SUBSCRIPTION_SESSION_ID: conversational
          ? SUBSCRIPTION_SESSION
          : "",
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
  await roles?.close();
  roles = undefined;
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

test("recovered browser status enables the real ordinary-language composer while preserving its owned anchor (injected, zero providers)", async ({
  page,
}) => {
  await stop();
  await start(true, true);
  const status = {
    remembered: true,
    browserCompletion: "complete",
    browserAccess: "recovery-active",
    diagnosticId: randomUUID(),
    originalBrowserRevoked: true,
    recoveryActive: true,
    pairing: null,
    policy: "approved",
    revoked: false,
    used: 63,
    remaining: 237,
    unknown: 1,
    liveEnabled: true,
    provider: "Connected; capacity not checked",
    providerBlocked: false,
    requestLimit: 300,
    concurrency: 1,
    requestsPerMinute: 30,
  };
  const ownerPosts: string[] = [];
  await page.route("**/api/ai/owner", async (route) => {
    if (route.request().method() !== "GET") {
      ownerPosts.push(route.request().method());
      return route.abort();
    }
    return route.fulfill({ json: status });
  });
  const conversationId = randomUUID(),
    expiresAt = new Date(Date.now() + 86400000).toISOString();
  const turns: { requestId: string; message: string; answer: unknown }[] = [];
  const posts: {
    requestId: string;
    followupRequestId?: string;
    message: string;
    path: string;
  }[] = [];
  await page.route("**/api/careos/records/conversations", (route) =>
    route.fulfill({ json: { id: conversationId, expiresAt, turns: [] } }),
  );
  await page.route(
    `**/api/careos/records/conversations/${conversationId}`,
    (route) =>
      route.fulfill({ json: { id: conversationId, expiresAt, turns } }),
  );
  await page.route(
    /\/api\/careos\/records\/conversations\/[^/]+\/(turns|interpret)$/,
    async (route) => {
      const input = route.request().postDataJSON();
      const path = new URL(route.request().url()).pathname;
      expect(path).toBe(
        `/api/careos/records/conversations/${conversationId}/interpret`,
      );
      posts.push({ ...input, path });
      const answer = recordsAnswer(
        querySavedRecords(demoData, {
          ...emptyRecordsQuery("2026-11-07"),
          price:
            input.message === "Which have no recorded price?"
              ? "missing"
              : "any",
        }),
        input.revision,
      );
      const turn = {
        requestId: input.requestId,
        message: input.message,
        answer,
      };
      turns.push(turn);
      await route.fulfill({ json: turn });
    },
  );
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  await expect(
    page.getByText("Recovered evaluation browser", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Browser verification diagnostic"),
  ).toContainText("original browser credential remains revoked");
  await page.goto(OWNER_ORIGIN + "/purchases");
  const first = await (
    await submitLanguageTurn(page, "Back to all saved purchases")
  ).json();
  await expect(
    page.locator(
      `[data-native-north-result][data-request-id="${first.requestId}"]`,
    ),
  ).toBeVisible();
  // The page search remains mounted beneath North. Exercise the exact panel
  // follow-up composer that rejected the server's recovery-active status.
  await page.goto(OWNER_ORIGIN + "/dashboard");
  // The composer can mount before asynchronous owned-history restoration.
  // Wait for the actual anchor before submitting its follow-up.
  await expect(
    page.locator(
      `[data-native-north-result][data-request-id="${first.requestId}"]`,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("searchbox", {
      name: "Search products and documents",
      exact: true,
    }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  const composer = dialog.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  await expect(composer).toBeVisible();
  await composer.fill("Which have no recorded price?");
  const send = page.getByRole("button", {
    name: "Send to North Star",
    exact: true,
  });
  await expect(send).toBeEnabled();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname ===
          `/api/careos/records/conversations/${conversationId}/interpret`,
    ),
    send.click(),
  ]);
  expect(response.ok()).toBe(true);
  const second = await response.json();
  const active = page.locator(
    `[data-native-north-result][data-request-id="${second.requestId}"]`,
  );
  await expect(active).toBeVisible();
  await expect(
    page.locator("[data-native-north-result]").filter({ visible: true }),
  ).toHaveCount(1);
  await expect(active).toContainText("Which have no recorded price?");
  await expect(dialog.locator("[data-user-message]")).toHaveText([
    "Back to all saved purchases",
    "Which have no recorded price?",
  ]);
  const missingIds = ["00000000-0000-4000-8000-000000000204"];
  expect(second.answer.recordsResult.query.price).toBe("missing");
  expect(
    second.answer.recordsResult.records.map(
      (record: { id: string }) => record.id,
    ),
  ).toEqual(missingIds);
  await expect
    .poll(() =>
      active
        .locator('[data-records-result] a[href^="/vault/"]')
        .filter({ visible: true })
        .evaluateAll((links) =>
          [
            ...new Set(
              links.map((link) =>
                link.getAttribute("href")!.slice("/vault/".length),
              ),
            ),
          ].sort(),
        ),
    )
    .toEqual(missingIds);
  expect(posts).toHaveLength(2);
  expect(posts[1].message).toBe("Which have no recorded price?");
  expect(posts[1].requestId).not.toBe(first.requestId);
  expect(posts[1].followupRequestId).toBe(first.requestId);
  expect(posts.map((post) => post.path)).toEqual([
    `/api/careos/records/conversations/${conversationId}/interpret`,
    `/api/careos/records/conversations/${conversationId}/interpret`,
  ]);
  expect(ownerPosts).toEqual([]);
});

test("pair once, remember across reload/server restart, logout and deny stolen replay", async ({
  page,
  context,
}) => {
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  await expect(
    page.getByRole("heading", { name: "Pal Care · AI access" }),
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
  for (const [path, heading] of [
    ["/dashboard", "Care for what you own."],
    ["/purchases", "Your products"],
    ["/vault", "Your products"],
    ["/documents", "Your documents"],
    ["/insights", "Insights"],
  ]) {
    await page.goto(OWNER_ORIGIN + path);
    // Streaming can briefly retain the loading main beside the actual page.
    // Wait for its accessible retirement, not unrelated network quiescence.
    const main = page.getByRole("main");
    await expect(main).toHaveCount(1);
    await expect(main).not.toHaveAttribute("aria-busy", "true");
    await expect(main).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
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
});

test("current browser auth gates Send and legacy unsent hello recovers without clearing history or draft", async ({
  page,
}) => {
  // Actual production routes/cookies in an isolated HOME, fictional data and a
  // synthetic provider-status record only. No inference/provider transport.
  await stop();
  await start(true);
  await page.goto(OWNER_ORIGIN + "/dashboard");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "North Star", exact: true });
  const input = dialog.getByRole("textbox", {
    name: "Ask about your purchases",
  });
  await input.fill("Keep my current draft");
  await expect(dialog.getByLabel("Browser AI access")).toContainText(
    "Connect this browser through AI access to ask North. Your draft is kept.",
  );
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeDisabled();
  await input.press("Enter");
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await expect(input).toHaveValue("Keep my current draft");
  await dialog.getByRole("button", { name: "Close North Star" }).click();
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
  await page
    .getByRole("main")
    .getByRole("button", { name: "Explore with North Star", exact: true })
    .click();
  await expect(dialog.locator("[data-unsent-question]")).toContainText("hello");
  await expect(dialog.locator("[data-pending-question]")).toHaveCount(0);
  await input.fill("What does North Star do?");
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeEnabled();
  await expect(input).toBeEditable();
  await dialog.getByRole("button", { name: "Send to North Star" }).click();
  await expect(dialog.locator("[data-latest-answer]")).toContainText(
    "not an official PayPal",
  );
  await input.fill("Keep this draft after revocation");
  await owner.revokeSession(id);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog.getByLabel("Browser AI access")).toContainText(
    "Connect this browser through AI access to ask North. Your draft is kept.",
  );
  await expect(
    dialog.getByRole("button", { name: "Send to North Star" }),
  ).toBeDisabled();
  await expect(input).toHaveValue("Keep this draft after revocation");
  expect((await owner.status({ agent: "" })).used).toBe(0);
});
