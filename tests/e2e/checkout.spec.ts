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
  expiresAt: "2099-01-01T00:00:00.000Z",
  captureAttempted: false,
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
  await page.route(`**/api/checkout/orders/${checkoutId}`, (route) =>
    route.fulfill({ json: view }),
  );
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
  await page.route(`**/api/checkout/orders/${checkoutId}`, (route) =>
    route.fulfill({ json: view }),
  );
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

for (const state of ["created", "create_unknown", "expired"]) {
  test(`mock UI transport: expired ${state} hides approval/capture/retry and never auto-captures on return`, async ({
    page,
  }) => {
    let posts = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/checkout/")
      )
        posts++;
    });
    await page.route(`**/api/checkout/orders/${checkoutId}`, (route) =>
      route.fulfill({
        json: {
          ...view,
          state,
          expiresAt: "2020-01-01T00:00:00Z",
          error: "checkout_expired",
          approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TEST",
        },
      }),
    );
    await page.goto(`/checkout/${checkoutId}?token=EXPIRED-UI-RETURN`);
    await expect(page.getByRole("status")).toContainText(
      "checkout has expired",
    );
    await expect(
      page.getByRole("link", { name: "Continue to PayPal Sandbox" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: /Check \/ complete|Retry original order creation|Cancel this checkout/,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Appearance" })
      .selectOption("dark");
    await expect(page.getByRole("status")).toContainText(
      "checkout has expired",
    );
    expect(posts).toBe(0);
  });
}

test("mock UI transport: open checkout expires without polling or sending a financial request", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-22T12:00:00Z") });
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/checkout/")) requests++;
  });
  await page.route(`**/api/checkout/orders/${checkoutId}`, (route) =>
    route.fulfill({
      json: {
        ...view,
        expiresAt: "2026-10-22T12:00:05Z",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=TEST",
      },
    }),
  );
  await page.goto(`/checkout/${checkoutId}`);
  await expect(
    page.getByRole("link", { name: "Continue to PayPal Sandbox" }),
  ).toBeVisible();
  await page.clock.fastForward(6000);
  await expect(page.getByRole("status")).toContainText("checkout has expired");
  await expect(
    page.getByRole("link", { name: "Continue to PayPal Sandbox" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check / complete this sandbox payment" }),
  ).toHaveCount(0);
  expect(requests).toBe(1);
});

test("mock UI transport: attempted pending capture remains reconcilable after deadline", async ({
  page,
}) => {
  let captures = 0;
  const pending = {
    ...view,
    state: "pending",
    captureAttempted: true,
    expiresAt: "2020-01-01T00:00:00Z",
  };
  await page.route(`**/api/checkout/orders/${checkoutId}`, (route) =>
    route.fulfill({ json: pending }),
  );
  await page.route(`**/api/checkout/orders/${checkoutId}/capture`, (route) => {
    captures++;
    return route.fulfill({ json: pending });
  });
  await page.goto(`/checkout/${checkoutId}`);
  await expect(page.getByRole("status")).toContainText(
    "confirmation is pending",
  );
  await page
    .getByRole("button", { name: "Check / complete this sandbox payment" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "confirmation is pending",
  );
  expect(captures).toBe(1);
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
