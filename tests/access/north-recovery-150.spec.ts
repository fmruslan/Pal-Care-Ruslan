import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  OWNER_COOKIE,
  OWNER_ORIGIN,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import {
  RECOVERY_DEADLINE,
  RECOVERY_EVALUATION,
  RECOVERY_FILE,
  recoveryHistoryHash,
} from "../../src/lib/careos/evaluation-recovery";
import { campaignBudget } from "../../src/lib/careos/campaign-execution";
import { applyNorthRecoveryFallback } from "../../scripts/north-recovery-fallback";
import {
  submitLanguageTurn,
  verifyLanguageHistory,
} from "../../scripts/north-language-browser";
import { createNorth150App } from "../helpers/north150-app";
import {
  north150Fixture,
  north150Token,
  north150OldToken,
} from "../helpers/north150-fixture";

// Actual built Next routes, browser UI, restricted test DB, subscription SSE
// adapter and owner ledger. ONLY provider bytes/time are synthetic. Not live
// provider/HTTPS/release evidence, and never a production credential recovery.
test.setTimeout(120000);
let app: Awaited<ReturnType<typeof createNorth150App>> | undefined;
let fixture: Awaited<ReturnType<typeof north150Fixture>> | undefined;
let originalDocument: string;
let originalOwner: string;

async function installSyntheticCookies(
  page: Page,
  token: string,
  recordsToken: string,
) {
  const url = OWNER_ORIGIN + "/__north150-synthetic-agent";
  let agent = "";
  await page.route(url, async (route) => {
    agent = (await route.request().allHeaders())["user-agent"];
    // Native Set-Cookie parsing preserves __Host host-only semantics in every
    // engine; no fixture identity is issued by a production auth endpoint.
    await route.fulfill({
      contentType: "text/html",
      headers: {
        "set-cookie": `${OWNER_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict\npalcare-records=${recordsToken}; Path=/; Secure; HttpOnly; SameSite=Strict`,
      },
      body: "<!doctype html><title>Synthetic fixture origin</title>",
    });
  });
  await page.goto(url);
  await page.unroute(url);
  expect(agent).not.toBe("");
  return agent;
}

async function ownerStatus(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/ai/owner");
    if (!response.ok) throw Error(`owner status ${response.status}`);
    return response.json();
  });
}
async function ledger() {
  return (await fixture!.files.read("owner-state.json")) as OwnerState;
}
async function preservation() {
  const state = await ledger();
  expect(
    await readFile(join(fixture!.files.directory, RECOVERY_FILE), "utf8"),
  ).toBe(originalDocument);
  expect(state.policy).toEqual(fixture!.state.policy);
  expect(state.evaluation).toEqual(fixture!.state.evaluation);
  expect(state.sessions).toEqual(fixture!.state.sessions);
  expect(state.events.slice(0, 785)).toEqual(fixture!.state.events);
  expect(
    state.events.filter((e) => e.kind === "reserve" && !e.allocationId),
  ).toHaveLength(274);
  expect(
    state.events.filter((e) => e.kind === "unknown" && !e.allocationId),
  ).toHaveLength(1);
}
async function historyReadback(page: Page) {
  for (const original of fixture!.doc.binding.history) {
    const result = await page.evaluate(async (id) => {
      const response = await fetch(`/api/careos/records/conversations/${id}`);
      if (!response.ok) throw Error(`owned history ${response.status}`);
      return response.json();
    }, original.conversationId);
    expect(result.turns).toHaveLength(original.turnCount);
    expect(recoveryHistoryHash(result.turns)).toBe(original.turnsHash);
  }
}
async function approveAndRestart(page: Page) {
  await page.goto("about:blank");
  await app!.stop();
  await fixture!.approveSyntheticContinuation();
  // The REAL transition must write only its one-shot record, not any original
  // owner/grant bytes. No fake status or interpretation route is installed.
  expect(
    await readFile(join(fixture!.files.directory, "owner-state.json"), "utf8"),
  ).toBe(originalOwner);
  await preservation();
  await app!.start();
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  await expect(
    page.getByText("Recovered evaluation browser", { exact: true }),
  ).toBeVisible();
  expect(await ownerStatus(page)).toMatchObject({
    browserAccess: "recovery-active",
    recoveryActive: true,
    originalBrowserRevoked: true,
    requestLimit: 150,
    used: 63,
    remaining: 87,
    unknown: 1,
    standingAllocation: { used: 274, remaining: 26 },
    campaign: {
      historicalLimit: 300,
      executionLimit: 150,
      historicalRemaining: 237,
      baselineUsed: 63,
      maxAdditional: 87,
      held: 0,
      availableForNewQuestion: 87,
      questionActive: false,
    },
    evaluation: { id: RECOVERY_EVALUATION, expiresAt: RECOVERY_DEADLINE },
  });
}

test.beforeEach(async ({ context, page }) => {
  app = await createNorth150App();
  // Bind the actual request UA, not about:blank's engine-dependent navigator
  // default. This page is fulfilled locally, with no application/provider call.
  const agent = await installSyntheticCookies(
    page,
    north150Token,
    app.recordsToken,
  );
  fixture = await north150Fixture({
    home: app.home,
    agent,
    recordsToken: app.recordsToken,
    clock: app.clock,
    release: app.release,
    ciReceiptHash: app.ciReceiptHash,
    pool: app.pool,
    fallbackManifestHash: app.fallbackManifestHash,
  });
  originalDocument = await readFile(
    join(fixture.files.directory, RECOVERY_FILE),
    "utf8",
  );
  originalOwner = await readFile(
    join(fixture.files.directory, "owner-state.json"),
    "utf8",
  );
  expect(fixture.doc.challenge!.createdAt + 1).toBe(fixture.doc.audit[1].at);
  expect(fixture.state.events).toHaveLength(785);
  await context.addInitScript(
    ({ epoch, wallStarted }) => {
      const NativeDate = Date;
      const elapsed = Math.max(0, NativeDate.now() - wallStarted);
      const started = performance.now();
      const now = () =>
        epoch + elapsed + Math.floor(performance.now() - started);
      globalThis.Date = new Proxy(NativeDate, {
        construct(target, args) {
          return Reflect.construct(target, args.length ? args : [now()]);
        },
        apply() {
          return new NativeDate(now()).toString();
        },
        get(target, property) {
          return property === "now" ? now : Reflect.get(target, property);
        },
      });
    },
    { epoch: app.clock.epoch, wallStarted: app.clock.wallStarted },
  );
  // Session cookies avoid the browser's REAL wall-clock expiry. Server checks
  // still enforce the unchanged original deadline against the advancing clock.
  expect(
    (await context.cookies()).find((cookie) => cookie.name === OWNER_COOKIE),
  ).toMatchObject({
    value: north150Token,
    secure: true,
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
  });
  await app.route(context, fixture.recordsOwner);
  await app.start();
});
test.afterEach(async ({ context }) => {
  try {
    // Assertions have completed. WebKit can retain cancelled static routes;
    // teardown must not wait forever or leave the isolated server/roles alive.
    await context.unrouteAll({ behavior: "ignoreErrors" });
  } finally {
    await app?.dispose(fixture?.recordsOwner);
    app = undefined;
    fixture = undefined;
  }
});

test("post-stop same synthetic credential → real Send/ledger → native Insights → read-only History → two-stage care → durable fallback denial", async ({
  page,
  context,
  browser,
}) => {
  const registrationBefore = await readFile(
    join(fixture!.provider.directory, "registration.json"),
    "utf8",
  );
  await page.goto(OWNER_ORIGIN + "/dashboard");
  await page
    .getByRole("button", { name: "Ask North Star", exact: true })
    .click();
  const composer = page.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  await composer.fill("Which have no recorded price?");
  await expect(
    page.getByRole("button", { name: "Send to North Star", exact: true }),
  ).toBeDisabled();
  expect(await ownerStatus(page)).toMatchObject({
    remembered: false,
    browserAccess: "cookie-rejected",
    recoveryActive: false,
    used: 63,
    remaining: 87,
  });
  expect(await app!.transport()).toEqual([]);
  await historyReadback(page);
  const cookieBefore = (await context.cookies()).find(
    (c) => c.name === OWNER_COOKIE,
  )!;
  await approveAndRestart(page);
  expect(
    (await context.cookies()).find((c) => c.name === OWNER_COOKIE),
  ).toEqual(cookieBefore);

  // Revoked original token remains invalid even with the correct records/agent.
  const old = await browser.newContext({
    userAgent: await page.evaluate(() => navigator.userAgent),
  });
  try {
    await app!.route(old, fixture!.recordsOwner);
    const oldPage = await old.newPage();
    await installSyntheticCookies(oldPage, north150OldToken, app!.recordsToken);
    await oldPage.goto(OWNER_ORIGIN + "/ai-evaluation");
    expect(await ownerStatus(oldPage)).toMatchObject({
      remembered: false,
      recoveryActive: false,
      originalBrowserRevoked: true,
    });
  } finally {
    await old.unrouteAll({ behavior: "ignoreErrors" });
    await old.close();
  }

  const posts: { path: string; input: Record<string, unknown> }[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path.endsWith("/interpret"))
      posts.push({ path, input: request.postDataJSON() });
  });
  await page.goto(OWNER_ORIGIN + "/dashboard");
  const firstSearch = page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });
  const firstComposer = page.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  await expect(
    firstSearch.or(firstComposer).filter({ visible: true }).first(),
  ).toBeVisible();
  if (await firstSearch.isVisible()) {
    // Empty-star opens North without an ask. The real Send control below then
    // waits for verified access, rather than racing a freshly mounted status GET.
    try {
      await firstSearch.fill("", { timeout: 2000 });
      await page
        .getByRole("button", { name: "Ask North Star", exact: true })
        .click({ timeout: 2000 });
    } catch {
      // The saved workspace may replace Search during hydration. Do not retry
      // an ask or provider request; require that restored composer explicitly.
      await expect(firstComposer).toBeVisible();
    }
  }
  await expect(firstComposer).toBeVisible();
  const firstResponse = await submitLanguageTurn(
    page,
    "Which have no recorded price?",
  );
  expect(firstResponse.ok()).toBe(true);
  const first = await firstResponse.json();
  expect(first.answer.recordsResult.query.price).toBe("missing");
  expect(
    first.answer.recordsResult.records.map((r: { id: string }) => r.id),
  ).toEqual(["00000000-0000-4000-8000-000000000204"]);
  await expect(
    page.locator(
      `[data-native-north-result][data-request-id="${first.requestId}"]`,
    ),
  ).toBeVisible();
  expect(campaignBudget((await ledger()).events)).toMatchObject({
    used: 64,
    held: 0,
    remaining: 86,
  });
  const tail = (await ledger()).events.slice(785);
  expect(tail.map((e) => e.kind)).toEqual([
    "question-open",
    "reserve",
    "completed",
    "question-close",
  ]);
  expect(tail[0].subject).toBe(
    `customer:${first.requestId}:question:${posts[0].path.split("/").at(-2)}`,
  );
  expect(tail[1].subject).toBe(
    `customer:${first.requestId}:north_conversation_v1`,
  );
  expect(tail[1].at).toBeGreaterThan(app!.clock.epoch);

  const beforeReplay = await app!.transport();
  const replay = await page.evaluate(async ({ path, input }) => {
    const conflict = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        message: "Changed message under an already-used UUID",
      }),
    });
    const saved = await fetch(path.replace(/\/interpret$/, ""));
    return { conflict: conflict.status, saved: await saved.json() };
  }, posts[0]);
  expect(replay.conflict).toBe(409);
  expect(
    replay.saved.turns.map((t: { requestId: string }) => t.requestId),
  ).toContain(first.requestId);
  expect(
    await page.evaluate(
      async (id) =>
        (await fetch(`/api/careos/records/conversations/${id}`)).status,
      randomUUID(),
    ),
  ).toBe(404);
  expect(await app!.transport()).toEqual(beforeReplay);

  const chartResponse = await submitLanguageTurn(
    page,
    "Show all Audio purchases as a chart",
  );
  expect(chartResponse.ok()).toBe(true);
  const chart = await chartResponse.json();
  await expect(page).toHaveURL(/\/insights$/);
  const studio = page.getByTestId("customer-studio");
  await expect
    .poll(
      async () => {
        const raw = await studio.getAttribute("data-native-readback");
        return raw ? JSON.parse(raw).requestId : null;
      },
      { timeout: 25000 },
    )
    .toBe(chart.requestId);
  const native = JSON.parse(
    (await studio.getAttribute("data-native-readback"))!,
  );
  expect(native.nativeDisplaysVerified).toBe(true);
  expect(native.state.selectedPageId).toBe("purchases");
  expect(native.recordIds.sort()).toEqual(
    chart.answer.recordsResult.records.map((r: { id: string }) => r.id).sort(),
  );
  const nativeBeforeHistory = await studio.getAttribute("data-native-readback");
  const table = await submitLanguageTurn(
    page,
    "Show all Audio purchases in a table",
  );
  expect(table.ok()).toBe(true);
  const transportBeforeHistory = await app!.transport();
  expect(
    (await verifyLanguageHistory(page, chart.requestId, native.recordIds))
      .attemptedWrites,
  ).toEqual([]);
  expect(await studio.getAttribute("data-native-readback")).toBe(
    nativeBeforeHistory,
  );
  expect(await app!.transport()).toEqual(transportBeforeHistory);

  const care = await submitLanguageTurn(
    page,
    "How do I shut down my Raspberry Pi 5?",
  );
  expect(care.ok()).toBe(true);
  const cared = await care.json();
  expect(cared.answer.steps.join(" ")).toContain("Shutdown");
  expect(cared.answer.sources.length).toBeGreaterThan(0);
  const stages = (await ledger()).events.filter(
    (e) =>
      e.kind === "reserve" &&
      e.subject.startsWith(`customer:${cared.requestId}:`),
  );
  expect(stages.map((e) => e.subject)).toEqual([
    `customer:${cared.requestId}:north_conversation_v1`,
    `customer:${cared.requestId}:careos_care`,
  ]);
  expect(campaignBudget((await ledger()).events)).toMatchObject({
    used: 68,
    held: 0,
    remaining: 82,
  });
  const transport = await app!.transport();
  expect(transport.map((e) => e.kind)).toEqual(Array(5).fill("response"));
  expect(transport.map((e) => e.name)).toEqual([
    "north_conversation_v1",
    "north_conversation_v1",
    "north_conversation_v1",
    "north_conversation_v1",
    "careos_care",
  ]);
  await historyReadback(page);
  await preservation();

  // Actual managed ordering function, injected application switch: no systemctl
  // or old binary. Old 63a877f cannot parse markers and is NOT a valid fallback.
  let switched = false;
  await expect(
    applyNorthRecoveryFallback({
      verifyApplication: async () => {},
      disableRecovery: async () => {
        throw Error("synthetic disable failure");
      },
      switchApplication: async () => {
        switched = true;
      },
    }),
  ).rejects.toThrow("synthetic disable failure");
  expect(switched).toBe(false);
  await applyNorthRecoveryFallback({
    verifyApplication: async () => {
      await preservation();
      await app!.verifyFallback();
    },
    disableRecovery: () =>
      fixture!.owner.disableEvaluationRecovery("north150-injected-fallback"),
    switchApplication: async () => {
      await app!.stop();
      app!.selectFallback();
      await app!.start();
      switched = true;
    },
  });
  expect(switched).toBe(true);
  await page.goto(OWNER_ORIGIN + "/dashboard");
  const searchAfterFallback = page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });
  if (await searchAfterFallback.isVisible()) {
    try {
      await page
        .getByRole("button", { name: "Ask North Star", exact: true })
        .click({ timeout: 2000 });
    } catch {
      // Hydration may restore the existing workspace between the visibility
      // read and click. Require the real composer instead of retrying an ask.
      await expect(
        page.getByRole("textbox", {
          name: "Ask about your purchases",
          exact: true,
        }),
      ).toBeVisible();
    }
  }
  await page
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill("Which have no recorded price?");
  await expect(
    page.getByRole("button", { name: "Send to North Star", exact: true }),
  ).toBeDisabled();
  expect(await ownerStatus(page)).toMatchObject({
    recoveryActive: false,
    used: 68,
    remaining: 82,
  });
  expect(await app!.transport()).toEqual(transport);
  expect(
    await readFile(
      join(fixture!.provider.directory, "registration.json"),
      "utf8",
    ),
  ).toBe(registrationBefore);
  await preservation();
});

test("149 charged with no hold rejects before stage one or expired-token refresh in actual interpretation route", async ({
  page,
}) => {
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  await approveAndRestart(page);
  // Boundary-only SYNTHETIC settled tail; no calls are made to fill capacity.
  // Append valid markers/attempts, retaining every byte of the 785-event prefix.
  await fixture!.files.lockedWaiting(async () => {
    const state = await ledger();
    const conversationId = fixture!.seeded.ids[0];
    const append = (
      kind: OwnerState["events"][number]["kind"],
      subject: string,
    ) =>
      state.events.push({
        id: randomUUID(),
        at: app!.clock.now(),
        kind,
        subject,
        allocationId: RECOVERY_EVALUATION,
        ...(kind === "completed" ? { observation: { httpStatus: 200 } } : {}),
      });
    for (let n = 0; n < 43; n++) {
      const requestId = randomUUID(),
        marker = `customer:${requestId}:question:${conversationId}`;
      append("question-open", marker);
      for (const stage of ["north_conversation_v1", "careos_care"]) {
        append("reserve", `customer:${requestId}:${stage}`);
        append("completed", `customer:${requestId}:${stage}`);
      }
      append("question-close", marker);
    }
    await fixture!.files.write("owner-state.json", state);
  }, ".owner-access-lock");
  // Remove rolling-minute pressure WITHOUT resetting any counters/reservations.
  app!.clock.advance(60001);
  const registration = await fixture!.provider.registration();
  registration!.tokens!.expiresAt = app!.clock.now() - 1;
  await fixture!.provider.write("registration.json", registration);
  const beforeRegistration = await readFile(
    join(fixture!.provider.directory, "registration.json"),
    "utf8",
  );
  const beforeOwner = await readFile(
    join(fixture!.files.directory, "owner-state.json"),
    "utf8",
  );
  expect(campaignBudget((await ledger()).events)).toMatchObject({
    used: 149,
    held: 0,
    remaining: 1,
  });
  const denied = await page.evaluate(async (conversationId) => {
    const response = await fetch(
      `/api/careos/records/conversations/${conversationId}/interpret`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          twinId: null,
          revision: 0,
          message: "Which have no recorded price?",
        }),
      },
    );
    return { status: response.status, body: await response.json() };
  }, fixture!.seeded.ids[0]);
  expect([403, 429]).toContain(denied.status);
  expect(JSON.stringify(denied.body)).toMatch(/quota|campaign/);
  expect(await app!.transport()).toEqual([]);
  expect(
    await readFile(
      join(fixture!.provider.directory, "registration.json"),
      "utf8",
    ),
  ).toBe(beforeRegistration);
  expect(
    await readFile(join(fixture!.files.directory, "owner-state.json"), "utf8"),
  ).toBe(beforeOwner);
  await preservation();
});
