import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  OWNER_COOKIE,
  OWNER_ORIGIN,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import type { CareTurn } from "../../src/lib/careos/contracts";
import { recoveryHistoryHash } from "../../src/lib/careos/evaluation-recovery";
import { applyNorthRecoveryFallback } from "../../scripts/north-recovery-fallback";
import {
  submitLanguageTurn,
  verifyLanguageHistory,
  selectLanguageHistory,
} from "../../scripts/north-language-browser";
import { north150Hash } from "../helpers/north150-fixture";
import { widgetDefinition } from "../../src/lib/intelligence/customer-state";
import { malformedGuideSteps } from "../fixtures/product-guide-prose";
import type { AgReportState } from "ag-studio";
import {
  createProviderFailureRecoveryFixture,
  type ProviderFailureRecoveryFixture,
} from "../helpers/provider-failure-recovery-fixture";
import {
  createProviderFailureRecoveryApp,
  installProviderRecoveryCookies,
  type RecoveryTransportMode,
} from "../helpers/provider-failure-recovery-app";

// Matrix F: real built Next routes/SDK/isolated restricted test DB;
// synthetic provider/time only. All three engines come from the existing access
// config (workers1/retries0). NOT actual provider/private-HTTPS/live acceptance.
test.setTimeout(120000);

type App = Awaited<ReturnType<typeof createProviderFailureRecoveryApp>>;

type AccessFixture = Omit<ProviderFailureRecoveryFixture, "budget"> & {
  recordsOwner: string;
  budget: () => Promise<{
    used: number;
    limit: number;
    remaining: number;
    held: number;
  }>;
};

let app: App | undefined;
let fixture: AccessFixture | undefined;
let originalProvider: string;
let originalRecovery: string;

async function ledger() {
  return JSON.parse(
    await readFile(
      join(app!.home, ".config/palcare-standing-owner/owner-state.json"),
      "utf8",
    ),
  ) as OwnerState;
}

async function status(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/ai/owner");
    if (!response.ok) throw Error(`owner status ${response.status}`);
    return response.json();
  });
}

async function ownerAction(page: Page, action: string) {
  return page.evaluate(async (action) => {
    const response = await fetch("/api/ai/owner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    return { status: response.status, body: await response.json() };
  }, action);
}

async function interpret(page: Page, requestId = randomUUID()) {
  return page.evaluate(
    async ({ conversationId, requestId }) => {
      const response = await fetch(
        `/api/careos/records/conversations/${conversationId}/interpret`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId,
            twinId: null,
            revision: 0,
            message: "Which have no recorded price?",
          }),
        },
      );
      return { status: response.status, body: await response.json() };
    },
    { conversationId: fixture!.failedConversationId, requestId },
  );
}

async function preservation() {
  const state = await ledger();
  for (const field of [
    "policy",
    "evaluation",
    "quotaCampaign",
    "quotaCampaignExtension",
    "northGuideCampaign",
    "northGuideRecordsBinding",
  ] as const)
    expect(state[field]).toEqual(fixture!.original[field]);
  expect(state.events.slice(0, fixture!.original.events.length)).toEqual(
    fixture!.original.events,
  );
  expect(state.sessions.slice(0, fixture!.original.sessions.length)).toEqual(
    fixture!.original.sessions,
  );
  expect(
    state.events.filter(
      (event) => event.kind === "reserve" && !event.allocationId,
    ),
  ).toHaveLength(283);
  expect(
    state.events.filter(
      (event) => event.kind === "unknown" && !event.allocationId,
    ),
  ).toHaveLength(1);
  expect(
    await readFile(
      join(app!.home, ".config/palcare-chatgpt-pilot/registration.json"),
      "utf8",
    ),
  ).toBe(originalProvider);
  expect(
    await readFile(
      join(
        app!.home,
        ".config/palcare-standing-owner/evaluation-recovery.json",
      ),
      "utf8",
    ),
  ).toBe(originalRecovery);
}

async function historyGet(page: Page) {
  const provider = await app!.transport();
  const before = await ledger();
  const rows = await app!.pool.query(
    "select id,md5(row_to_json(r)::text) hash from care_requests r where conversation_id=$1 order by id",
    [fixture!.failedConversationId],
  );
  const result = await page.evaluate(async (id) => {
    const response = await fetch(`/api/careos/records/conversations/${id}`);
    return { status: response.status, body: await response.json() };
  }, fixture!.failedConversationId);
  expect(result.status).toBe(200);
  const retained = result.body.turns.find(
    (turn: CareTurn) => turn.requestId === fixture!.failedTurn.requestId,
  );
  expect(retained).toEqual(fixture!.failedTurn);
  expect(retained.answer).toMatchObject({
    outcome: "unavailable",
    mode: "deterministic",
    sources: [],
    actions: [],
  });
  expect(recoveryHistoryHash([retained])).toBe(
    recoveryHistoryHash([fixture!.failedTurn]),
  );
  expect(await app!.transport()).toEqual(provider);
  expect(await ledger()).toEqual(before);
  expect(
    (
      await app!.pool.query(
        "select id,md5(row_to_json(r)::text) hash from care_requests r where conversation_id=$1 order by id",
        [fixture!.failedConversationId],
      )
    ).rows,
  ).toEqual(rows.rows);
}

async function installPairApproveFinish(page: Page) {
  const before = await ledger();
  expect(await fixture!.budget()).toMatchObject({
    used: 335,
    limit: 563,
    remaining: 228,
    held: 1,
  });
  await fixture!.install();
  const installed = await ledger();
  expect(installed.events.slice(0, before.events.length)).toEqual(
    before.events,
  );
  expect(installed.sessions).toEqual(before.sessions);
  expect(
    installed.events.slice(before.events.length).map((event) => event.kind),
  ).toEqual([
    "approve-provider-failure-recovery",
    "resolve-provider-failed-question",
  ]);
  expect(await fixture!.budget()).toMatchObject({
    used: 335,
    limit: 563,
    remaining: 228,
    held: 0,
  });
  expect((await interpret(page)).status).toBe(403);
  expect(await app!.transport()).toEqual([]);

  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  const pairResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/ai/owner" &&
      response.request().postDataJSON()?.action === "pair",
  );
  await page
    .getByRole("button", { name: "Remember this browser", exact: true })
    .click();
  const pair = await pairResponse;
  expect(pair.status()).toBe(200);
  const { id } = await pair.json();
  const cookie = (await page.context().cookies(OWNER_ORIGIN)).find(
    (entry) => entry.name === OWNER_COOKIE,
  )!;
  expect(cookie.value).not.toBe(fixture!.revokedToken);
  const pending = await ledger();
  expect(pending.sessions).toHaveLength(before.sessions.length + 1);
  expect(pending.sessions.find((entry) => entry.id === id)).toMatchObject({
    tokenHash: north150Hash(cookie.value),
    expiresAt: fixture!.pinnedExpiresAt,
  });
  expect((await ownerAction(page, "pair")).body).toEqual({ id });
  expect((await ledger()).sessions).toEqual(pending.sessions);
  expect((await interpret(page)).status).toBe(403);
  await fixture!.owner.approve(id);
  expect(await status(page)).toMatchObject({
    browserCompletion: "finish-needed",
  });
  // A host approval without normal browser Finish is NOT inference authority.
  expect((await interpret(page)).status).toBe(403);
  expect(await app!.transport()).toEqual([]);
  expect(
    (await ledger()).events.filter((event) => event.kind === "reserve"),
  ).toEqual(before.events.filter((event) => event.kind === "reserve"));
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(
    page.getByLabel("Browser verification diagnostic"),
  ).toContainText("finish-needed");
  const finishResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/ai/owner" &&
      response.request().postDataJSON()?.action === "finish",
  );
  await page
    .getByRole("button", { name: "Finish remembering browser", exact: true })
    .click();
  const finish = await finishResponse;
  expect(finish.status()).toBe(200);
  const setCookie = (await finish.allHeaders())["set-cookie"];
  const maxAge = Number(/Max-Age=(\d+)/i.exec(setCookie)?.[1]);
  expect(maxAge).toBeGreaterThan(0);
  expect(app!.clock.now() + maxAge * 1000).toBeLessThanOrEqual(
    fixture!.pinnedExpiresAt + 1000,
  );
  expect(await status(page)).toMatchObject({
    remembered: true,
    browserCompletion: "complete",
    used: 335,
    remaining: 228,
    requestLimit: 563,
    maxRetries: 0,
    concurrency: 1,
    standingAllocation: { used: 283, remaining: 17 },
    campaign: { authorized: true, calendarExpiresAt: null },
  });
  const completed = await ledger();
  expect(completed.sessions.find((entry) => entry.id === id)?.expiresAt).toBe(
    fixture!.pinnedExpiresAt,
  );
  expect((await ownerAction(page, "finish")).status).toBe(200);
  expect(await ledger()).toEqual(completed);
  expect(
    (await page.context().cookies(OWNER_ORIGIN)).find(
      (entry) => entry.name === OWNER_COOKIE,
    )?.value,
  ).toBe(cookie.value);
  await preservation();
  return { id, token: cookie.value };
}

test.beforeEach(async ({ context, page }) => {
  app = await createProviderFailureRecoveryApp();
  const agent = await installProviderRecoveryCookies(
    page,
    undefined,
    app.recordsToken,
  );
  const core = await createProviderFailureRecoveryFixture({
    directory: join(app.home, ".config/palcare-standing-owner"),
    providerDirectory: join(app.home, ".config/palcare-chatgpt-pilot"),
    now: app.clock.now,
    release: app.release,
    ciReceiptHash: app.ciReceiptHash,
    ciReceipt: app.ciReceipt,
    agent,
    recordsOwnerDigest: north150Hash(`records-v1:${app.recordsToken}`),
  });
  fixture = {
    ...core,
    recordsOwner: core.recordsOwnerDigest,
    budget: async () => {
      const budget = await core.budget();
      return { ...budget, limit: budget.executionLimit };
    },
  };
  await app.seedFailedTurn(fixture);
  expect(fixture.recordsOwner).toBe(
    north150Hash(`records-v1:${app.recordsToken}`),
  );
  expect(fixture.original.events).toHaveLength(1894);
  expect(fixture.pinnedExpiresAt).toBe(1794989744950);
  await installProviderRecoveryCookies(
    page,
    fixture.revokedToken,
    app.recordsToken,
  );
  originalProvider = await readFile(
    join(app.home, ".config/palcare-chatgpt-pilot/registration.json"),
    "utf8",
  );
  originalRecovery = await readFile(
    join(app.home, ".config/palcare-standing-owner/evaluation-recovery.json"),
    "utf8",
  );
  await app.route(context, fixture.recordsOwner);
  await app.start();
  await page.goto(OWNER_ORIGIN + "/dashboard");
});

test.afterEach(async ({ context }) => {
  try {
    await context.unrouteAll({ behavior: "ignoreErrors" });
  } finally {
    await app?.dispose();
    app = undefined;
    fixture = undefined;
  }
});

test("stopped original proof retains exact owned unavailable GET history without mutations or provider work", async ({
  page,
}) => {
  expect(await status(page)).toMatchObject({
    remembered: false,
    used: 335,
    remaining: 228,
  });
  await historyGet(page);
  expect((await interpret(page)).status).toBe(403);
  for (const action of [
    "approve-provider-failure-recovery",
    "resolve",
    "settle",
    "reset",
  ])
    expect((await ownerAction(page, action)).status).toBe(400);
  expect(await app!.transport()).toEqual([]);
  await preservation();
});

test("host install → normal pair/approve/Finish → Audio native chart → source-backed two-stage Pi care → GET-only previous result", async ({
  page,
}) => {
  await historyGet(page);
  await installPairApproveFinish(page);
  await page.goto(OWNER_ORIGIN + "/insights");
  await expect(
    page.getByRole("button", { name: "Customize layout", exact: true }),
  ).toBeEnabled({ timeout: 25000 });
  const chartResponse = await submitLanguageTurn(
    page,
    "Show all Audio purchases as a chart",
  );
  expect(chartResponse.ok()).toBe(true);
  const chart = await chartResponse.json();
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
    chart.answer.recordsResult.records
      .map((record: { id: string }) => record.id)
      .sort(),
  );
  expect(native.recordIds.length).toBeGreaterThan(0);
  const nativePage = (native.state as AgReportState).pages.find(
    (value) => value.id === "purchases",
  )!;
  expect(nativePage.crossFilter).toBeUndefined();
  expect(nativePage.filter?.page).toEqual([
    {
      field: { id: "purchases.id" },
      model: {
        operator: "OR",
        conditions: chart.answer.recordsResult.records.map(
          (record: { id: string }) => ({
            operator: "equals",
            value: record.id,
          }),
        ),
      },
    },
  ]);
  expect(nativePage.selection).toEqual({
    type: "widget",
    id: "extra-recorded-value-chart",
  });
  const widgets = nativePage.widgets;
  expect(widgets).toBeDefined();
  if (!widgets) throw Error("native widget map is missing");
  for (const widget of [
    "sample-value",
    "sandbox-value",
    "recorded-value-chart",
  ] as const) {
    const id = `extra-${widget}`;
    expect(Object.keys(widgets).filter((key) => key === id)).toEqual([id]);
    // Full known widget definition pins actual type, dataset and field mappings,
    // including the separate provenance totals, not merely an emitted event.
    expect(widgets[id]).toEqual(widgetDefinition(widget));
  }
  const bottom = Math.max(
    0,
    ...Object.entries(nativePage.widgetLayout ?? {})
      .filter(
        ([id]) =>
          ![
            "extra-sample-value",
            "extra-sandbox-value",
            "extra-recorded-value-chart",
          ].includes(id),
      )
      .map(([, layout]) => (layout?.yTrack ?? 0) + (layout?.ySpan ?? 0)),
  );
  expect(nativePage.widgetLayout?.["extra-sample-value"]).toEqual({
    xTrack: 0,
    yTrack: bottom,
    xSpan: 12,
    ySpan: 10,
  });
  expect(nativePage.widgetLayout?.["extra-sandbox-value"]).toEqual({
    xTrack: 12,
    yTrack: bottom,
    xSpan: 12,
    ySpan: 10,
  });
  expect(nativePage.widgetLayout?.["extra-recorded-value-chart"]).toEqual({
    xTrack: 0,
    yTrack: bottom + 10,
    xSpan: 24,
    ySpan: 24,
  });
  const nativeBefore = await studio.getAttribute("data-native-readback");
  const table = await submitLanguageTurn(
    page,
    "Show all Audio purchases in a table",
  );
  expect(table.ok()).toBe(true);
  const beforePrevious = await app!.transport();
  expect(
    (await verifyLanguageHistory(page, chart.requestId, native.recordIds))
      .attemptedWrites,
  ).toEqual([]);
  expect(await app!.transport()).toEqual(beforePrevious);
  expect(await studio.getAttribute("data-native-readback")).toBe(nativeBefore);
  const guideResponse = await submitLanguageTurn(
    page,
    "How do I find a receipt in Pal Care?",
  );
  expect(guideResponse.ok()).toBe(true);
  const guide = await guideResponse.json();
  expect(guide.answer.conversationPlan.task).toBe("guidance");
  expect(guide.answer.recordsPresentation).toBeUndefined();
  expect(await studio.getAttribute("data-native-readback")).toBe(nativeBefore);
  const careResponse = await submitLanguageTurn(
    page,
    "How do I shut down my Raspberry Pi 5?",
  );
  expect(careResponse.ok()).toBe(true);
  const care = await careResponse.json();
  expect(care.answer.steps.join(" ")).toContain("Shutdown");
  expect(care.answer.sources.length).toBeGreaterThan(0);
  expect(care.answer.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000501",
        href: "https://www.raspberrypi.com/documentation/computers/getting-started.html#shutdown",
      }),
    ]),
  );
  expect(
    (await ledger()).events
      .filter(
        (event) =>
          event.kind === "reserve" &&
          event.subject.startsWith(`customer:${care.requestId}:`),
      )
      .map((event) => event.subject),
  ).toEqual([
    `customer:${care.requestId}:north_conversation_v1`,
    `customer:${care.requestId}:careos_care`,
  ]);
  const transport = await app!.transport();
  expect(transport.map((entry) => entry.name)).toEqual([
    "north_conversation_v1",
    "north_conversation_v1",
    "north_conversation_v1",
    "north_conversation_v1",
    "careos_care",
  ]);
  expect(await fixture!.budget()).toMatchObject({
    used: 340,
    remaining: 223,
    held: 0,
  });
  expect(
    (
      await selectLanguageHistory(
        page,
        chart.requestId,
        "Show all Audio purchases as a chart",
        native.recordIds,
      )
    ).attemptedWrites,
  ).toEqual([]);
  expect(await studio.getAttribute("data-native-readback")).toBe(nativeBefore);
  expect(await app!.transport()).toEqual(transport);
  await historyGet(page);
  await preservation();
});

test("exact malformed historical guide keeps PostgreSQL fingerprint/row and restores by owned GET before/after normal admission without dispatch", async ({
  page,
}) => {
  const saved = await app!.seedMalformedGuide();
  const transportBefore = await app!.transport();
  const ownerBefore = await ledger();
  async function restoreAndRead() {
    const attemptedWrites: string[] = [];
    const getPaths: string[] = [];
    const guard: Parameters<Page["route"]>[1] = async (route) => {
      const request = route.request();
      if (!["GET", "HEAD"].includes(request.method())) {
        attemptedWrites.push(
          `${request.method()} ${new URL(request.url()).pathname}`,
        );
        await route.abort("blockedbyclient");
        return;
      }
      if (request.method() === "GET")
        getPaths.push(new URL(request.url()).pathname);
      await route.fallback();
    };
    await page.route("**/*", guard);
    try {
      const fetched = await page.evaluate(async (id) => {
        const response = await fetch(`/api/careos/records/conversations/${id}`);
        return { status: response.status, body: await response.json() };
      }, saved.conversationId);
      expect(fetched.status).toBe(200);
      expect(fetched.body.turns).toEqual([saved.turn]);
      // Browser metadata contains UUID-only ownership hints, NEVER the stored
      // answer or any provider/checkpoint/authentication fields.
      await page.evaluate(
        ({ conversationId, requestId, title }) => {
          const chatId = crypto.randomUUID();
          sessionStorage.setItem(
            "palcare-north-chats-v1",
            JSON.stringify({
              version: 1,
              activeChatId: chatId,
              chats: [
                {
                  id: chatId,
                  title,
                  preview: title,
                  context: null,
                  explicit: false,
                  draft: "",
                  activeResultId: requestId,
                  order: [requestId],
                  dismissed: [],
                  channels: {
                    care: null,
                    records: conversationId,
                    insights: [],
                  },
                  updatedAt: Date.now(),
                },
              ],
            }),
          );
        },
        {
          conversationId: saved.conversationId,
          requestId: saved.turn.requestId,
          title: saved.turn.message,
        },
      );
      await page.goto(OWNER_ORIGIN + "/dashboard");
      const composer = page.getByRole("textbox", {
        name: "Ask about your purchases",
        exact: true,
      });
      if (!(await composer.isVisible()))
        await page
          .getByRole("button", { name: "Explore with North Star", exact: true })
          .click();
      const restored = page
        .locator(`[data-request-id="${saved.turn.requestId}"]`)
        .filter({ visible: true });
      await expect(restored.locator(".careos-answer")).toBeVisible();
      expect(
        await restored.locator("ul.list-disc > li").allTextContents(),
      ).toEqual(malformedGuideSteps.map(({ text }) => text));
      expect(getPaths).toContain(
        `/api/careos/records/conversations/${saved.conversationId}`,
      );
      expect(attemptedWrites).toEqual([]);
      expect(await saved.snapshot()).toEqual(saved.rows);
      expect(await app!.transport()).toEqual(transportBefore);
    } finally {
      await page.unroute("**/*", guard);
    }
  }
  await restoreAndRead();
  expect(await ledger()).toEqual(ownerBefore);
  await historyGet(page); // The original failed/unavailable proof stays essential.
  await installPairApproveFinish(page);
  const admitted = await ledger();
  await restoreAndRead();
  expect(await ledger()).toEqual(admitted);
  expect(await saved.snapshot()).toEqual(saved.rows);
  await historyGet(page);
  await preservation();
});

for (const failure of [
  { mode: "known-usage-503", terminal: "failed", httpStatus: 503 },
  { mode: "known-user-503", terminal: "failed", httpStatus: 503 },
  { mode: "unknown-503", terminal: "unknown", httpStatus: 503 },
  { mode: "partial-stream", terminal: "unknown", httpStatus: 200 },
  { mode: "denied-403", terminal: "unknown", httpStatus: 403 },
] satisfies Array<{
  mode: RecoveryTransportMode;
  terminal: string;
  httpStatus: number;
}>) {
  test(`second provider stop ${failure.mode} charges once, denies old/new proofs and re-pair, and never retries after restart`, async ({
    page,
  }) => {
    const paired = await installPairApproveFinish(page);
    await app!.setTransport(failure.mode);
    const requestId = randomUUID();
    const result = await interpret(page, requestId);
    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: "careos_owner_campaign_question_unsettled",
    });
    const retained = await page.evaluate(async (id) => {
      const response = await fetch(`/api/careos/records/conversations/${id}`);
      return { status: response.status, body: await response.json() };
    }, fixture!.failedConversationId);
    expect(retained.status).toBe(200);
    expect(
      retained.body.turns.find(
        (turn: CareTurn) => turn.requestId === requestId,
      ),
    ).toMatchObject({
      requestId,
      answer: {
        outcome: "unavailable",
        mode: "deterministic",
        sources: [],
        actions: [],
      },
    });
    const state = await ledger();
    const attempts = state.events.filter((event) =>
      event.subject.startsWith(`customer:${requestId}:`),
    );
    expect(attempts.filter((event) => event.kind === "reserve")).toHaveLength(
      1,
    );
    expect(attempts.filter((event) => event.kind === failure.terminal)).toEqual(
      [
        expect.objectContaining({
          observation: expect.objectContaining({
            httpStatus: failure.httpStatus,
          }),
        }),
      ],
    );
    expect(
      attempts.some(
        (event) =>
          event.kind === "completed" ||
          event.subject.endsWith(":careos_care") ||
          event.subject.includes(":retry-"),
      ),
    ).toBe(false);
    expect(
      state.events.filter(
        (event) => event.kind === "disable-provider-failure-recovery",
      ),
    ).toHaveLength(1);
    expect(await fixture!.budget()).toMatchObject({
      used: 336,
      remaining: 227,
      held: 1,
    });
    const transport = await app!.transport();
    expect(transport).toEqual([
      expect.objectContaining({
        kind: "post",
        mode: failure.mode,
        name: "north_conversation_v1",
      }),
    ]);
    expect((await interpret(page)).status).toBe(403);
    expect((await ownerAction(page, "pair")).status).toBe(403);
    await expect(fixture!.install()).rejects.toThrow();
    await installProviderRecoveryCookies(
      page,
      fixture!.revokedToken,
      app!.recordsToken,
    );
    expect((await interpret(page)).status).toBe(403);
    await installProviderRecoveryCookies(page, paired.token, app!.recordsToken);
    await page.goto("about:blank");
    await app!.stop();
    await app!.start();
    await page.goto(OWNER_ORIGIN + "/dashboard");
    expect((await interpret(page)).status).toBe(403);
    expect((await ownerAction(page, "pair")).status).toBe(403);
    expect(await app!.transport()).toEqual(transport);
    expect(await fixture!.budget()).toMatchObject({
      used: 336,
      remaining: 227,
      held: 1,
    });
    await historyGet(page);
    await preservation();
  });
}

test("new-format restart parses full accounting; immutable fallback must durably disable before switch and never POST", async ({
  page,
}) => {
  await installPairApproveFinish(page);
  await page.goto("about:blank");
  await app!.stop();
  await app!.start();
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  expect(await status(page)).toMatchObject({
    remembered: true,
    used: 335,
    remaining: 228,
    requestLimit: 563,
  });
  let switched = false;
  await expect(
    applyNorthRecoveryFallback({
      verifyApplication: () => app!.verifyFallback(),
      disableRecovery: async () => {
        throw Error("synthetic durable disable failure");
      },
      switchApplication: async () => {
        switched = true;
      },
    }),
  ).rejects.toThrow("synthetic durable disable failure");
  expect(switched).toBe(false);
  const order: string[] = [];
  await page.goto("about:blank");
  await applyNorthRecoveryFallback({
    verifyApplication: async () => {
      await app!.verifyFallback();
      order.push("verified");
    },
    disableRecovery: async () => {
      await fixture!.owner.disableEvaluationRecovery(
        "synthetic-provider-failure-fallback",
      );
      expect(
        (await ledger()).events.some(
          (event) => event.kind === "disable-provider-failure-recovery",
        ),
      ).toBe(true);
      order.push("disabled");
    },
    switchApplication: async () => {
      expect(order).toEqual(["verified", "disabled"]);
      await app!.stop();
      app!.selectFallback();
      await app!.start();
      switched = true;
    },
  });
  expect(switched).toBe(true);
  await page.goto(OWNER_ORIGIN + "/dashboard");
  expect(await status(page)).toMatchObject({
    used: 335,
    remaining: 228,
    requestLimit: 563,
    campaign: { authorized: false },
  });
  expect((await interpret(page)).status).toBe(403);
  expect((await ownerAction(page, "pair")).status).toBe(403);
  expect(await app!.transport()).toEqual([]);
  await historyGet(page);
  await preservation();
});

test("original finite pin survives admission/restart; expiry cannot refresh authority or mint a replacement browser", async ({
  page,
}) => {
  await installPairApproveFinish(page);
  app!.clock.advance(fixture!.pinnedExpiresAt - app!.clock.now());
  await page.goto("about:blank");
  await app!.stop();
  await app!.start();
  await page.goto(OWNER_ORIGIN + "/ai-evaluation");
  expect((await interpret(page)).status).toBe(403);
  expect((await ownerAction(page, "finish")).status).toBe(403);
  expect((await ownerAction(page, "pair")).status).toBe(403);
  expect(await app!.transport()).toEqual([]);
  expect(await fixture!.budget()).toMatchObject({ used: 335, remaining: 228 });
  await historyGet(page);
  await preservation();
});
