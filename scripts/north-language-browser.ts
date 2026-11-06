import { expect, type Page } from "@playwright/test";

/** Same visible customer interaction for live runs and injected harness checks.
 * Does not decide authority, create a profile, or retry a request. */
export async function submitLanguageTurn(page: Page, message: string) {
  const search = page.getByRole("searchbox", {
    name: "Search products and documents",
    exact: true,
  });
  const composer = page.getByRole("textbox", {
    name: "Ask about your purchases",
    exact: true,
  });
  // Database pages can finish navigation before their streamed inputs mount.
  // Choose only after an actual visible input exists, not an early DOM count.
  await expect(
    search.or(composer).filter({ visible: true }).first(),
  ).toBeVisible();
  const fromSearch = await search.isVisible();
  await (fromSearch ? search : composer).fill(message);
  const responsePromise = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      /\/api\/careos\/(?:records\/)?conversations\/[^/]+\/(interpret|turns)$/.test(
        new URL(r.url()).pathname,
      ),
    { timeout: 120000 },
  );
  const button = page.getByRole("button", {
    name: fromSearch ? "Ask North Star" : "Send to North Star",
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.click();
  return responsePromise;
}
