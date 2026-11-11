import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { expect, test, type Page, type Request } from "@playwright/test";
import type {
  CareContext,
  CareTurn,
  Conversation,
  TurnInput,
} from "../../src/lib/careos/contracts";
import { OWNER_ORIGIN } from "../../src/lib/careos/standing-owner";
import { isolatedCareEnvironment } from "../helpers/isolated-care-environment";

// Same isolated owner-mode fixture server as standing-owner.spec.ts. Only the
// browser's status/conversation transport is injected: no credentials, policy
// installation, application/test DB, provider dispatch or TLS proof.
const local = "http://127.0.0.1:3116";
let home: string;
let server: ChildProcess | undefined;
const context: CareContext = {
  twinId: "00000000-0000-4000-8000-000000000201",
  name: "Everyday headphones",
  model: "F-01",
  origin: "sample",
  purchasedOn: "2026-10-18",
};
const panel = (page: Page) =>
  page.getByRole("dialog", { name: "North Star", exact: true });
const ready = {
  remembered: true,
  browserCompletion: "complete",
  liveEnabled: true,
  policy: "approved",
  revoked: false,
  providerBlocked: false,
  remaining: 10,
  provider: "Injected status; no provider connected",
};

test.beforeEach(async ({ context: browserContext }) => {
  home = await mkdtemp("/tmp/opencode/north-chat-open-race-");
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
        DEMO_DATA_SOURCE: "fixtures",
        DATABASE_URL: "",
        CAREOS_DATABASE_URL: "",
        CAREOS_PROVIDER: "fixture",
        CAREOS_OWNER_MODE: "true",
        CAREOS_STANDING_AI_ENABLED: "false",
        CAREOS_EVALUATION_ENABLED: "false",
        CAREOS_OWNER_PAIRING_ENABLED: "false",
        PALCARE_NORTH_MAIN_ENABLED: "false",
        CAREOS_SUBSCRIPTION_ENABLED: "false",
        CAREOS_SUBSCRIPTION_CREDITS_DISABLED: "true",
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
  await browserContext.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== OWNER_ORIGIN) return route.abort();
    // No mutation may escape the page-level conversation doubles below.
    if (!["GET", "HEAD"].includes(request.method())) return route.abort();
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

test.afterEach(async ({ context: browserContext }) => {
  try {
    await browserContext.unrouteAll({ behavior: "ignoreErrors" });
  } finally {
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    }
    server = undefined;
    if (home) await rm(home, { recursive: true, force: true });
  }
});

async function intercept(page: Page) {
  const conversations = new Map<string, Conversation>();
  const writes: { path: string; input: TurnInput | null }[] = [];
  const prohibited: string[] = [];
  let holdNext = false;
  let release: (() => void) | undefined;
  let held = false;
  let heldRequest: Request | undefined;
  await page.route("**/api/ai/owner", async (route) => {
    if (route.request().method() !== "GET") {
      prohibited.push(route.request().method() + " /api/ai/owner");
      return route.abort();
    }
    if (holdNext) {
      holdNext = false;
      heldRequest = route.request();
      await new Promise<void>((resolve) => {
        release = resolve;
        held = true;
      });
    }
    await route.fulfill({ json: ready });
  });
  await page.route("**/api/careos/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const match = path.match(
      /^\/api\/careos\/conversations(?:\/([a-f0-9-]{36})(?:\/(turns))?)?$/,
    );
    if (match && request.method() === "GET" && match[1]) {
      const saved = conversations.get(match[1]);
      return route.fulfill(
        saved
          ? { json: saved }
          : { status: 404, json: { error: "careos_conversation_missing" } },
      );
    }
    if (match && request.method() === "POST") {
      if (!match[1]) {
        writes.push({ path, input: null });
        const saved: Conversation = {
          id: randomUUID(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          turns: [],
        };
        conversations.set(saved.id, saved);
        return route.fulfill({ json: saved });
      }
      const input = request.postDataJSON() as TurnInput;
      writes.push({ path, input });
      const saved = conversations.get(match[1]);
      expect(
        saved,
        "Turn must use an injected owned conversation",
      ).toBeDefined();
      const turn: CareTurn = {
        requestId: input.requestId,
        message: input.message,
        answer: {
          outcome: "answered",
          mode: "fixture",
          context,
          revision: input.revision,
          text: "Injected care answer. No manufacturer manual is established.",
          steps: [],
          sources: [],
          actions: [],
        },
      };
      saved!.turns.push(turn);
      return route.fulfill({ json: turn });
    }
    // open() may GET its separate provider-free records channel. It must never
    // create/write it or interpret a care question in this fixture-mode test.
    if (request.method() === "GET")
      return route.fulfill({
        status: 404,
        json: { error: "careos_conversation_missing" },
      });
    prohibited.push(request.method() + " " + path);
    return route.abort();
  });
  return {
    conversations,
    writes,
    prohibited,
    hold: () => {
      holdNext = true;
      held = false;
    },
    isHeld: () => held,
    heldRequest: () => heldRequest,
    release: () => release?.(),
  };
}

async function send(page: Page, message: string) {
  await panel(page)
    .getByRole("textbox", { name: "Ask about your purchases", exact: true })
    .fill(message);
  const response = page.waitForResponse(
    (value) =>
      value.request().method() === "POST" &&
      /\/api\/careos\/conversations\/[^/]+\/turns$/.test(
        new URL(value.url()).pathname,
      ),
  );
  await panel(page)
    .getByRole("button", { name: "Send to North Star", exact: true })
    .click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  const turn = (await saved.json()) as CareTurn;
  await expect(
    panel(page).locator(`[data-request-id="${turn.requestId}"]`),
  ).toBeVisible();
  await expect(panel(page).locator("[data-pending-question]")).toHaveCount(0);
  return turn;
}

for (const destination of ["New chat", "Previous chats"] as const) {
  test(`delayed open owner GET cannot reattach the departed care channel after ${destination}`, async ({
    page,
  }) => {
    const state = await intercept(page);
    try {
      await page.goto(OWNER_ORIGIN + `/vault/${context.twinId}`);
      const opener = page.getByRole("button", {
        name: "Ask North Star about this purchase",
        exact: true,
      });
      await opener.click();
      const first = await send(page, "Help me care for these headphones");
      const firstId = [...state.conversations.keys()][0];
      const firstSnapshot = structuredClone(state.conversations.get(firstId));
      let departedId = firstId;
      if (destination === "Previous chats") {
        await panel(page)
          .getByRole("button", { name: "New chat", exact: true })
          .click();
        await send(page, "Help me clean these headphones");
        departedId = [...state.conversations.keys()][1];
      }
      // Wait for the RAF metadata snapshot: open() must capture a real chat
      // whose care channel points to the conversation being left behind.
      await expect
        .poll(() =>
          page.evaluate((id) => {
            const raw = sessionStorage.getItem("palcare-north-chats-v1");
            if (!raw) return false;
            const index = JSON.parse(raw);
            return index.chats.some(
              (chat: { id: string; channels: { care: string | null } }) =>
                chat.id === index.activeChatId && chat.channels.care === id,
            );
          }, departedId),
        )
        .toBe(true);
      const beforeSwitch = structuredClone([...state.conversations]);
      await panel(page)
        .getByRole("button", { name: "Close North Star", exact: true })
        .click();
      state.hold();
      await opener.click();
      await expect.poll(state.isHeld).toBe(true);
      await panel(page)
        .getByRole("button", { name: destination, exact: true })
        .click();
      if (destination === "Previous chats") {
        await panel(page)
          .getByRole("region", { name: "Previous chats", exact: true })
          .getByRole("button", { name: first.message, exact: false })
          .click();
        await expect(
          panel(page).locator(`[data-request-id="${first.requestId}"]`),
        ).toBeVisible();
      }
      const writesBeforeRelease = state.writes.length;
      const released = page.waitForResponse(
        (response) => response.request() === state.heldRequest(),
      );
      state.release();
      await (await released).finished();
      // Let response.json()/restore commit before the next explicit submission.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(state.writes).toHaveLength(writesBeforeRelease);
      expect([...state.conversations]).toEqual(beforeSwitch);
      const next = await send(page, "Help me store these headphones safely");
      const posted = state.writes.filter((write) => write.input);
      expect(posted).toHaveLength(destination === "New chat" ? 2 : 3);
      const last = posted.at(-1)!;
      if (destination === "New chat") {
        expect(state.conversations.size).toBe(2);
        expect(last.path).not.toContain(firstId);
        expect(state.conversations.get(firstId)).toEqual(firstSnapshot);
      } else {
        expect(state.conversations.size).toBe(2);
        expect(last.path).toBe(`/api/careos/conversations/${firstId}/turns`);
        expect(last.path).not.toContain(departedId);
        expect(state.conversations.get(departedId)).toEqual(
          beforeSwitch.find(([id]) => id === departedId)![1],
        );
      }
      expect(last.input?.requestId).toBe(next.requestId);
      expect(posted.map((write) => write.input!.requestId)).toEqual([
        ...new Set(posted.map((write) => write.input!.requestId)),
      ]);
      expect(state.prohibited).toEqual([]);
    } finally {
      state.release();
    }
  });
}
