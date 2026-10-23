import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const path of ["/guardian", "/merchant/operator"]) {
  test(`Guardian public boundary and accessibility: ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
    await expect(
      page.getByRole("button", { name: /execute|approve|publish/i }),
    ).toHaveCount(0);
    if (path === "/guardian") {
      await expect(
        page.getByRole("heading", { name: "No eligible adjustment recorded." }),
      ).toBeVisible();
      await page
        .getByText("Explore a clearly labeled example", { exact: true })
        .click();
      await expect(
        page.getByText("Illustrative scenario · not a saved entitlement", {
          exact: true,
        }),
      ).toBeVisible();
    }
  });
}

test("Guardian APIs are read-only publicly and reject forged operator actions", async ({
  request,
  baseURL,
}) => {
  const analytics = await request.get("/api/guardian/analytics");
  expect(analytics.status()).toBe(200);
  expect(analytics.headers()["cache-control"]).toContain("no-store");
  expect(await analytics.json()).toMatchObject({
    version: "guardian-analytics-v1",
    currency: "USD",
    metrics: { verifiedMinor: 0 },
    facts: [],
  });
  expect(
    (await request.post("/api/guardian/analytics", { data: {} })).status(),
  ).toBe(405);
  for (const origin of [baseURL!, "https://untrusted.example"]) {
    const result = await request.post("/api/operator/guardian", {
      headers: { Origin: origin },
      data: { action: "publish-policy" },
    });
    expect([403, 503]).toContain(result.status());
  }
  for (const id of ["invalid", "00000000-0000-4000-8000-999999999999"])
    expect((await request.get(`/guardian/${id}`)).status()).toBe(404);
});
