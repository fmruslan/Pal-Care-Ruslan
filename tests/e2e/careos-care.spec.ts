import { test, expect } from "@playwright/test";

test("official care evidence remains distinct from sample ownership and missing Forma manuals", async ({
  page,
}) => {
  await page.goto("/vault/00000000-0000-4000-8000-000000000204/care");
  await expect(
    page.getByRole("heading", { name: "Raspberry Pi 5 · safe shutdown" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open original guide/ }),
  ).toHaveAttribute(
    "href",
    "https://www.raspberrypi.com/documentation/computers/getting-started.html#shutdown",
  );
  await page.getByRole("button", { name: "Ask about product care" }).click();
  await page.getByRole("button", { name: "Product care", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Demo response · no live AI"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByText(/Safe shutdown for Raspberry Pi 5 running Raspberry Pi OS/),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("assistant.png");
  await page.keyboard.press("Escape");
  await page.goto("/vault/00000000-0000-4000-8000-000000000201/care");
  await expect(
    page.getByRole("heading", { name: "No manufacturer care guide available" }),
  ).toBeVisible();
});
