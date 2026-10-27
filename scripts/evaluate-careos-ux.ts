import assert from "node:assert/strict";
import { lstat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type Response,
} from "@playwright/test";
import { z } from "zod";
import {
  turnSchema,
  type CareTurn,
  type Conversation,
  type TurnInput,
} from "../src/lib/careos/contracts";
import { referenceSource } from "../src/lib/careos/knowledge";
import { PilotFiles } from "../src/lib/careos/subscription/files";
import { sessionSchema } from "../src/lib/careos/subscription/session";

/**
 * PREPARED, NOT LIVE-VERIFIED. Owner review/execution only; never a CI test.
 * Invocation: pnpm exec tsx scripts/evaluate-careos-ux.ts --run
 *
 * Review the six tasks and current UI before running:
 * 1. Hold the first outgoing care request: observe the real optimistic question.
 * 2. Forward that request unchanged: verify genuine Pi shutdown/source wording.
 * 3. Ask one same-Pi follow-up: verify genuine, still-scoped care and sources.
 * 4. From the speaker, request the headphones receipt: require clarification.
 * 5. Check Verified Sandbox, not Sample: checking alone must not send or change
 *    the speaker context. Explicitly continue: new scoped request, same question,
 *    same saved receipt/Twin as independently discovered through the vault UI.
 * 6. Ask for the headphones manual: useful, same-Twin saved-documents action.
 *
 * Exactly two intended inference turns (at most four provider calls under the
 * existing server's two-call/turn contract); three deterministic UI turns.
 * No retries, cap extensions, session resets, Clear, financial actions or Studio.
 * The first pending assertion is CONTROLLED UI proof, not model latency proof.
 * Long atomic scrolling remains injected-test proof; real keyboard/device
 * acceptance is not assessed. No screenshots, traces, video or network logs.
 */
const ORIGIN = "http://127.0.0.1:3002";
const BASE = "/api/careos/conversations";
const EVIDENCE = "ux-acceptance.jsonl";
const MAX_CARE_TURNS = 2;
const MAX_PROVIDER_CALLS = MAX_CARE_TURNS * 2;
const MAX_UI_TURNS = 5;
const QUESTION = "Find my headphones receipt.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Proof = "controlled-ui" | "actual-inference" | "actual-deterministic-ui";
type SafeCode =
  "ux_evidence_exists_or_unsafe" | "ux_task_failed" | "ux_acceptance_failed";
class AcceptanceFailure extends Error {
  constructor(public readonly code: SafeCode) {
    super(code);
  }
}
function gate() {
  let release!: (forward: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
type PlannedTurn = {
  twinId: string;
  message: string;
  live: boolean;
  input?: TurnInput;
  hold?: ReturnType<typeof gate>;
  forwarded?: boolean;
  responded?: boolean;
  response: Promise<Response | null>;
};

async function main() {
  // Protocol debug output could include the scope-unlock body. Fail before reads.
  assert.ok(
    !process.env.DEBUG &&
      !process.env.PWDEBUG &&
      !process.env.DEBUG_FILE &&
      !process.env.NODE_DEBUG,
  );
  const files = new PilotFiles(
    join(homedir(), ".config/palcare-chatgpt-pilot"),
  );
  // Require existing owner provisioning; do not create a new private state root.
  assert.ok((await lstat(files.directory)).isDirectory());
  await files.locked(async () => {
    // Exclusive creation also refuses symlinks, interrupted runs and prior results.
    // Append-only checkpoints: never rewrite quality.json or any previous evidence.
    const evidence = await open(
      join(files.directory, EVIDENCE),
      "wx",
      0o600,
    ).catch(() => {
      throw new AcceptanceFailure("ux_evidence_exists_or_unsafe");
    });
    async function record(value: Record<string, string | number>) {
      await evidence.write(JSON.stringify(value) + "\n");
      await evidence.sync();
    }
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let baseline: z.infer<typeof sessionSchema> | undefined;
    let active: PlannedTurn | undefined;
    const plans: PlannedTurn[] = [];
    const requestIds = new Set<string>(); // In memory only, never a second journal.
    let conversationId: string | undefined;
    let creates = 0;
    let turnPosts = 0;
    let careTurns = 0;
    let blockedRequests = 0;
    let passed = 0;
    let failed = false;
    const started = performance.now();

    async function journal() {
      const session = sessionSchema.parse(await files.read("session.json"));
      if (baseline) {
        assert.equal(session.id, baseline.id);
        assert.equal(session.approvedAt, baseline.approvedAt);
        assert.equal(session.expiresAt, baseline.expiresAt);
        assert.equal(session.requestLimit, baseline.requestLimit);
        assert.equal(session.creditsDisabledConfirmed, true);
        assert.deepEqual(
          session.attempts.slice(0, baseline.attempts.length),
          baseline.attempts,
        );
        const added = session.attempts.slice(baseline.attempts.length);
        assert.ok(added.length <= MAX_PROVIDER_CALLS);
        for (const attempt of added) {
          assert.equal(attempt.scope, "customer");
          assert.ok(
            [...requestIds].some((id) =>
              attempt.key.startsWith(`customer:${id}:`),
            ),
          );
        }
      }
      return session;
    }

    async function task(
      id: string,
      proof: Proof,
      work: () => Promise<CareTurn | void>,
    ) {
      const began = performance.now();
      const before = (await journal()).attempts.length;
      await record({ id, proof, status: "started" });
      try {
        const turn = await work();
        const after = await journal();
        const delta = after.attempts.length - before;
        assert.equal(blockedRequests, 0);
        assert.equal(after.blocked, null);
        if (proof === "actual-inference") {
          assert.ok(delta >= 1 && delta <= 2);
          assert.ok(
            after.attempts.slice(before).every((a) => a.state === "completed"),
          );
        } else assert.equal(delta, 0);
        await record({
          id,
          proof,
          status: "pass",
          elapsedMs: Math.round(performance.now() - began),
          providerCallDelta: delta,
          ...(turn
            ? { outcome: turn.answer.outcome, mode: turn.answer.mode }
            : {}),
        });
        passed++;
        return turn;
      } catch {
        process.exitCode = 1;
        let delta = -1;
        try {
          const observed = await journal();
          if (!plans.some((p) => p.forwarded && !p.responded))
            delta = observed.attempts.length - before;
        } catch {
          // Unknown dispatch/accounting is not zero usage; inspect the sole journal.
        }
        await record({
          id,
          proof,
          status: "fail",
          elapsedMs: Math.round(performance.now() - began),
          providerCallDelta: delta,
        });
        throw new AcceptanceFailure("ux_task_failed");
      }
    }

    try {
      await record({ status: "started", version: "careos-ux-v1" });
      const app = z
        .object({
          origin: z.literal(ORIGIN),
          customer: z.string().regex(/^[0-9a-f]{64}$/),
          expiresAt: z.number().int().positive(),
        })
        .parse(await files.read("application.json"));
      baseline = await journal();
      assert.equal(baseline.blocked, null);
      assert.ok(
        baseline.expiresAt > Date.now() && app.expiresAt === baseline.expiresAt,
      );
      assert.ok(
        baseline.requestLimit - baseline.attempts.length >= MAX_PROVIDER_CALLS,
      );

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
          const method = request.method();
          if (
            method === "POST" &&
            url.pathname.startsWith(`${BASE}/`) &&
            url.pathname.endsWith("/turns")
          )
            turnPosts++;
          assert.equal(blockedRequests, 0);
          assert.equal(url.origin, ORIGIN);
          assert.ok(!url.username && !url.password);
          assert.ok(
            ![...url.searchParams.keys()].some((k) =>
              /token|authorization|secret/i.test(k),
            ),
          );
          // Even provider-read/financial/Studio endpoints are unnecessary here.
          assert.ok(
            !/^\/api\/(checkout|operator|guardian|intelligence)(\/|$)/.test(
              url.pathname,
            ),
          );
          if (method === "GET" || method === "HEAD") {
            if (url.pathname.startsWith(BASE))
              assert.equal(url.pathname, `${BASE}/${conversationId}`);
            await route.continue();
            return;
          }
          assert.equal(method, "POST"); // In particular, no Clear/DELETE.
          if (url.pathname === BASE) {
            assert.equal(creates++, 0);
            assert.equal(conversationId, undefined);
            assert.deepEqual(request.postDataJSON(), {});
            await route.continue();
            return;
          }
          assert.ok(conversationId);
          assert.equal(url.pathname, `${BASE}/${conversationId}/turns`);
          assert.ok(turnPosts <= MAX_UI_TURNS);
          assert.ok(active && requestIds.size < MAX_UI_TURNS);
          const plan = active;
          const input = turnSchema.parse(request.postDataJSON());
          assert.equal(input.twinId, plan.twinId);
          assert.equal(input.message, plan.message);
          assert.equal(input.example, undefined);
          assert.ok(!requestIds.has(input.requestId));
          const session = await journal();
          assert.equal(session.blocked, null);
          assert.ok(session.expiresAt > Date.now());
          if (plan.live) {
            assert.ok(careTurns++ < MAX_CARE_TURNS);
            assert.ok(
              session.attempts.length - baseline!.attempts.length + 2 <=
                MAX_PROVIDER_CALLS,
            );
          }
          requestIds.add(input.requestId);
          plan.input = input;
          active = undefined; // A second POST, replay or automatic retry is denied.
          if (plan.hold && !(await plan.hold.promise)) {
            await route.abort();
            return;
          }
          plan.forwarded = true;
          await route.continue(); // Actual backend response, never fulfill/inject.
        } catch {
          blockedRequests++;
          active?.hold?.release(false);
          await route.abort().catch(() => undefined);
        }
      });

      // These are the only direct application requests: readiness GET and exactly
      // one scope unlock. Token stays in the POST body/HttpOnly cookie, never a URL.
      const ready = await context.request.get(`${ORIGIN}/api/ready`, {
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
      const unlocked = await context.request.post(
        `${ORIGIN}/api/ai/evaluation`,
        {
          headers: { Origin: ORIGIN },
          data: { scope: "customer", token: app.customer },
          timeout: 10000,
          maxRetries: 0,
          maxRedirects: 0,
        },
      );
      assert.equal(unlocked.status(), 200);
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/vault`);
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem("palcare-careos-conversation"),
        ),
        null,
      );
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem("palcare-careos-pending-v1"),
        ),
        null,
      );
      async function twinLink(
        text: RegExp,
        provenance: "Sample" | "Verified sandbox",
      ) {
        const cards = page
          .locator(".motion-card")
          .filter({ has: page.getByRole("heading", { name: text, level: 2 }) })
          .filter({ has: page.getByText(provenance, { exact: true }) });
        await expect(cards).toHaveCount(1);
        const href = await cards
          .getByRole("link", { name: /View Twin/ })
          .getAttribute("href");
        assert.ok(href && /^\/vault\/[0-9a-f-]{36}$/i.test(href));
        return { href, id: href.slice("/vault/".length), card: cards };
      }
      const verified = await twinLink(/headphones/i, "Verified sandbox");
      const sample = await twinLink(/headphones/i, "Sample");
      const speaker = await twinLink(/speaker/i, "Sample");
      const pi = await twinLink(/Raspberry Pi 5/i, "Sample");
      // The provenance badge says Sample; Reference sample is its price placeholder.
      await expect(
        pi.card.getByText("Reference sample", { exact: true }),
      ).toBeVisible();
      assert.notEqual(verified.id, sample.id);
      await page.goto(ORIGIN + verified.href);
      const passport = page.getByRole("article", {
        name: "Purchase Twin passport",
      });
      const receiptHref = await passport
        .getByRole("link", { name: "View receipt", exact: true })
        .getAttribute("href");
      assert.ok(
        receiptHref && /^\/documents\/[0-9a-f-]{36}$/i.test(receiptHref),
      );

      async function openAssistant(href: string) {
        await page.goto(ORIGIN + href);
        await page
          .getByRole("button", { name: "Ask about this product", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByText("Using ChatGPT plan", { exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("link", {
            name: "Manage ChatGPT usage",
            exact: true,
          }),
        ).toHaveAttribute("title", "Private GPT-6.1 Sol · medium reasoning");
        await expect(
          dialog.getByRole("button", { name: "Find receipt", exact: true }),
        ).toBeEnabled();
        return dialog;
      }
      const created = page
        .waitForResponse(
          (r) => r.url() === ORIGIN + BASE && r.request().method() === "POST",
          { timeout: 10000 },
        )
        .catch(() => null);
      const dialog = await openAssistant(pi.href);
      const creation = await created;
      assert.ok(creation && creation.status() === 201);
      const fresh = (await creation.json()) as Conversation;
      assert.ok(UUID.test(fresh.id));
      assert.deepEqual(fresh.turns, []);
      conversationId = fresh.id;
      await expect(dialog.locator("article")).toHaveCount(0);

      function plan(
        twinId: string,
        message: string,
        live: boolean,
        held = false,
      ) {
        assert.equal(active, undefined);
        const planned: PlannedTurn = {
          twinId,
          message,
          live,
          ...(held ? { hold: gate() } : {}),
          response: page
            .waitForResponse(
              (r) =>
                r.url() === `${ORIGIN}${BASE}/${conversationId}/turns` &&
                r.request().method() === "POST" &&
                r.request().postDataJSON()?.requestId ===
                  planned.input?.requestId,
              { timeout: 65000 },
            )
            .catch(() => null),
        };
        active = planned;
        plans.push(planned);
        return planned;
      }
      async function send(planned: PlannedTurn) {
        await page
          .getByRole("dialog")
          .getByLabel("Ask about your purchase", { exact: true })
          .fill(planned.message);
        await page
          .getByRole("dialog")
          .getByLabel("Ask about your purchase", { exact: true })
          .press("Enter");
      }
      async function finish(planned: PlannedTurn) {
        const response = await planned.response;
        if (response) planned.responded = true;
        assert.ok(response && response.status() === 200);
        const turn = (await response.json()) as CareTurn;
        assert.ok(planned.input);
        assert.equal(turn.requestId, planned.input.requestId);
        assert.equal(turn.message, planned.message);
        assert.equal(turn.answer.revision, planned.input.revision);
        const article = page
          .getByRole("dialog")
          .locator(`article[data-request-id="${turn.requestId}"]`);
        await expect(article.locator("[data-user-message]")).toHaveText(
          planned.message,
        );
        await expect(article.locator("[data-latest-answer]")).toBeVisible();
        await expect(
          page.getByRole("dialog").locator("[data-pending-question]"),
        ).toHaveCount(0);
        await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(
          0,
        );
        return turn;
      }
      async function grounded(turn: CareTurn) {
        assert.equal(turn.answer.mode, "live");
        assert.equal(turn.answer.outcome, "answered");
        assert.equal(turn.answer.context?.twinId, pi.id);
        assert.equal(turn.answer.context?.model, "5");
        assert.ok(turn.answer.steps.length > 0);
        // Any supported shutdown route is valid; do not demand a particular
        // model-selected line, step count or answer length from the live model.
        assert.match(turn.answer.steps.join(" "), /shutdown|shut.*down/i);
        for (const step of turn.answer.steps)
          assert.ok(
            step.trim().length > 0 && referenceSource.content.includes(step),
          );
        assert.equal(turn.answer.sources.length, 1);
        const source = turn.answer.sources.find(
          (s) => s.id === referenceSource.id,
        );
        assert.ok(source);
        assert.equal(source.title, referenceSource.title);
        assert.equal(
          source.href,
          `${pi.href}/care#source-${referenceSource.id}`,
        );
        assert.equal(source.excerpt, referenceSource.content);
        assert.match(source.label, /Raspberry Pi Ltd.*CC BY-SA 4\.0/);
        const latest = page.getByRole("dialog").locator("[data-latest-answer]");
        await expect(
          latest.getByText("Live AI · check sources", { exact: true }),
        ).toBeVisible();
        await expect(latest.locator(".careos-answer > ul > li")).toHaveText(
          turn.answer.steps,
        );
      }

      const first = plan(
        pi.id,
        "How do I safely shut down my Raspberry Pi 5 running Raspberry Pi OS?",
        true,
        true,
      );
      await task("pending-before-forward", "controlled-ui", async () => {
        await send(first);
        await expect.poll(() => !!first.input).toBe(true);
        const pending = dialog.locator("[data-pending-question]");
        await expect(pending).toBeInViewport();
        await expect(pending.locator("[data-user-message]")).toHaveText(
          first.message,
        );
        await expect(pending).toHaveAttribute(
          "data-request-id",
          first.input!.requestId,
        );
        await expect(
          pending.getByText("Preparing your answer…", { exact: true }),
        ).toBeVisible();
        await expect(dialog.locator("[data-latest-answer]")).toHaveCount(0);
      });
      await task("live-official-pi-shutdown", "actual-inference", async () => {
        first.hold!.release(true);
        const turn = await finish(first);
        await grounded(turn);
        const latest = dialog.locator("[data-latest-answer]");
        const disclosure = latest
          .locator("summary")
          .filter({ hasText: /Sources \(/ });
        await disclosure.focus();
        await disclosure.press("Enter");
        await expect(disclosure).toBeFocused();
        await expect(
          latest.locator(
            `a[href="${pi.href}/care#source-${referenceSource.id}"]`,
          ),
        ).toBeVisible();
        return turn;
      });
      await task("live-same-pi-follow-up", "actual-inference", async () => {
        const followUp = plan(
          pi.id,
          "Before I unplug it, what should I do first?",
          true,
        );
        await send(followUp);
        const turn = await finish(followUp);
        await grounded(turn);
        return turn;
      });

      let clarification: CareTurn | undefined;
      let original: PlannedTurn | undefined;
      await task(
        "speaker-to-headphones-clarification",
        "actual-deterministic-ui",
        async () => {
          await openAssistant(speaker.href);
          original = plan(speaker.id, QUESTION, false);
          await send(original);
          clarification = await finish(original);
          assert.equal(clarification.answer.mode, "deterministic");
          assert.equal(clarification.answer.outcome, "selection");
          assert.equal(clarification.answer.context?.twinId, speaker.id);
          assert.ok(clarification.answer.context);
          assert.match(clarification.answer.context.name, /speaker/i);
          await expect(
            page.getByRole("dialog").locator(".careos-context strong"),
          ).toHaveText(
            `${clarification.answer.context.name} · ${clarification.answer.context.model}`,
          );
          assert.equal(clarification.answer.sources.length, 0);
          assert.equal(clarification.answer.steps.length, 0);
          assert.ok(
            !clarification.answer.actions.some((a) =>
              a.href.startsWith("/documents/"),
            ),
          );
          const choices = clarification.answer.purchaseChoices;
          assert.ok(
            choices?.some(
              (c) =>
                c.context.twinId === verified.id &&
                c.provenance === "Verified Sandbox",
            ),
          );
          assert.ok(
            choices?.some(
              (c) =>
                c.context.twinId === sample.id && c.provenance === "Sample",
            ),
          );
          const latest = page
            .getByRole("dialog")
            .locator("[data-latest-answer]");
          const choicesGroup = latest.getByRole("group", {
            name: "Choose a purchase",
            exact: true,
          });
          await expect(
            choicesGroup.getByRole("radio", {
              name: /headphones.*Verified Sandbox/i,
            }),
          ).toHaveValue(verified.id);
          await expect(
            choicesGroup.getByRole("radio", { name: /headphones.*Sample/i }),
          ).toHaveValue(sample.id);
          await expect(
            choicesGroup.getByRole("button", {
              name: "Use this purchase and continue",
              exact: true,
            }),
          ).toBeDisabled();
          return clarification;
        },
      );
      await task(
        "verified-choice-preserves-question-and-receipt",
        "actual-deterministic-ui",
        async () => {
          assert.ok(clarification && original?.input);
          assert.ok(clarification.answer.context);
          const currentDialog = page.getByRole("dialog");
          const choicesGroup = currentDialog
            .locator("[data-latest-answer]")
            .getByRole("group", { name: "Choose a purchase", exact: true });
          const verifiedRadio = choicesGroup.getByRole("radio", {
            name: /headphones.*Verified Sandbox/i,
          });
          const sampleRadio = choicesGroup.getByRole("radio", {
            name: /headphones.*Sample/i,
          });
          const proceed = choicesGroup.getByRole("button", {
            name: "Use this purchase and continue",
            exact: true,
          });
          await expect(verifiedRadio).toBeVisible();
          await expect(sampleRadio).toBeVisible();
          await expect(verifiedRadio).not.toBeChecked();
          await expect(sampleRadio).not.toBeChecked();
          const beforePosts = turnPosts;
          const beforeRequests = requestIds.size;
          const beforeCalls = (await journal()).attempts.length;
          // No next request is admitted until the separate explicit continuation.
          await verifiedRadio.check();
          await expect(verifiedRadio).toBeChecked();
          await expect(sampleRadio).not.toBeChecked();
          await expect(proceed).toBeEnabled();
          await expect(
            currentDialog.locator(".careos-context strong"),
          ).toHaveText(
            `${clarification.answer.context.name} · ${clarification.answer.context.model}`,
          );
          await expect(page).toHaveURL(ORIGIN + speaker.href);
          assert.equal(turnPosts, beforePosts);
          assert.equal(requestIds.size, beforeRequests);
          assert.equal((await journal()).attempts.length, beforeCalls);
          assert.equal(blockedRequests, 0);
          const selected = plan(verified.id, QUESTION, false);
          await proceed.click();
          const turn = await finish(selected);
          assert.equal(turnPosts, beforePosts + 1);
          assert.equal(requestIds.size, beforeRequests + 1);
          assert.ok(selected.input);
          assert.notEqual(selected.input.requestId, original.input.requestId);
          assert.ok(selected.input.revision > original.input.revision);
          assert.equal(selected.input.message, original.input.message);
          assert.equal(turn.answer.mode, "deterministic");
          assert.equal(turn.answer.outcome, "answered");
          assert.equal(turn.answer.context?.twinId, verified.id);
          assert.equal(turn.answer.context?.origin, "sandbox");
          assert.ok(turn.answer.context);
          await expect(
            currentDialog.locator(".careos-context strong"),
          ).toHaveText(
            `${turn.answer.context.name} · ${turn.answer.context.model}`,
          );
          await expect(page).toHaveURL(ORIGIN + verified.href);
          const earlier = page
            .getByRole("dialog")
            .locator(`article[data-request-id="${clarification.requestId}"]`);
          await expect(earlier.locator("[data-user-message]")).toHaveText(
            QUESTION,
          );
          await expect(
            earlier.getByText(clarification.answer.text, { exact: true }),
          ).toHaveCount(1);
          const receipt = turn.answer.actions.find(
            (a) => a.label === "Open receipt",
          );
          assert.equal(receipt?.href, receiptHref);
          const link = page
            .getByRole("dialog")
            .locator("[data-latest-answer]")
            .getByRole("link", { name: "Open receipt", exact: true });
          await expect(link).toHaveAttribute("href", receiptHref!);
          await link.click();
          await expect(page).toHaveURL(ORIGIN + receiptHref);
          await expect(
            page
              .getByRole("main")
              .getByText("Verified Sandbox receipt", { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("main").getByRole("link", { name: /^Back to / }),
          ).toHaveAttribute("href", verified.href);
          return turn;
        },
      );
      await task(
        "missing-manual-useful-documents-action",
        "actual-deterministic-ui",
        async () => {
          await openAssistant(verified.href);
          const manual = plan(
            verified.id,
            "Show the manufacturer manual.",
            false,
          );
          await send(manual);
          const turn = await finish(manual);
          assert.equal(turn.answer.mode, "deterministic");
          assert.equal(turn.answer.outcome, "missing");
          assert.equal(turn.answer.context?.twinId, verified.id);
          assert.match(
            turn.answer.text,
            /No manufacturer manual.*saved documents/i,
          );
          assert.equal(turn.answer.steps.length, 0);
          assert.ok(
            !turn.answer.sources.some((s) => s.id === referenceSource.id),
          );
          const documentsHref = `${verified.href}#documents-heading`;
          assert.ok(turn.answer.actions.some((a) => a.href === documentsHref));
          const latest = page
            .getByRole("dialog")
            .locator("[data-latest-answer]");
          const documents = latest.getByRole("link", {
            name: "Review saved documents",
            exact: true,
          });
          await expect(documents).toHaveAttribute("href", documentsHref);
          await expect(documents).toBeVisible();
          await documents.click();
          await expect(page).toHaveURL(ORIGIN + documentsHref);
          await expect(page.locator("#documents-heading")).toBeVisible();
          return turn;
        },
      );
      assert.equal(passed, 6);
      assert.equal(creates, 1);
      assert.equal(careTurns, MAX_CARE_TURNS);
      assert.equal(turnPosts, MAX_UI_TURNS);
      assert.equal(requestIds.size, MAX_UI_TURNS);
    } catch {
      failed = true;
      process.exitCode = 1;
    } finally {
      active = undefined;
      for (const planned of plans) planned.hold?.release(false);
      try {
        await context?.close();
        await browser?.close();
      } catch {
        failed = true;
      }
      let providerCallDelta = -1; // Unknown is never silently reported as zero.
      try {
        if (baseline) {
          const final = await journal();
          providerCallDelta = final.attempts.length - baseline.attempts.length;
          assert.equal(final.blocked, null);
          if (plans.some((p) => p.forwarded && !p.responded)) {
            providerCallDelta = -1;
            failed = true;
          }
        } else failed = true;
      } catch {
        failed = true;
      }
      if (blockedRequests || passed !== 6) failed = true;
      const summary = {
        status: failed ? "fail" : "pass",
        passedTasks: passed,
        elapsedMs: Math.round(performance.now() - started),
        providerCallDelta,
        blockedRequests,
        longAtomicScrolling: "injected-proof-only-not-assessed-here",
        realDeviceKeyboard: "not-assessed",
      };
      try {
        await record(summary);
      } finally {
        await evidence.close();
      }
      console.log(JSON.stringify(summary));
      if (failed) throw new AcceptanceFailure("ux_acceptance_failed");
    }
  }, ".evaluation-lock"); // Shared with evaluate-subscription.ts, not the dispatch lock.
}

if (process.argv.length !== 3 || process.argv[2] !== "--run") {
  console.error(
    "Not run. Owner-reviewed invocation: pnpm exec tsx scripts/evaluate-careos-ux.ts --run",
  );
  process.exitCode = 2;
} else {
  await main().catch((error: unknown) => {
    // Playwright/assertion errors can embed response text. Never print the error,
    // stack, request bodies, tokens, session objects, transcripts or provider data.
    console.error(
      error instanceof AcceptanceFailure ? error.code : "ux_acceptance_failed",
    );
    process.exitCode = 1;
  });
}
