import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const path of [
  "/safety?example=insignia",
  "/replacements?category=headphones",
]) {
  test(`source-scoped aftercare and accessible mobile layout: ${path}`, async ({
    page,
  }, info) => {
    let post = 0;
    page.on("request", (r) => {
      if (r.method() === "POST") post++;
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (path.startsWith("/safety")) {
      await expect(
        page.getByText("Fictional ownership · real official notice", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "Read the official CPSC notice ↗",
          exact: true,
        }),
      ).toHaveAttribute("href", /^https:\/\/www\.cpsc\.gov\/Recalls\//);
      await expect(
        page.getByText("Limited coverage · one reviewed notice", {
          exact: true,
        }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText("Illustrative profiles · Channel3 not connected", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /View at / })).toHaveCount(0);
      await expect(
        page.getByText("Price not checked", { exact: true }),
      ).toHaveCount(3);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(post).toBe(0);
    await page.screenshot({
      path: `test-results/aftercare-${path.startsWith("/safety") ? "recall" : "replacement"}-${info.project.name}.png`,
      fullPage: true,
    });
  });
}
