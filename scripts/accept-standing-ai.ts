import assert from "node:assert/strict";
import { open } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import {
  OWNER_COOKIE,
  OWNER_ORIGIN,
  StandingOwner,
} from "../src/lib/careos/standing-owner";
import { subscriptionFiles } from "../src/lib/careos/subscription/provider";
import {
  discoverModel,
  safeFailure,
} from "../src/lib/careos/subscription/pilot";
import { TOKEN, RESOURCE } from "../src/lib/careos/subscription/auth";
import { REFERENCE_TWIN, referenceSource } from "../src/lib/careos/knowledge";

// Explicit owner-run, one-shot real HTTPS acceptance. Never a CI command.
// No arguments performs no private reads/network work. Do not repeat a failed
// invocation with another evidence name to bypass a provider/accounting block.
async function main(path: string, probeOnly = false) {
  assert(!process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_DEBUG);
  assert(path.startsWith("/tmp/opencode/") && path.endsWith(".jsonl"));
  const evidence = await open(path, "wx", 0o600);
  const record = async (value: Record<string, unknown>) => {
    await evidence.write(
      JSON.stringify({ at: new Date().toISOString(), ...value }) + "\n",
    );
    await evidence.sync();
  };
  const owner = new StandingOwner(),
    files = subscriptionFiles();
  const before = (await owner.files.read("owner-state.json")) as {
    policy: {
      requestLimit: number;
      concurrency: number;
      requestsPerMinute: number;
      maxRetries: number;
    } | null;
    events: unknown[];
  };
  if (probeOnly) assert.equal(before.policy, null);
  else {
    assert(before.policy);
    assert.equal(before.policy.requestLimit, 300);
    assert.equal(before.policy.concurrency, 4);
    assert.equal(before.policy.requestsPerMinute, 30);
    assert.equal(before.policy.maxRetries, 1);
  }
  const historical = await files.read("session.json");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  let pairId: string | undefined,
    baseline = 0,
    providerPassed = false;
  let refreshes = 0,
    catalogs = 0,
    modelPosts = 0;
  const blocked: string[] = [];
  try {
    await record({ phase: "started", inferenceCeiling: probeOnly ? 0 : 6 });
    await context.route("**/*", async (route) => {
      const r = route.request(),
        url = new URL(r.url());
      const allowedPost =
        url.pathname === "/api/ai/owner" ||
        /^\/api\/careos\/conversations(?:\/[a-f0-9-]+\/turns)?$/.test(
          url.pathname,
        ) ||
        url.pathname === "/api/intelligence/customer/plan";
      if (
        url.origin !== OWNER_ORIGIN ||
        (!["GET", "HEAD"].includes(r.method()) &&
          !(r.method() === "POST" && allowedPost))
      ) {
        blocked.push(`${r.method()} ${url.pathname}`);
        return route.abort();
      }
      if (
        r.method() === "POST" &&
        (url.pathname.endsWith("/turns") ||
          (url.pathname === "/api/intelligence/customer/plan" &&
            r.postDataJSON().action === "plan"))
      ) {
        if (probeOnly) {
          blocked.push("preflight-inference-forbidden");
          return route.abort();
        }
        const used = (await owner.status({ agent: "" })).used;
        if (used - baseline >= 6 || ++modelPosts > 2) {
          blocked.push("acceptance-ceiling");
          return route.abort();
        }
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(OWNER_ORIGIN + "/ai-evaluation");
    await page
      .getByRole("button", { name: "Remember this browser", exact: true })
      .click();
    pairId = (await page.locator("code").textContent())!.match(
      /[a-f0-9-]{36}$/,
    )![0];
    execFileSync(
      "pnpm",
      ["exec", "tsx", "scripts/standing-owner.ts", "approve-browser", pairId],
      { stdio: "pipe" },
    );
    await page
      .getByRole("button", { name: "Finish remembering browser", exact: true })
      .click();
    await expect(page.getByText("Remembered", { exact: true })).toBeVisible();
    const cookie = (await context.cookies()).find(
      (c) => c.name === OWNER_COOKIE,
    )!;
    assert(cookie.secure && cookie.httpOnly && cookie.sameSite === "Strict");
    const proof = {
      token: cookie.value,
      agent: await page.evaluate(() => navigator.userAgent),
    };
    await owner.authenticate(proof);
    baseline = (await owner.status(proof)).used;
    if (!probeOnly) {
      await owner.assertDispatch(proof, "customer", true);
      await owner.assertHistoricalJournal(historical);
    }
    await record({ phase: "owner-verified", origin: OWNER_ORIGIN, baseline });
    // Own supported connection only. No raw tokens/identity or network payload
    // logging. A single necessary refresh + read-only account model catalog.
    await files.lockedWaiting(async () => {
      if (probeOnly) await owner.authenticate(proof);
      else await owner.assertDispatch(proof, "customer", true);
      await discoverModel(files, async (url, init) => {
        if (String(url) === TOKEN) refreshes++;
        else if (String(url) === `${RESOURCE}/models`) catalogs++;
        else throw new Error("unexpected-provider-endpoint");
        return fetch(url, init);
      });
    }, ".lock");
    providerPassed = true;
    await record({
      phase: "provider-checked",
      refreshes,
      catalogs,
      model: "gpt-6.1-sol",
      reasoning: "medium",
      paidCredits: "owner-attested off; not machine-inspectable",
      paidFallback: false,
    });
    if (probeOnly) {
      assert.deepEqual(await files.read("session.json"), historical);
      assert.equal((await owner.status(proof)).used, baseline);
      await record({
        phase: "preflight-passed",
        refreshes,
        catalogs,
        modelRequests: 0,
      });
      console.log(
        JSON.stringify({
          preflight: "PASS",
          refreshes,
          catalogs,
          modelRequests: 0,
        }),
      );
      return;
    }

    await page.goto(`${OWNER_ORIGIN}/vault/${REFERENCE_TWIN}`);
    await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
    const chatResponse = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/turns$/.test(new URL(r.url()).pathname),
    );
    await dialog
      .getByRole("textbox", { name: "Ask about your purchase" })
      .fill(
        "How do I safely shut down my Raspberry Pi 5 running Raspberry Pi OS?",
      );
    await dialog.getByRole("button", { name: "Send to CareOS" }).click();
    const response = await chatResponse;
    assert.equal(response.status(), 200);
    const turn = await response.json();
    assert.equal(turn.answer.mode, "live");
    assert.equal(turn.answer.outcome, "answered");
    assert.equal(turn.answer.context.twinId, REFERENCE_TWIN);
    assert.match(turn.answer.steps.join(" "), /shutdown|shut.*down/i);
    for (const step of turn.answer.steps)
      assert(referenceSource.content.includes(step));
    assert(
      turn.answer.sources.some(
        (s: { id: string }) => s.id === referenceSource.id,
      ),
    );
    await expect(dialog.locator("[data-latest-answer]")).toContainText(
      "Live AI",
    );
    await record({
      phase: "chat-passed",
      groundedSteps: turn.answer.steps.length,
      used: (await owner.status(proof)).used,
    });
    await dialog.getByRole("button", { name: "Close CareOS" }).click();

    await page.goto(OWNER_ORIGIN + "/insights");
    const studio = page.getByTestId("customer-studio");
    await expect(
      studio.locator(".ag-studio-chart-widget canvas").first(),
    ).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "Ask CareOS", exact: true }).click();
    const planResponse = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname === "/api/intelligence/customer/plan" &&
        r.request().postDataJSON().action === "plan",
    );
    await dialog
      .getByRole("textbox", { name: "Ask about your purchase" })
      .fill("Show only my verified Sandbox purchases.");
    await dialog.getByRole("button", { name: "Send to CareOS" }).click();
    const planned = await planResponse;
    assert.equal(planned.status(), 200);
    const plan = await planned.json();
    assert.equal(plan.outcome, "apply");
    assert(
      plan.commands.some(
        (c: { operation: string; field?: string; value?: string }) =>
          c.operation === "filter" &&
          c.field === "origin" &&
          c.value === "sandbox",
      ),
    );
    await expect(dialog.locator("[data-latest-answer]")).toContainText(
      "Live AI",
      { timeout: 20000 },
    );
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close CareOS" }).click();
    const summary = page.locator("details").filter({
      has: page
        .locator("summary")
        .filter({ hasText: /^Source records & accessible summary/ }),
    });
    await expect(summary.locator("article[data-purchase-id]")).toHaveCount(1);
    await expect(summary.locator("article[data-purchase-id]")).toHaveAttribute(
      "data-purchase-id",
      "21301174-dcfa-4e19-b5cc-18f21e745700",
    );
    const widget = (title: string) =>
      studio.locator(".ag-studio-layout-widget").filter({
        has: page
          .locator(".ag-studio-layout-widget-title")
          .filter({ hasText: new RegExp(`^${title}$`) }),
      });
    await expect(widget("Saved purchases").getByRole("grid")).toHaveAttribute(
      "aria-rowcount",
      "2",
    );
    await expect(
      widget("Purchases in this view").locator(
        ".ag-studio-value-widget-content",
      ),
    ).toHaveText("1");
    await expect(
      page.getByLabel("Personal Insights filter scope"),
    ).toContainText("1 purchases in the current Studio selection");
    await record({
      phase: "insights-passed",
      actualSdkExecutionAndReadback: true,
      scopedPurchases: 1,
      nativeGridRows: 1,
      nativeKpi: 1,
      used: (await owner.status(proof)).used,
    });
    await page.goto(OWNER_ORIGIN + "/ai-evaluation");
    await expect(page.getByText("Remembered", { exact: true })).toBeVisible();
    const final = await owner.status(proof);
    assert(
      final.used > baseline &&
        final.used - baseline <= 6 &&
        final.unknown === 0,
    );
    await expect(
      page.getByText(
        `${final.used} used · ${final.remaining} approved requests remaining · 0 unknown/reserved`,
        { exact: true },
      ),
    ).toBeVisible();
    assert.deepEqual(await files.read("session.json"), historical);
    assert.deepEqual(blocked, []);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByText("Not verified", { exact: true })).toBeVisible();
    await context.addCookies([cookie]);
    await page.reload();
    await expect(page.getByText("Not verified", { exact: true })).toBeVisible();
    await record({
      phase: "passed",
      used: final.used,
      remaining: final.remaining,
      unknown: final.unknown,
      refreshes,
      catalogs,
      revokedTestBrowser: true,
      originalOwnerBrowserUnchanged: true,
      financialCalls: 0,
    });
    console.log(
      JSON.stringify({
        acceptance: "PASS",
        used: final.used,
        remaining: final.remaining,
        refreshes,
        catalogs,
      }),
    );
  } catch (error) {
    if (!providerPassed) await owner.blockProvider();
    const status = await owner.status({ agent: "" });
    await record({
      phase: "failed-stop-no-replay",
      errorCode: safeFailure(error),
      providerPassed,
      used: status.used,
      remaining: status.remaining,
      refreshes,
      catalogs,
    });
    throw new Error(
      "Standing acceptance stopped; inspect the retained checkpoint evidence. No automatic rerun.",
    );
  } finally {
    if (pairId) await owner.revokeSession(pairId);
    await context.unrouteAll({ behavior: "wait" });
    await browser.close();
    await evidence.close();
  }
}
if (["--run", "--check-provider"].includes(process.argv[2]) && process.argv[3])
  await main(process.argv[3], process.argv[2] === "--check-provider");
else
  console.log(
    "Prepared only. Explicit owner-approved --run /tmp/opencode/.../unique.jsonl required. No provider work performed.",
  );
