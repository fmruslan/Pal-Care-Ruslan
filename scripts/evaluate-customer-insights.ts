import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
  type APIResponse,
} from "@playwright/test";
import { z } from "zod";
import { PilotFiles } from "../src/lib/careos/subscription/files";
import {
  sessionSchema,
  subscriptionSession,
} from "../src/lib/careos/subscription/session";
import {
  MODEL,
  REASONING,
  MODEL_REQUEST_BYTES,
  MODEL_TIMEOUT_MS,
} from "../src/lib/careos/model-policy";
import {
  customerPlanSchema,
  type CustomerPlan,
} from "../src/lib/intelligence/customer-commands";
import {
  customerAcceptanceRun,
  customerAlertText,
} from "./customer-insights-run";

/**
 * PREPARED ONLY: never CI, a test-server command, or permission to renew anything.
 * No arguments prints preparation without private-file reads or browser/network
 * work. The owner/main session runs --run only after isolated checks, refresh and
 * separate before/after subscription-private-app.ts verify-preservation checks.
 *
 * Five useful actual customer Studio plans; at least six existing slots required.
 * No optional sixth/reset request is spent merely to fill the allowance. A failed
 * task stops the run: no retries, transcript Clear, saved-plan replay, new auth
 * session, allowance/expiry changes, API fallback, direct model or financial call.
 * The original transport's request/time/token accounting remains authoritative;
 * this script never sets max_output_tokens (unsupported on subscription transport).
 */
const ORIGIN = "http://127.0.0.1:3002";
const PLAN_PATH = "/api/intelligence/customer/plan";
const MAX_CALLS = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tasks = [
  { id: "category", message: "Show my saved purchases by category." },
  { id: "documents", message: "Which purchases have documents I can open?" },
  { id: "receipt", message: "Find my verified PayPal headphones receipt." },
  {
    id: "adjustments",
    message:
      "Show only independently verified price adjustments for my purchases.",
  },
  { id: "evidence", message: "Show me the evidence behind that number." },
] as const;
type TaskId = (typeof tasks)[number]["id"];
type Session = z.infer<typeof sessionSchema>;
type Dispatch = {
  message: string;
  requestId?: string;
  forwarded: boolean;
  responded: boolean;
};
type Row = {
  id: string;
  name: string;
  category: string;
  origin: "sample" | "sandbox";
  href: string;
  receiptHref: string | null;
  documents: number;
};
class AcceptanceFailure extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const applicationSchema = z
  .strictObject({
    origin: z.literal(ORIGIN),
    customer: z.string().regex(/^[0-9a-f]{64}$/),
    studio: z.string().regex(/^[0-9a-f]{64}$/),
    expiresAt: z.number().int().positive(),
  })
  .refine((app) => app.customer !== app.studio);
const planRequestSchema = z.strictObject({
  action: z.literal("plan"),
  conversationId: z.uuid(),
  requestId: z.uuid(),
  message: z.string().min(1).max(500),
});
const usageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    cachedTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
  })
  .refine(
    (u) =>
      u.inputTokens + u.outputTokens === u.totalTokens &&
      u.cachedTokens <= u.inputTokens &&
      u.reasoningTokens <= u.outputTokens,
  );
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rowIds = (rows: Row[]) => rows.map((row) => row.id).sort();

function summary(page: Page) {
  return page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: /^Source records & accessible summary/ }),
  });
}
function view(page: Page, name: string) {
  return page
    .getByLabel("Insight views", { exact: true })
    .getByRole("button", { name, exact: true });
}
function widget(page: Page, title: string) {
  return page
    .getByTestId("customer-studio")
    .locator(".ag-studio-layout-widget")
    .filter({
      has: page
        .locator(".ag-studio-layout-widget-title")
        .filter({ hasText: new RegExp(`^${title}$`) }),
    });
}
async function rows(root: Locator): Promise<Row[]> {
  return root.locator("article[data-purchase-id]").evaluateAll((articles) =>
    articles.map((article) => {
      const links = [...article.querySelectorAll<HTMLAnchorElement>("a")];
      const identity = links.find((link) =>
        link.pathname.startsWith("/vault/"),
      );
      const paragraphs = [...article.querySelectorAll("p")].map(
        (p) => p.textContent?.trim() ?? "",
      );
      return {
        id: article.getAttribute("data-purchase-id") ?? "",
        name: identity?.textContent?.trim() ?? "",
        category: paragraphs[0].split(" · ")[1],
        origin: article.textContent?.includes("Verified Sandbox purchase")
          ? ("sandbox" as const)
          : ("sample" as const),
        href: identity?.getAttribute("href") ?? "",
        receiptHref:
          links
            .find((link) => link.textContent?.trim().startsWith("Open receipt"))
            ?.getAttribute("href") ?? null,
        documents: Number(
          paragraphs
            .find((p) => /^\d+ saved document/.test(p))
            ?.match(/^\d+/)?.[0] ?? 0,
        ),
      };
    }),
  );
}
async function selection(
  page: Page,
  expected: Row[],
  grid: boolean,
  checkpoint: (name: string) => void = () => undefined,
) {
  checkpoint("source-summary-mounted");
  await expect(summary(page)).toHaveCount(1);
  checkpoint("source-summary-records");
  await expect
    .poll(async () => rowIds(await rows(summary(page))))
    .toEqual(rowIds(expected));
  checkpoint("filter-scope");
  await expect(page.getByLabel("Personal Insights filter scope")).toContainText(
    `${expected.length} purchases in the current Studio selection`,
  );
  const source = page
    .getByTestId("customer-studio")
    .getByTestId("insight-documents-care");
  checkpoint("source-widget-mounted");
  await expect(source).toBeVisible({ timeout: 20000 });
  checkpoint("source-widget-records");
  await expect
    .poll(async () => rowIds(await rows(source)))
    .toEqual(rowIds(expected));
  const kpi = widget(page, "Purchases in this view");
  checkpoint("native-kpi");
  await expect(kpi).toBeVisible();
  if (expected.length) {
    await expect(kpi.locator(".ag-studio-value-widget-content")).toHaveText(
      String(expected.length),
    );
  } else {
    await expect
      .poll(
        async () =>
          (
            await kpi
              .locator(".ag-studio-value-widget-content")
              .allTextContents()
          )
            .join("")
            .trim() === "0" ||
          (await kpi.locator(".ag-studio-widget-no-data-text").isVisible()),
      )
      .toBe(true);
    await expect(
      summary(page).getByText("No saved purchases match this view.", {
        exact: false,
      }),
    ).toHaveCount(1);
  }
  if (grid && expected.length) {
    checkpoint("native-grid");
    await expect(
      widget(page, "Saved purchases").getByRole("grid"),
    ).toHaveAttribute("aria-rowcount", String(expected.length + 1));
  }
  checkpoint("loading-complete");
  await expect(
    page
      .getByTestId("customer-studio")
      .locator(".ag-studio-layout-widget-loading-overlay-active"),
  ).toHaveCount(0, { timeout: 20000 });
  checkpoint("no-alerts");
  await expect(
    page.getByRole("alert").filter({ hasText: customerAlertText }),
  ).toHaveCount(0);
}

async function main(run: ReturnType<typeof customerAcceptanceRun>) {
  assert.ok(
    !process.env.DEBUG &&
      !process.env.PWDEBUG &&
      !process.env.DEBUG_FILE &&
      !process.env.NODE_DEBUG,
  );
  assert.equal(MODEL, "gpt-6.1-sol");
  assert.equal(REASONING, "medium");
  assert.equal(MODEL_REQUEST_BYTES, 20000);
  assert.equal(MODEL_TIMEOUT_MS, 22000);
  const files = new PilotFiles(
    join(homedir(), ".config/palcare-chatgpt-pilot"),
  );
  // Never provision missing owner state. prepare validates ownership/modes/paths.
  assert.ok((await lstat(files.directory)).isDirectory());
  await files.prepare();
  const project = await realpath(
    fileURLToPath(new URL("../", import.meta.url)),
  );
  assert.ok(
    relative(project, await realpath(files.directory)).startsWith(`..${sep}`),
  );
  await files.locked(async () => {
    const evidence = await open(
      join(files.directory, run.evidence),
      "wx",
      0o600,
    ).catch(() => {
      throw new AcceptanceFailure(
        "customer_insights_evidence_exists_or_unsafe",
      );
    });
    const stat = await evidence.stat();
    assert.ok(
      stat.isFile() &&
        stat.uid === process.getuid?.() &&
        !(stat.mode & 0o077) &&
        stat.nlink === 1,
    );
    // A single exclusive JSON document, appended checkpoint-by-checkpoint. A
    // crash leaves its prefix intact; an existing result is never overwritten.
    await evidence.write(
      '{"version":"customer-insights-acceptance-v1","events":[\n',
    );
    await evidence.sync();
    let eventCount = 0;
    async function record(value: Record<string, unknown>) {
      await evidence.write(
        `${eventCount++ ? ",\n" : ""}${JSON.stringify(value)}`,
      );
      await evidence.sync();
    }
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let baseline: Session | undefined;
    let app: z.infer<typeof applicationSchema> | undefined;
    let immutable: Record<string, string> | undefined;
    let active: Dispatch | undefined;
    let creation: Promise<string | null> | undefined;
    let conversationId: string | undefined;
    const dispatches: Dispatch[] = [];
    const requestIds = new Set<string>();
    let creates = 0;
    let posts = 0;
    let blocked = 0;
    let browserErrors = 0;
    let passed = 0;
    let failed = false;
    let checkpoint = "initial-preflight";
    const began = performance.now();

    async function immutableFile(
      name:
        "application.json" | "preservation.json" | "host.json" | "pilot.json",
    ) {
      const value = await files.read(name);
      if (value === null) return fingerprint(null);
      const metadata = await lstat(join(files.directory, name));
      return fingerprint({
        value,
        inode: metadata.ino,
        size: metadata.size,
        modified: metadata.mtimeMs,
        changed: metadata.ctimeMs,
      });
    }

    async function state(activeWindow = true) {
      const current = activeWindow
        ? await subscriptionSession(files)
        : sessionSchema.parse(await files.read("session.json"));
      if (baseline) {
        assert.equal(current.id, baseline.id);
        assert.equal(current.approvedAt, baseline.approvedAt);
        assert.equal(current.expiresAt, baseline.expiresAt);
        assert.equal(current.requestLimit, baseline.requestLimit);
        assert.equal(current.creditsDisabledConfirmed, true);
        assert.deepEqual(
          current.attempts.slice(0, baseline.attempts.length),
          baseline.attempts,
        );
        const added = current.attempts.slice(baseline.attempts.length);
        assert.ok(added.length <= MAX_CALLS);
        for (const attempt of added) {
          assert.equal(attempt.scope, "studio");
          assert.equal(attempt.schema, "careos_customer_dashboard");
          assert.ok(
            [...requestIds].some(
              (id) => attempt.key === `studio:${id}:careos_customer_dashboard`,
            ),
          );
        }
      }
      if (immutable) {
        assert.equal(
          await immutableFile("application.json"),
          immutable.application,
        );
        assert.equal(
          await immutableFile("preservation.json"),
          immutable.preservation,
        );
        assert.equal(await immutableFile("host.json"), immutable.host);
        assert.equal(await immutableFile("pilot.json"), immutable.pilot);
      }
      return current;
    }
    async function capture(name: string) {
      assert.ok(page && app && /^[a-z-]+$/.test(name));
      const url = new URL(page.url());
      assert.equal(url.origin, ORIGIN);
      const text = await page.locator("body").innerText();
      assert.ok(!text.includes(app.customer) && !text.includes(app.studio));
      // Twin passports/receipt bodies can contain provider references. Only
      // their non-secret, exact product/document heading is photographed.
      const image =
        url.pathname === "/insights"
          ? await page.screenshot({
              fullPage: false,
              animations: "disabled",
              timeout: 10000,
            })
          : await page
              .getByRole("heading", { level: 1 })
              .screenshot({ animations: "disabled", timeout: 10000 });
      assert.ok(image.length < 10_000_000);
      const handle = await open(
        join(files.directory, run.artifacts, `${name}.png`),
        "wx",
        0o600,
      );
      try {
        await handle.writeFile(image);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    async function checkedReceipt(
      href: string,
      title: string,
      twinHref: string,
    ) {
      assert.ok(page && /^\/documents\/[0-9a-f-]{36}$/i.test(href));
      await page.goto(ORIGIN + href);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(
        page
          .getByRole("main")
          .getByText("Verified Sandbox receipt", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("link", { name: /^Back to / }),
      ).toHaveAttribute("href", twinHref);
    }

    try {
      await record({
        status: "started",
        phase: run.phase,
        staticOnly: run.staticOnly,
        proof: "actual-owner-subscription-app",
        maxModelCalls: MAX_CALLS,
        plannedQuestions: tasks.length,
      });
      await mkdir(join(files.directory, run.artifacts), { mode: 0o700 });
      app = applicationSchema.parse(await files.read("application.json"));
      baseline = await subscriptionSession(files);
      assert.equal(app.expiresAt, baseline.expiresAt);
      if (!run.staticOnly)
        assert.ok(
          baseline.requestLimit - baseline.attempts.length >= MAX_CALLS,
        );
      const preservation = await files.read("preservation.json");
      const host = await files.read("host.json");
      assert.ok(preservation && host);
      immutable = {
        application: await immutableFile("application.json"),
        preservation: await immutableFile("preservation.json"),
        host: await immutableFile("host.json"),
        pilot: await immutableFile("pilot.json"),
      };
      assert.deepEqual(
        applicationSchema.parse(await files.read("application.json")),
        app,
      );
      await state();
      await record({
        status: "preflight",
        usedBefore: baseline.attempts.length,
        unknownsBefore: baseline.attempts.filter((a) => a.state === "unknown")
          .length,
        sessionExpires: new Date(baseline.expiresAt).toISOString(),
        remainingBefore: baseline.requestLimit - baseline.attempts.length,
        originalTransportPolicy:
          "unchanged; subscription usage, not API dollars",
      });

      browser = await chromium.launch({ headless: true, timeout: 15000 });
      context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      context.setDefaultTimeout(10000);
      context.setDefaultNavigationTimeout(30000);
      assert.equal((await context.cookies()).length, 0);
      await context.route("**/*", async (route) => {
        try {
          const request = route.request();
          const url = new URL(request.url());
          assert.equal(blocked, 0);
          assert.equal(url.origin, ORIGIN); // No browser OpenAI/PayPal/other provider.
          assert.ok(!url.username && !url.password);
          assert.ok(
            ![...url.searchParams.keys()].some((key) =>
              /token|secret|authorization/i.test(key),
            ),
          );
          assert.ok(
            !/^\/api\/(checkout|operator|guardian|refunds?|payments?)(\/|$)/.test(
              url.pathname,
            ),
          );
          const method = request.method();
          if (method === "GET" || method === "HEAD") {
            if (url.pathname.startsWith("/api/")) {
              if (url.pathname === PLAN_PATH) {
                assert.ok(conversationId);
                assert.deepEqual(
                  [...url.searchParams.entries()],
                  [["conversationId", conversationId]],
                );
              } else
                assert.ok(
                  ["/api/health", "/api/ready", "/api/ai/evaluation"].includes(
                    url.pathname,
                  ) ||
                    /^\/api\/careos\/conversations\/[0-9a-f-]{36}$/.test(
                      url.pathname,
                    ),
                );
            }
            await route.continue();
            return;
          }
          assert.equal(method, "POST"); // No Clear/DELETE or other mutation.
          assert.equal(run.staticOnly, false);
          assert.equal(url.pathname, PLAN_PATH);
          assert.equal(url.search, "");
          assert.ok(active && !active.forwarded && page);
          const body = request.postDataJSON();
          if (body?.action === "start") {
            assert.deepEqual(body, { action: "start" });
            assert.equal(creates++, 0);
            assert.equal(conversationId, undefined);
            creation = page
              .waitForResponse(
                (r) =>
                  r.url() === ORIGIN + PLAN_PATH &&
                  r.request().method() === "POST" &&
                  r.request().postDataJSON()?.action === "start",
                { timeout: 15000 },
              )
              .then(async (response) => {
                assert.equal(response.status(), 201);
                const result = await response.json();
                assert.ok(UUID.test(result.id));
                assert.deepEqual(result.turns, []);
                conversationId = result.id;
                return result.id as string;
              })
              .catch(() => null);
            await route.continue();
            return;
          }
          const input = planRequestSchema.parse(body);
          assert.ok(creation && (await creation));
          assert.equal(input.conversationId, conversationId);
          assert.equal(input.message, active.message);
          assert.ok(!requestIds.has(input.requestId) && posts < tasks.length);
          const current = await state();
          assert.ok(
            current.attempts.length - baseline!.attempts.length < MAX_CALLS,
          );
          assert.ok(current.attempts.length < current.requestLimit);
          active.requestId = input.requestId;
          requestIds.add(input.requestId);
          posts++;
          active.forwarded = true; // Any second POST is rejected, not retried.
          await route.continue(); // Never fulfill, inject, or call the model directly.
        } catch {
          blocked++;
          await route.abort().catch(() => undefined);
        }
      });
      // Controlled direct requests only: readiness, existing scope unlocks and
      // read-only scope status. APIRequestContext does not pass through route().
      const ready = await context.request.get(ORIGIN + "/api/ready", {
        timeout: 10000,
        maxRetries: 0,
        maxRedirects: 0,
      });
      assert.equal(ready.status(), 200);
      const readiness = await ready.json();
      assert.equal(readiness.source, "database");
      assert.equal(readiness.features.careos, "subscription");
      assert.equal(readiness.features.checkout, "disabled");
      assert.equal(readiness.features.guardian, "disabled");
      for (const scope of ["customer", "studio"] as const) {
        await state();
        const unlocked: APIResponse = await context.request.post(
          ORIGIN + "/api/ai/evaluation",
          {
            headers: { Origin: ORIGIN },
            data: { scope, token: app[scope] },
            timeout: 10000,
            maxRetries: 0,
            maxRedirects: 0,
          },
        );
        assert.equal(unlocked.status(), 200);
        const result = await unlocked.json();
        assert.equal(result.authorized, scope);
        assert.equal(Date.parse(result.expiresAt), baseline.expiresAt);
      }
      const accessResponse = await context.request.get(
        ORIGIN + "/api/ai/evaluation",
        {
          timeout: 10000,
          maxRetries: 0,
          maxRedirects: 0,
        },
      );
      assert.equal(accessResponse.status(), 200);
      const access = await accessResponse.json();
      assert.equal(access.window, "active");
      assert.equal(Date.parse(access.expiresAt), baseline.expiresAt);
      assert.deepEqual(access.scopes, { customer: true, studio: true });
      page = await context.newPage();
      page.on("pageerror", () => {
        browserErrors++;
      });
      checkpoint = "static-vault";
      await page.goto(ORIGIN + "/vault");
      assert.deepEqual(
        await page.evaluate(() => ({
          conversation: sessionStorage.getItem("palcare-careos-conversation"),
          pending: sessionStorage.getItem("palcare-careos-pending-v1"),
          insights: sessionStorage.getItem("palcare-insights-pending-v1"),
        })),
        { conversation: null, pending: null, insights: null },
      );
      const saved = page
        .locator(".motion-card")
        .filter({
          has: page.getByRole("heading", { level: 2, name: /headphones/i }),
        })
        .filter({ has: page.getByText("Verified sandbox", { exact: true }) });
      await expect(saved).toHaveCount(1);
      const product = await saved
        .getByRole("heading", { level: 2 })
        .innerText();
      assert.equal(product, "Everyday headphones");
      const twinHref = await saved
        .getByRole("link", { name: /View Twin/ })
        .getAttribute("href");
      assert.ok(twinHref && /^\/vault\/[0-9a-f-]{36}$/i.test(twinHref));
      checkpoint = "static-twin-receipt";
      await page.goto(ORIGIN + twinHref);
      const receiptHref = await page
        .getByRole("article", { name: "Purchase Twin passport" })
        .getByRole("link", { name: "View receipt", exact: true })
        .getAttribute("href");
      assert.ok(
        receiptHref && /^\/documents\/[0-9a-f-]{36}$/i.test(receiptHref),
      );
      const receiptTitle = `${product} · sandbox receipt`;
      await checkedReceipt(receiptHref, receiptTitle, twinHref);
      await capture("receipt-title-before");
      checkpoint = "static-insights-records";
      await page.goto(ORIGIN + "/insights");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Personal Purchase Intelligence",
      );
      await expect(
        page.getByRole("combobox", { name: "Appearance" }),
      ).toBeEnabled();
      await expect(
        page.getByText(/newest 100 saved purchase window/),
      ).toBeVisible();
      await expect(
        page.getByText("bundled sample preview", { exact: false }),
      ).toHaveCount(0);
      const initial = page.getByTestId("insight-source-records");
      await expect(initial).toHaveCount(1);
      const records = await rows(initial);
      assert.ok(
        records.length && records.some((row) => row.origin === "sample"),
      );
      const verifiedHeadphones = records.filter(
        (row) => row.origin === "sandbox" && /headphones/i.test(row.name),
      );
      assert.equal(verifiedHeadphones.length, 1);
      assert.equal(verifiedHeadphones[0].href, twinHref);
      assert.equal(verifiedHeadphones[0].receiptHref, receiptHref);
      checkpoint = "static-secondary-links";
      await page
        .locator("summary")
        .filter({ hasText: /^Explore$/ })
        .click();
      const aftercare = page.getByRole("navigation", {
        name: "More to explore",
      });
      assert.deepEqual(
        await aftercare
          .getByRole("link")
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href")),
          ),
        ["/shop", "/guardian", "/safety", "/replacements"],
      );
      await page
        .locator("summary")
        .filter({ hasText: /^Explore$/ })
        .click();
      checkpoint = "static-workspace-mount";
      await page
        .getByRole("button", {
          name: "Explore interactive Insights",
          exact: true,
        })
        .click();
      await expect(view(page, "My Purchases")).toBeEnabled({ timeout: 20000 });
      await expect(
        page
          .getByTestId("customer-studio")
          .locator(".ag-studio-chart-widget canvas")
          .first(),
      ).toBeVisible({ timeout: 20000 });
      await selection(page, records, true, (name) => {
        checkpoint = `static-purchases-${name}`;
      });
      checkpoint = "static-mode-disclosure";
      await expect(
        page.getByText("Private live planning requires your Studio scope.", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        page.getByText("scripted planning · no live AI", { exact: false }),
      ).toHaveCount(0);
      // Establish the actual saved zero before asking a model to select it.
      checkpoint = "static-adjustments-view";
      await view(page, "Price Adjustments").click();
      await selection(page, records, false, (name) => {
        checkpoint = `static-adjustments-${name}`;
      });
      checkpoint = "static-adjustment-zero";
      await expect(
        page
          .getByTestId("insight-adjustments")
          .getByText("$0.00", { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("insight-adjustments")).toContainText(
        "No recorded adjustment cases",
      );
      await view(page, "My Purchases").click();
      await selection(page, records, true, (name) => {
        checkpoint = `static-return-${name}`;
      });
      assert.equal((await state()).attempts.length, baseline.attempts.length);
      await record({
        status: "static-source-checks-pass",
        availablePurchases: records.length,
        samplePurchases: records.filter((row) => row.origin === "sample")
          .length,
        verifiedHeadphones: 1,
        exactReceiptTitleAndTwin: true,
        aftercareLinksInspected: 4,
        savedAdjustmentZeroObserved: true,
        providerCallDelta: 0,
      });

      for (const task of run.staticOnly ? [] : tasks) {
        checkpoint = `task-${task.id}`;
        const before = await state();
        const started = performance.now();
        await record({
          task: task.id,
          status: "started",
          usedBeforeTask: before.attempts.length,
        });
        const dispatch: Dispatch = {
          message: task.message,
          forwarded: false,
          responded: false,
        };
        dispatches.push(dispatch);
        active = dispatch;
        let response: Response | null = null;
        try {
          await page
            .getByRole("button", { name: "Ask CareOS", exact: true })
            .click();
          const dialog = page.getByRole("dialog", {
            name: "CareOS",
            exact: true,
          });
          await expect(dialog).toContainText(
            "Your purchases · Personal Insights",
          );
          await expect(
            dialog.getByText("Using ChatGPT plan", { exact: true }),
          ).toBeVisible();
          await expect(dialog.locator("article")).toHaveCount(passed);
          const result: Promise<Response | null> = page
            .waitForResponse(
              (r) =>
                r.url() === ORIGIN + PLAN_PATH &&
                r.request().method() === "POST" &&
                r.request().postDataJSON()?.action === "plan" &&
                r.request().postDataJSON()?.message === task.message,
              { timeout: 65000 },
            )
            .catch(() => null);
          await dialog
            .getByLabel("Ask about your purchase", { exact: true })
            .fill(task.message);
          await dialog
            .getByRole("button", { name: "Send to CareOS", exact: true })
            .click();
          response = await result;
          assert.ok(response);
          assert.equal(await response.finished(), null);
          dispatch.responded = true;
          assert.equal(response.status(), 200);
          const plan = customerPlanSchema.parse(await response.json());
          assert.equal(plan.outcome, "apply");
          assert.ok(dispatch.requestId && dispatch.forwarded);
          active = undefined;
          const article = dialog.locator(
            `article[data-request-id="${dispatch.requestId}"]`,
          );
          await expect(article.locator("[data-user-message]")).toHaveText(
            task.message,
          );
          const answer = article.locator("[data-latest-answer]");
          await expect(
            answer.getByText("Live AI · check sources", { exact: true }),
          ).toBeVisible({ timeout: 15000 });
          await expect(
            answer.getByText("Demo response · no live AI", { exact: true }),
          ).toHaveCount(0);
          await expect(dialog.locator("[data-pending-question]")).toHaveCount(
            0,
          );
          await expect(
            dialog.getByRole("alert").filter({ hasText: customerAlertText }),
          ).toHaveCount(0);
          if (task.id === "receipt") {
            const options = answer
              .locator("summary")
              .filter({ hasText: /^More options/ });
            if (await options.count()) await options.click();
            await expect(
              answer.getByRole("link", { name: "Open receipt", exact: true }),
            ).toHaveAttribute("href", receiptHref);
          }
          if (task.id === "adjustments") {
            await expect(answer).toContainText(
              "$0.00 in independently verified Sandbox price adjustments",
            );
            await expect(answer).toContainText(
              "No verified refund is recorded",
            );
          }
          await page
            .getByRole("button", { name: "Close CareOS", exact: true })
            .click();
          await verifyTask(task.id, plan, records, verifiedHeadphones, page);
          const tools = page.getByTestId("customer-studio-tools");
          if (!(await tools.isVisible()))
            await page
              .getByText("How CareOS changed this view", { exact: true })
              .click();
          await expect(tools).toContainText("view_schema → view_page");
          await expect(tools).toContainText(
            "personal_purchase_view → view_page",
          );
          await expect(tools).toContainText(
            "Presentation state read back and checked",
          );
          await capture(task.id);
          const after = await state();
          const added = after.attempts.slice(before.attempts.length);
          // Prompts are never called model requests until the sole journal proves it.
          assert.equal(added.length, 1);
          assert.equal(
            added[0].key,
            `studio:${dispatch.requestId}:careos_customer_dashboard`,
          );
          assert.equal(added[0].state, "completed");
          assert.equal(added[0].summary.status, "completed");
          assert.equal(added[0].summary.model, MODEL);
          const usage = usageSchema.parse(added[0].summary.usage);
          assert.equal(blocked, 0);
          assert.equal(browserErrors, 0);
          await record({
            task: task.id,
            status: "pass",
            elapsedMs: Math.round(performance.now() - started),
            usedBeforeTask: before.attempts.length,
            usedAfterTask: after.attempts.length,
            actualProviderCallDelta: added.length,
            operations: plan.commands.map((command) => command.operation),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            reasoningTokens: usage.reasoningTokens,
            actualSdkToolsAndRenderedScopeChecked: true,
          });
          passed++;
        } catch {
          let usedAfterTask: number | null = null;
          try {
            usedAfterTask = (await state(false)).attempts.length;
          } catch {
            /* Unknown, not zero. */
          }
          await record({
            task: task.id,
            status: "fail",
            elapsedMs: Math.round(performance.now() - started),
            usedBeforeTask: before.attempts.length,
            usedAfterTask,
            observedJournalDelta:
              usedAfterTask === null
                ? null
                : usedAfterTask - before.attempts.length,
            actualProviderCallDelta:
              usedAfterTask === null ||
              (dispatch.forwarded && !dispatch.responded)
                ? null
                : usedAfterTask - before.attempts.length,
            responseComplete: dispatch.responded,
            failure: "customer_insights_task_failed",
          });
          throw new AcceptanceFailure("customer_insights_task_failed");
        } finally {
          active = undefined;
        }
      }
      assert.equal(passed, run.staticOnly ? 0 : tasks.length);
      assert.equal(posts, run.staticOnly ? 0 : tasks.length);
      assert.equal(creates, run.staticOnly ? 0 : 1);
      checkpoint = "final-receipt";
      await checkedReceipt(receiptHref, receiptTitle, twinHref);
      await capture("receipt-title-after");
      await record({
        status: "final-receipt-pass",
        exactTitleAndOriginatingTwin: true,
      });
    } catch {
      failed = true;
      process.exitCode = 1;
      await record({
        status: "stopped",
        failure: "customer_insights_acceptance_failed",
        checkpoint,
        noRetry: true,
      });
      await capture("failure").catch(() => undefined);
    } finally {
      active = undefined;
      try {
        await context?.close();
        await browser?.close();
      } catch {
        failed = true;
      }
      let usedAfter: number | null = null;
      let unknownsAfter: number | null = null;
      let unchanged = false;
      let accountingConfirmed = false;
      try {
        const final = await state(false);
        usedAfter = final.attempts.length;
        unknownsAfter = final.attempts.filter(
          (attempt) => attempt.state === "unknown",
        ).length;
        unchanged = !!baseline && !!immutable;
        accountingConfirmed =
          final.blocked === null &&
          final.expiresAt > Date.now() &&
          dispatches.every(
            (dispatch) => !dispatch.forwarded || dispatch.responded,
          ) &&
          !!baseline &&
          final.attempts
            .slice(baseline.attempts.length)
            .every(
              (attempt) =>
                attempt.state === "completed" &&
                usageSchema.safeParse(attempt.summary.usage).success,
            );
      } catch {
        failed = true;
      }
      if (
        !accountingConfirmed ||
        !unchanged ||
        blocked ||
        browserErrors ||
        passed !== (run.staticOnly ? 0 : tasks.length)
      )
        failed = true;
      const responsePending = dispatches.some(
        (dispatch) => dispatch.forwarded && !dispatch.responded,
      );
      const result = {
        status: failed ? "fail" : "pass",
        phase: run.phase,
        staticOnly: run.staticOnly,
        checkpoint,
        passedTasks: passed,
        usedBefore: baseline?.attempts.length ?? null,
        usedAfter,
        actualProviderCallDelta:
          baseline && usedAfter !== null && !responsePending
            ? usedAfter - baseline.attempts.length
            : null,
        journalObservedAt: new Date().toISOString(),
        responsePending,
        unknownsBefore:
          baseline?.attempts.filter((attempt) => attempt.state === "unknown")
            .length ?? null,
        unknownsAfter,
        sessionExpires: baseline
          ? new Date(baseline.expiresAt).toISOString()
          : null,
        accountingConfirmed,
        originalIdentityExpiryJournalAndManifestsPreserved: unchanged,
        blockedRequests: blocked,
        browserErrors,
        elapsedMs: Math.round(performance.now() - began),
        preservationDatabaseCheck:
          "separate main-session verify-preservation required before and after",
        realDeviceAndHumanAcceptance: "not assessed",
      };
      try {
        await record(result);
        await evidence.write("\n]}\n");
        await evidence.sync();
      } finally {
        await evidence.close();
      }
      console.log(JSON.stringify(result)); // Only bounded counts/status, never raw errors.
      if (failed)
        throw new AcceptanceFailure("customer_insights_acceptance_failed");
    }
  }, ".evaluation-lock");
}

async function verifyTask(
  id: TaskId,
  plan: CustomerPlan,
  records: Row[],
  verified: Row[],
  page: Page,
) {
  if (id === "category") {
    assert.ok(
      plan.commands.some((command) => command.operation === "category"),
    );
    await expect(view(page, "My Purchases")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await selection(page, records, true);
    await expect(widget(page, "Purchases by category")).toHaveClass(
      /ag-studio-layout-widget-selected/,
    );
    const categories = [...new Set(records.map((row) => row.category))].sort();
    const choices = page.getByRole("group", {
      name: "Chart category selection",
    });
    assert.deepEqual(
      (await choices.getByRole("button").allTextContents()).sort(),
      categories,
    );
    await choices.getByRole("button", { name: "Audio", exact: true }).click();
    await selection(
      page,
      records.filter((row) => row.category === "Audio"),
      true,
    );
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await selection(page, records, true);
  } else if (id === "documents") {
    assert.ok(
      plan.commands.some((command) => command.operation === "documents"),
    );
    await expect(view(page, "Documents & Care")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await selection(
      page,
      records.filter((row) => row.documents > 0),
      false,
    );
  } else if (id === "receipt") {
    assert.ok(
      plan.commands.some(
        (command) => command.operation === "find" && command.verifiedOnly,
      ),
    );
    await expect(view(page, "My Purchases")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await selection(page, verified, true);
    assert.equal(verified.length, 1);
    const source = summary(page);
    if (!(await source.evaluate((node) => node.hasAttribute("open"))))
      await source.locator(":scope > summary").click();
    await expect(
      source.getByRole("link", { name: "Open receipt →", exact: true }),
    ).toHaveAttribute("href", verified[0].receiptHref!);
  } else {
    assert.ok(
      plan.commands.some(
        (command) =>
          command.operation ===
          (id === "adjustments" ? "verified-adjustments" : "evidence"),
      ),
    );
    await expect(view(page, "Price Adjustments")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await selection(page, [], false);
    await expect(
      page
        .getByTestId("insight-adjustments")
        .getByText("$0.00", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Personal Insights filter scope"),
    ).toContainText("verified adjustments only");
    if (id === "evidence")
      await expect(
        page
          .getByTestId("customer-studio")
          .locator(".ag-studio-layout-widget")
          .filter({ has: page.getByTestId("insight-documents-care") }),
      ).toHaveClass(/ag-studio-layout-widget-selected/);
  }
}

if (process.argv.length === 2) {
  console.log(
    JSON.stringify({
      status: "prepared-not-run",
      origin: ORIGIN,
      command: "pnpm exec tsx scripts/evaluate-customer-insights.ts --run",
      diagnosticCommand:
        "pnpm exec tsx scripts/evaluate-customer-insights.ts --diagnose --phase=static-v3",
      continuedCommand:
        "pnpm exec tsx scripts/evaluate-customer-insights.ts --run --phase=continued-v2",
      requiredEnvironment:
        "none; existing protected owner application/session only",
      plannedQuestions: tasks.map((task) => task.id),
      requiredRemainingSlots: MAX_CALLS,
      maximumPlanPosts: tasks.length,
      maximumModelCalls: MAX_CALLS,
      prerequisite:
        "isolated acceptance, private app refresh, separate preservation checks",
      noPrivateFilesBrowserOrNetworkUsed: true,
    }),
  );
} else {
  await Promise.resolve()
    .then(() => customerAcceptanceRun(process.argv.slice(2)))
    .then(main)
    .catch((error: unknown) => {
      // Assertions/Playwright errors may embed documents or request bodies. No raw
      // errors, stacks, response bodies, cookies, scope tokens or provider IDs.
      console.error(
        error instanceof AcceptanceFailure
          ? error.code
          : "customer_insights_preflight_failed",
      );
      process.exitCode = 1;
    });
}
