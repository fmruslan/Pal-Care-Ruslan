import { test, expect } from "@playwright/test";

const checkoutId = "00000000-0000-4000-8000-000000000901";
const sampleTwinId = "00000000-0000-4000-8000-000000000201";
const view = {
  id: checkoutId,
  state: "created",
  approvalUrl: null,
  twinId: null,
  error: null,
  product: {},
};

test("catalog stays public and honestly disabled without credentials", async ({
  page,
  request,
}) => {
  await page.goto("/shop");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Good things. Better aftercare.",
  );
  await expect(
    page.getByRole("button", { name: "Buy with PayPal Sandbox" }),
  ).toHaveCount(3);
  for (const button of await page
    .getByRole("button", { name: "Buy with PayPal Sandbox" })
    .all())
    await expect(button).toBeDisabled();
  const response = await request.post("/api/checkout/orders", {
    data: { productId: sampleTwinId, requestId: checkoutId },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({ error: "checkout_unavailable" });
});

// Transport-intercepted UI tests only. No mock provider, secret, or verification
// switch exists in application routes. PostgreSQL/service tests cover persistence.
test("mock UI transport: successful return navigates to the returned Twin once", async ({
  page,
}) => {
  let calls = 0;
  await page.route(
    `**/api/checkout/orders/${checkoutId}/capture`,
    async (route) => {
      expect(route.request().method()).toBe("POST");
      calls++;
      await route.fulfill({
        json: { ...view, state: "completed", twinId: sampleTwinId },
      });
    },
  );
  await page.goto(`/checkout/${checkoutId}?token=TEST-UI-RETURN`);
  await expect(page).toHaveURL(new RegExp(`/vault/${sampleTwinId}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Everyday headphones",
  );
  expect(calls).toBe(1);
});

test("mock UI transport: cancellation never calls capture", async ({
  page,
}) => {
  let captureCalls = 0;
  await page.route(
    `**/api/checkout/orders/${checkoutId}/capture`,
    async (route) => {
      captureCalls++;
      await route.abort();
    },
  );
  await page.route(
    `**/api/checkout/orders/${checkoutId}/cancel`,
    async (route) => {
      await route.fulfill({ json: { ...view, state: "cancelled" } });
    },
  );
  await page.goto(`/checkout/${checkoutId}?cancel=1`);
  await expect(page.getByRole("status")).toContainText("Checkout cancelled");
  expect(captureCalls).toBe(0);
});

test("mock UI transport: declined and pending payments never show completion", async ({
  page,
}) => {
  let state = "pending";
  await page.route(
    `**/api/checkout/orders/${checkoutId}/capture`,
    async (route) => {
      await route.fulfill({
        json: {
          ...view,
          state,
          error: state === "failed" ? "INSTRUMENT_DECLINED" : null,
        },
      });
    },
  );
  await page.goto(`/checkout/${checkoutId}?token=TEST-UI-RETURN`);
  await expect(page.getByRole("status")).toContainText(
    "confirmation is pending",
  );
  state = "failed";
  await page
    .getByRole("button", { name: "Check / complete this sandbox payment" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "sandbox payment failed",
  );
  await expect(
    page.getByRole("alert", { name: "Checkout error" }),
  ).toContainText("declined");
  await expect(page).toHaveURL(/\/checkout\//);
});

test("forged return parameters cannot bypass the disabled server boundary", async ({
  page,
}) => {
  await page.goto(`/checkout/${checkoutId}?token=FORGED`);
  await expect(
    page.getByRole("alert", { name: "Checkout error" }),
  ).toContainText("unavailable");
  await expect(page).not.toHaveURL(/\/vault\//);
});
