import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Conversation, TurnInput } from "../../src/lib/careos/contracts";

// Scoped assistant regressions with fictional/injected HTTP responses only.
// Root font enlargement is a text-resize simulation, not browser zoom proof.
// The fake VisualViewport is not a real software keyboard or real-device test.
const purchase = "/vault/00000000-0000-4000-8000-000000000201";
const receipt = "/documents/00000000-0000-4000-8000-000000000301";
const answerText =
  "Injected accessibility fixture, not a model response. Keep these fictional headphones dry, store them carefully, and use the saved receipt to identify the sample purchase.";
const questionText = "How do I look after my headphones?";
const visibleHeight = "--careos-visible-height";
const keyboardBottom = "--careos-keyboard-bottom";

type ViewportState = { height: number; offsetTop: number; scale: number };
type ViewportTestWindow = Window & {
  __careosSetViewport: (
    state: Partial<ViewportState>,
    event: "resize" | "scroll",
  ) => void;
};

test.use({ viewport: { width: 320, height: 800 } });

async function injectConversation(page: Page) {
  const conversation: Conversation = {
    id: "00000000-0000-4000-8000-000000000980",
    expiresAt: "2099-01-01T00:00:00.000Z",
    turns: [
      {
        requestId: "00000000-0000-4000-8000-000000000981",
        message: questionText,
        answer: {
          outcome: "answered",
          mode: "fixture",
          context: {
            twinId: purchase.split("/").at(-1)!,
            name: "Everyday headphones",
            model: "F-01",
            origin: "sample",
          },
          revision: 1,
          text: answerText,
          steps: Array.from(
            { length: 6 },
            (_, index) =>
              `Fictional care note ${index + 1}: this injected paragraph makes the conversation scrollable so its reading area can be checked independently of the controls.`,
          ),
          sources: [
            {
              id: "injected-accessibility-source",
              title: "Fictional saved receipt",
              href: receipt,
              label: "Injected sample evidence, not manufacturer guidance.",
            },
          ],
          actions: [{ label: "Open receipt", href: receipt }],
        },
      },
    ],
  };
  const inputs: TurnInput[] = [];
  const forbiddenRequests: string[] = [];
  // Block before navigation: even an accidental financial/operator request
  // cannot reach an application endpoint during these presentation tests.
  await page.route(/\/api\/(?:checkout|operator)(?:\/|\?|$)/, (route) => {
    const request = route.request();
    forbiddenRequests.push(
      `${request.method()} ${new URL(request.url()).pathname}`,
    );
    return route.abort("blockedbyclient");
  });
  await page.route("**/api/careos/conversations**", async (route) => {
    const request = route.request();
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname.endsWith(`/${conversation.id}`)
    ) {
      await route.fulfill({ json: conversation });
      return;
    }
    if (request.method() === "POST" && request.url().endsWith("/turns"))
      inputs.push(request.postDataJSON() as TurnInput);
    // These tests restore ready evidence and never need a turn or creation
    // POST. Unexpected requests stay intercepted rather than invoking a model.
    await route.fulfill({
      status: 503,
      json: { error: "careos_injected_unexpected_request" },
    });
  });
  await page.addInitScript((id) => {
    sessionStorage.setItem("palcare-careos-conversation", id);
  }, conversation.id);
  return { inputs, forbiddenRequests };
}

async function openAssistant(page: Page) {
  await page.goto(purchase);
  await page.locator(".careos-launcher").click();
  const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
  await expect(dialog.getByText(answerText, { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return {
    dialog,
    composer: dialog.getByLabel("Ask about your purchase", { exact: true }),
    transcript: dialog.getByRole("region", { name: "CareOS conversation" }),
    body: dialog.getByText(answerText, { exact: true }),
    question: dialog.getByText(questionText, { exact: true }),
  };
}

async function fontSize(locator: Locator) {
  return locator.evaluate((node) =>
    parseFloat(getComputedStyle(node).fontSize),
  );
}

async function expectControlFits(
  locator: Locator,
  bottom = 800,
  minimumSize = 44,
) {
  await expect(locator).toBeVisible();
  const geometry = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      hit: hit !== null && (hit === node || node.contains(hit)),
      viewportWidth: innerWidth,
    };
  });
  expect(geometry.left, `${locator}: left edge`).toBeGreaterThanOrEqual(-1);
  expect(geometry.right, `${locator}: right edge`).toBeLessThanOrEqual(
    geometry.viewportWidth + 1,
  );
  expect(geometry.top, `${locator}: top edge`).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom, `${locator}: visible bottom`).toBeLessThanOrEqual(
    bottom + 1,
  );
  expect(geometry.width, `${locator}: target width`).toBeGreaterThanOrEqual(
    minimumSize,
  );
  expect(geometry.height, `${locator}: target height`).toBeGreaterThanOrEqual(
    minimumSize,
  );
  expect(geometry.hit, `${locator}: target is not clipped or covered`).toBe(
    true,
  );
}

async function expectUsableTranscript(transcript: Locator, bottom = 800) {
  const geometry = await transcript.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      top: rect.top,
      bottom: rect.bottom,
      padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: style.overflowY,
    };
  });
  const visibleContent =
    Math.min(geometry.bottom, bottom) -
    Math.max(geometry.top, 0) -
    geometry.padding;
  expect(
    visibleContent,
    `usable transcript excludes vertical padding: ${JSON.stringify(await transcript.evaluate((node) => [...node.parentElement!.children].map((child) => ({ class: child.className, height: child.getBoundingClientRect().height, top: child.getBoundingClientRect().top }))))}`,
  ).toBeGreaterThanOrEqual(80);
  expect(["auto", "scroll"]).toContain(geometry.overflowY);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  await transcript.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect
    .poll(() => transcript.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
}

async function expectNoHorizontalClipping(page: Page, dialog: Locator) {
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(
        (node) =>
          node.getBoundingClientRect().right +
            Math.max(0, node.scrollWidth - node.clientWidth) >
          innerWidth + 1,
      )
      .slice(-12)
      .map(
        (node) =>
          `${node.tagName}.${node.className}: right=${Math.round(node.getBoundingClientRect().right)}, overflow=${node.scrollWidth - node.clientWidth}, text=${node.textContent?.slice(0, 45)}`,
      ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
    `layout viewport has no horizontal overflow: ${overflow.join("; ")}`,
  ).toBeLessThanOrEqual(1);
  // Checking page scrollWidth alone misses clipped labels and inner content.
  const violations = await dialog.evaluate((panel) => {
    const result: string[] = [];
    for (const container of [
      panel,
      panel.querySelector<HTMLElement>(".careos-transcript")!,
    ])
      if (container.scrollWidth > container.clientWidth + 1)
        result.push(`${container.className}: horizontal overflow`);
    const panelRect = panel.getBoundingClientRect();
    const candidates = panel.querySelectorAll<HTMLElement>(
      "button, a, summary, strong, [data-user-message], [data-latest-answer] p, [data-latest-answer] li",
    );
    for (const element of candidates) {
      if (
        !element.checkVisibility() ||
        !element.getClientRects().length ||
        element.closest(".sr-only")
      )
        continue;
      const rect = element.getBoundingClientRect();
      const left = Math.max(rect.left, panelRect.left, 0);
      const right = Math.min(rect.right, panelRect.right, innerWidth);
      // Inline text has no client box (Firefox may still report a scrollWidth).
      // Its actual text lines are independently checked below.
      if (
        element.clientWidth > 0 &&
        element.scrollWidth > element.clientWidth + 1
      )
        result.push(`${element.textContent?.slice(0, 60)}: clipped content`);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (
          !text.textContent?.trim() ||
          text.parentElement?.closest("svg, .sr-only, [aria-hidden='true']")
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const line of range.getClientRects())
          if (
            line.width > 0 &&
            (line.left < left - 1 || line.right > right + 1)
          )
            result.push(`${text.textContent.slice(0, 60)}: clipped text line`);
      }
    }
    return result;
  });
  expect(
    violations,
    "visible assistant text must wrap, not disappear behind clipping",
  ).toEqual([]);
}

async function viewportProperties(dialog: Locator) {
  return dialog.evaluate(
    (node, properties) =>
      properties.map((name) => node.style.getPropertyValue(name)),
    [visibleHeight, keyboardBottom],
  );
}

async function installVisualViewport(page: Page) {
  await page.addInitScript(() => {
    const state: ViewportState = { height: 800, offsetTop: 0, scale: 1 };
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => state.height },
      width: { get: () => innerWidth / state.scale },
      offsetTop: { get: () => state.offsetTop },
      offsetLeft: { get: () => 0 },
      pageTop: { get: () => scrollY + state.offsetTop },
      pageLeft: { get: () => scrollX },
      scale: { get: () => state.scale },
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, "__careosSetViewport", {
      configurable: true,
      value: (next: Partial<ViewportState>, event: "resize" | "scroll") => {
        Object.assign(state, next);
        viewport.dispatchEvent(new Event(event));
      },
    });
  });
}

async function setVisualViewport(
  page: Page,
  state: Partial<ViewportState>,
  event: "resize" | "scroll" = "resize",
) {
  await page.evaluate(
    ({ state, event }) =>
      (window as unknown as ViewportTestWindow).__careosSetViewport(
        state,
        event,
      ),
    { state, event },
  );
}

test("320px assistant has readable body/composer text and reachable 44px primary targets (injected)", async ({
  page,
}) => {
  const state = await injectConversation(page);
  const { dialog, composer, transcript, body, question } =
    await openAssistant(page);
  for (const content of [
    body,
    question,
    composer,
    transcript.locator("li").first(),
  ])
    expect(
      await fontSize(content),
      `${content}: readable font size`,
    ).toBeGreaterThanOrEqual(16);
  await expectNoHorizontalClipping(page, dialog);
  await expectUsableTranscript(transcript);
  await composer.fill("Draft");
  for (const control of [
    composer,
    dialog.getByRole("button", { name: "Send to CareOS", exact: true }),
    dialog.getByRole("button", { name: "Close CareOS", exact: true }),
    dialog.getByRole("button", { name: "Expand assistant", exact: true }),
    dialog.getByRole("button", { name: "Clear", exact: true }),
  ])
    await expectControlFits(control);
  const action = dialog.getByRole("link", {
    name: "Open receipt",
    exact: true,
  });
  await action.scrollIntoViewIfNeeded();
  await expectControlFits(action);
  expect(state.inputs).toEqual([]);
  expect(state.forbiddenRequests).toEqual([]);
});

test("200% text enlargement at 320px preserves readable content, controls and a usable transcript (simulation)", async ({
  page,
}, info) => {
  const state = await injectConversation(page);
  const { dialog, composer, transcript, body, question } =
    await openAssistant(page);
  const content = [body, question, composer];
  const originalSizes = await Promise.all(content.map(fontSize));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await dialog
    .getByRole("button", { name: "Expand assistant", exact: true })
    .click();
  await composer.fill("Draft");
  expect(await fontSize(page.locator("html"))).toBeGreaterThanOrEqual(32);
  for (let index = 0; index < content.length; index++) {
    const size = await fontSize(content[index]);
    expect(
      size,
      "body and composer must enlarge rather than remain fixed-size",
    ).toBeGreaterThanOrEqual(originalSizes[index] * 1.95);
    expect(size).toBeGreaterThanOrEqual(32);
  }
  await expectNoHorizontalClipping(page, dialog);
  await expectUsableTranscript(transcript);
  for (const control of [
    composer,
    dialog.getByRole("button", { name: "Send to CareOS", exact: true }),
    dialog.getByRole("button", { name: "Close CareOS", exact: true }),
    dialog.getByRole("button", { name: "Compact assistant", exact: true }),
    dialog.getByRole("button", { name: "Clear", exact: true }),
  ])
    await expectControlFits(control);
  // Optional review artifact only: never a snapshot baseline or live evidence.
  await page.screenshot({
    path: info.outputPath("careos-320-text200-injected.png"),
  });
  expect(state.inputs).toEqual([]);
  expect(state.forbiddenRequests).toEqual([]);
});

test("keyboard focus remains visible and contained with reduced motion, then returns to the launcher", async ({
  page,
}) => {
  const state = await injectConversation(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(purchase);
  const launcher = page.locator(".careos-launcher");
  await expectControlFits(launcher);
  await launcher.focus();
  await launcher.press("Enter");
  const dialog = page.getByRole("dialog", { name: "CareOS", exact: true });
  const composer = dialog.getByLabel("Ask about your purchase", {
    exact: true,
  });
  await expect(dialog.getByText(answerText, { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((node) => node.contains(document.activeElement)),
    )
    .toBe(true);
  let reachedComposer = false;
  for (let index = 0; index < 20; index++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
    if (await composer.evaluate((node) => node === document.activeElement)) {
      reachedComposer = true;
      break;
    }
  }
  expect(reachedComposer, "composer is reachable without a pointer").toBe(true);
  await expect(composer).toBeFocused();
  expect(
    await composer.evaluate((node) => node.matches(":focus-visible")),
  ).toBe(true);
  expect(
    await composer.evaluate((node) => {
      const style = getComputedStyle(node);
      const shadowLengths = style.boxShadow.replace(/rgba?\([^)]*\)/g, "");
      return (
        (style.outlineStyle !== "none" &&
          parseFloat(style.outlineWidth) >= 2) ||
        /(?:^|\s)(?:[1-9]\d*(?:\.\d+)?|0?\.\d+)px/.test(shadowLengths)
      );
    }),
    "keyboard focus has a rendered indicator",
  ).toBe(true);
  await composer.fill("An unsent keyboard draft");
  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  const animated = await dialog.locator("*").evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const style = getComputedStyle(node);
      const durations = [style.animationDuration, style.transitionDuration];
      return durations.some((duration) =>
        duration.split(",").some((value) => parseFloat(value) > 0.001),
      )
        ? [node.tagName]
        : [];
    }),
  );
  expect(animated, "assistant respects reduced-motion timing").toEqual([]);
  await expect(
    dialog.getByRole("region", { name: "CareOS conversation" }),
  ).toHaveCSS("scroll-behavior", "auto");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  expect(state.inputs).toEqual([]);
  expect(state.forbiddenRequests).toEqual([]);
});

test("injected VisualViewport keyboard preserves the composer and reading area; blur, reset and pinch zoom clear overrides", async ({
  page,
}) => {
  const state = await injectConversation(page);
  await installVisualViewport(page);
  const { dialog, composer, transcript } = await openAssistant(page);
  const close = dialog.getByRole("button", {
    name: "Close CareOS",
    exact: true,
  });
  await close.focus();
  await expect.poll(() => viewportProperties(dialog)).toEqual(["", ""]);
  await setVisualViewport(page, { height: 450 });
  await expect.poll(() => viewportProperties(dialog)).toEqual(["", ""]);
  await composer.fill("An unsent keyboard draft");
  await expect(composer).toBeFocused();
  await expect
    .poll(() => viewportProperties(dialog))
    .toEqual(["450px", "350px"]);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(-1);
  expect(
    bounds!.y + bounds!.height,
    "panel stays above the injected keyboard",
  ).toBeLessThanOrEqual(451);
  await expectControlFits(composer, 450);
  await expectControlFits(
    dialog.getByRole("button", { name: "Send to CareOS", exact: true }),
    450,
  );
  await expectControlFits(close, 450);
  await expectUsableTranscript(transcript, 450);
  await expectNoHorizontalClipping(page, dialog);
  expect(
    await page
      .locator("html")
      .evaluate(
        (node, properties) =>
          properties.map((name) => node.style.getPropertyValue(name)),
        [visibleHeight, keyboardBottom],
      ),
    "keyboard overrides belong only to the assistant",
  ).toEqual(["", ""]);

  // A panned visual viewport reports offsetTop through its scroll event.
  await setVisualViewport(page, { height: 400, offsetTop: 50 }, "scroll");
  await expect
    .poll(() => viewportProperties(dialog))
    .toEqual(["400px", "350px"]);
  const panned = await dialog.boundingBox();
  expect(panned!.y).toBeGreaterThanOrEqual(49);
  expect(panned!.y + panned!.height).toBeLessThanOrEqual(451);
  await expectControlFits(composer, 450);
  await expect(composer).toBeFocused();

  await setVisualViewport(page, { height: 450, offsetTop: 0, scale: 2 });
  await expect.poll(() => viewportProperties(dialog)).toEqual(["", ""]);
  await expect(composer).toBeFocused();
  await setVisualViewport(page, { scale: 1 });
  await expect
    .poll(() => viewportProperties(dialog))
    .toEqual(["450px", "350px"]);
  await close.focus();
  await expect.poll(() => viewportProperties(dialog)).toEqual(["", ""]);
  await composer.focus();
  await expect
    .poll(() => viewportProperties(dialog))
    .toEqual(["450px", "350px"]);
  await setVisualViewport(page, { height: 800 });
  await expect.poll(() => viewportProperties(dialog)).toEqual(["", ""]);
  await expectControlFits(composer);
  await expectUsableTranscript(transcript);
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("An unsent keyboard draft");
  expect(state.inputs).toEqual([]);
  expect(state.forbiddenRequests).toEqual([]);
});

test("assistant-only axe checks use the project's light or dark appearance (injected fixture)", async ({
  page,
}) => {
  const state = await injectConversation(page);
  const { dialog } = await openAssistant(page);
  await expect(
    dialog.getByRole("heading", { name: "CareOS", exact: true }),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .include(".careos-assistant")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(state.inputs).toEqual([]);
  expect(state.forbiddenRequests).toEqual([]);
});

test("wide compact mode leaves purchase reading space; expand and close restore the page width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const state = await injectConversation(page);
  const { dialog } = await openAssistant(page);
  const main = page.locator("#main-content");
  await expect
    .poll(async () => {
      const content = await main.boundingBox();
      const panel = await dialog.boundingBox();
      return content!.x + content!.width <= panel!.x;
    })
    .toBe(true);
  await dialog
    .getByRole("button", { name: "Expand assistant", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/careos-reading-space/);
  await dialog
    .getByRole("button", { name: "Close CareOS", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/careos-reading-space/);
  expect(state.inputs).toEqual([]);
  expect(state.forbiddenRequests).toEqual([]);
});
