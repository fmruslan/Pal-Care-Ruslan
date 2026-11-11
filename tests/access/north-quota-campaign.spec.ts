import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createNorth150App } from "../helpers/north150-app";
import {
  north150Fixture,
  north150Hash,
  north150QuotaApproval,
  north150Token,
} from "../helpers/north150-fixture";
import {
  OWNER_ORIGIN,
  OWNER_COOKIE,
  type OwnerState,
} from "../../src/lib/careos/standing-owner";
import {
  RECOVERY_DEADLINE,
  RECOVERY_FILE,
} from "../../src/lib/careos/evaluation-recovery";
import { campaignBudget } from "../../src/lib/careos/campaign-execution";
import {
  submitLanguageTurn,
  verifyLanguageHistory,
} from "../../scripts/north-language-browser";

test.setTimeout(120000);
test("quota-only policy survives historical deadline, uses normal host-approved browser, real native/care stages, and campaign-only revocation", async ({
  context,
  page,
}) => {
  const app = await createNorth150App();
  let f: Awaited<ReturnType<typeof north150Fixture>> | undefined;
  try {
    app.clock.advance(RECOVERY_DEADLINE + 86400000 - app.clock.now());
    const fake = OWNER_ORIGIN + "/__synthetic-quota-fixture";
    let agent = "";
    await page.route(fake, async (route) => {
      agent = (await route.request().allHeaders())["user-agent"];
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Synthetic fixture</title>",
        headers: {
          "set-cookie": `${OWNER_COOKIE}=${north150Token}; Path=/; Secure; HttpOnly; SameSite=Strict\npalcare-records=${app.recordsToken}; Path=/; Secure; HttpOnly; SameSite=Strict`,
        },
      });
    });
    await page.goto(fake);
    await page.unroute(fake);
    f = await north150Fixture({
      home: app.home,
      agent,
      recordsToken: app.recordsToken,
      clock: app.clock,
      release: app.release,
      ciReceiptHash: app.ciReceiptHash,
      pool: app.pool,
      fallbackManifestHash: app.fallbackManifestHash,
    });
    const oldGrant = await readFile(
      join(f.files.directory, RECOVERY_FILE),
      "utf8",
    );
    await f.owner.installQuotaCampaign(await north150QuotaApproval(f));
    await app.route(context, f.recordsOwner);
    await app.start();
    await page.goto(OWNER_ORIGIN + "/ai-evaluation");
    expect(
      await page.evaluate(async () => (await fetch("/api/ai/owner")).json()),
    ).toMatchObject({ remembered: false, recoveryActive: false, used: 63 });
    const paired = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname === "/api/ai/owner",
    );
    await page
      .getByRole("button", { name: "Remember this browser", exact: true })
      .click();
    const pair = await (await paired).json();
    await expect(
      page.getByLabel("Browser verification diagnostic"),
    ).toContainText("pending-approval");
    const cookie = (await context.cookies()).find(
      (c) => c.name === OWNER_COOKIE,
    )!;
    expect(cookie.value).not.toBe(north150Token);
    await f.owner.approve(pair.id);
    const approved = (await f.files.read("owner-state.json")) as OwnerState;
    const approvedBrowser = approved.sessions.find((s) => s.id === pair.id)!;
    expect(approvedBrowser.tokenHash).toBe(north150Hash(cookie.value));
    expect(approvedBrowser.finishedAt).toBeUndefined();
    const checked = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url() === OWNER_ORIGIN + "/api/ai/owner",
    );
    await page
      .getByRole("button", { name: "Check status", exact: true })
      .click();
    const checkedResponse = await checked;
    expect(checkedResponse.status()).toBe(200);
    const current = await checkedResponse.json();
    expect(current).toMatchObject({
      remembered: true,
      browserCompletion: "finish-needed",
      browserAccess: "finish-needed",
      pairing: null,
    });
    // The pending-request Finish button is replaced when this GET clears its
    // pairing ID. Wait for that exact status to render before clicking it.
    await expect(
      page.getByLabel("Browser verification diagnostic"),
    ).toContainText(`Diagnostic: finish-needed · ${current.diagnosticId}`);
    const finished = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url() === OWNER_ORIGIN + "/api/ai/owner" &&
        r.request().postDataJSON()?.action === "finish",
    );
    await page
      .getByRole("button", { name: "Finish remembering browser", exact: true })
      .click();
    const finishResponse = await finished;
    expect(finishResponse.status()).toBe(200);
    expect(await finishResponse.json()).toEqual({ ok: true });
    await expect(page.getByRole("status")).toHaveText(
      "Browser remembered. AI permission is unchanged.",
    );
    await expect(page.getByText("Remembered", { exact: true })).toBeVisible();
    expect(
      (await context.cookies(OWNER_ORIGIN)).find((c) => c.name === OWNER_COOKIE)
        ?.value,
    ).toBe(cookie.value);
    const completed = (await f.files.read("owner-state.json")) as OwnerState;
    expect(completed.sessions).toEqual(
      approved.sessions.map((s) =>
        s.id === pair.id ? { ...s, finishedAt: expect.any(Number) } : s,
      ),
    );
    expect(completed.events.slice(0, approved.events.length)).toEqual(
      approved.events,
    );
    expect(completed.events.slice(approved.events.length)).toEqual([
      expect.objectContaining({ kind: "finish-browser", subject: pair.id }),
    ]);
    await expect(
      page.getByText(/Campaign policy: no fixed calendar expiration/),
    ).toBeVisible();
    const status = await page.evaluate(async () =>
      (await fetch("/api/ai/owner")).json(),
    );
    expect(status).toMatchObject({
      remembered: true,
      browserCompletion: "complete",
      browserAccess: "remembered",
      pairing: null,
      used: 63,
      remaining: 100,
      maxRetries: 0,
      concurrency: 1,
      campaign: {
        authorization: "quota-bounded",
        authorized: true,
        calendarExpiresAt: null,
      },
      evaluation: { expiresAt: null, originalExpiresAt: RECOVERY_DEADLINE },
      standingAllocation: { used: 274, remaining: 26 },
    });
    await page.goto(OWNER_ORIGIN + "/insights");
    // The opener sits below dynamic Studio content. Its visibility alone does
    // not establish native client readiness while that workspace settles.
    await expect(
      page.getByRole("button", { name: "Customize layout", exact: true }),
    ).toBeEnabled({ timeout: 25000 });
    const composer = page.getByRole("textbox", {
      name: "Ask about your purchases",
      exact: true,
    });
    const open = page.getByRole("button", {
      name: "Explore with North Star",
      exact: true,
    });
    await expect(
      open.or(composer).filter({ visible: true }).first(),
    ).toBeVisible();
    if (await open.isVisible()) {
      await open.click();
    }
    await expect(composer).toBeVisible({ timeout: 20000 });
    const first = await submitLanguageTurn(
      page,
      "Which have no recorded price?",
    );
    expect(first.ok()).toBe(true);
    const chart = await submitLanguageTurn(
      page,
      "Show all Audio purchases as a chart",
    );
    expect(chart.ok()).toBe(true);
    const plotted = await chart.json(),
      studio = page.getByTestId("customer-studio");
    await expect
      .poll(
        async () => {
          const raw = await studio.getAttribute("data-native-readback");
          return raw ? JSON.parse(raw).requestId : null;
        },
        { timeout: 25000 },
      )
      .toBe(plotted.requestId);
    const native = JSON.parse(
      (await studio.getAttribute("data-native-readback"))!,
    );
    expect(native.nativeDisplaysVerified).toBe(true);
    expect(native.recordIds.sort()).toEqual(
      plotted.answer.recordsResult.records
        .map((r: { id: string }) => r.id)
        .sort(),
    );
    const care = await submitLanguageTurn(
      page,
      "How do I shut down my Raspberry Pi 5?",
    );
    expect(care.ok()).toBe(true);
    const cared = await care.json();
    expect(cared.answer.steps.join(" ")).toContain("Shutdown");
    expect(cared.answer.sources.length).toBeGreaterThan(0);
    const beforeHistory = await app.transport();
    expect(
      (await verifyLanguageHistory(page, plotted.requestId, native.recordIds))
        .attemptedWrites,
    ).toEqual([]);
    expect(await app.transport()).toEqual(beforeHistory);
    const ledger = (await f.files.read("owner-state.json")) as OwnerState;
    expect(campaignBudget(ledger.events)).toMatchObject({
      used: 67,
      remaining: 96,
      held: 0,
    });
    expect(ledger.policy).toEqual(f.state.policy);
    expect(ledger.evaluation).toEqual(f.state.evaluation);
    expect(ledger.events.slice(0, 785)).toEqual(f.state.events);
    await page.goto(OWNER_ORIGIN + "/ai-evaluation");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Revoke AI permission", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "AI permission revoked",
    );
    expect(await f.owner.quotaCampaignStatus()).toMatchObject({
      active: false,
      used: 67,
      remaining: 96,
    });
    const after = (await f.files.read("owner-state.json")) as OwnerState;
    expect(after.events.some((e) => e.kind === "revoke-policy")).toBe(false);
    expect(after.events.some((e) => e.kind === "revoke-quota-campaign")).toBe(
      true,
    );
    expect(await readFile(join(f.files.directory, RECOVERY_FILE), "utf8")).toBe(
      oldGrant,
    );
  } finally {
    try {
      await context.unrouteAll({ behavior: "ignoreErrors" });
    } finally {
      await app.dispose(f?.recordsOwner);
    }
  }
});
