import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { newSessionToken, sessionHash } from "../../src/lib/commerce/security";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  capture: vi.fn(),
  cancel: vi.fn(),
  view: vi.fn(),
  retryCreation: vi.fn(),
}));
vi.mock("../../src/lib/commerce/runtime", () => ({
  checkoutRuntime: () => ({
    origin: "https://palcare.example",
    service: mocks,
  }),
}));
import { POST as start } from "../../src/app/api/checkout/orders/route";
import { POST as mutate } from "../../src/app/api/checkout/orders/[id]/[action]/route";
import { GET as view } from "../../src/app/api/checkout/orders/[id]/route";

const id = "00000000-0000-4000-8000-000000000901";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockResolvedValue({ id, state: "created" });
  mocks.capture.mockResolvedValue({ id, state: "pending" });
  mocks.view.mockResolvedValue({ id, state: "created" });
});
function request(
  path: string,
  headers: Record<string, string> = {},
  body = "{}",
) {
  return new NextRequest(`https://palcare.example${path}`, {
    method: "POST",
    headers: {
      Origin: "https://palcare.example",
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
}
describe("HTTP authorization boundary with a mocked service, no provider calls", () => {
  it("rejects cross-origin creation before any service mutation", async () => {
    expect(
      (
        await start(
          request("/api/checkout/orders", { Origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("sets a browser-specific HttpOnly cookie and never exposes the raw token in JSON", async () => {
    const response = await start(request("/api/checkout/orders"));
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(await response.text()).not.toContain("palcare_checkout");
    expect(mocks.start.mock.calls[0][1]).toHaveLength(64);
  });
  it("capture requires the originating checkout cookie", async () => {
    const response = await mutate(
      request("/api/checkout/orders/" + id + "/capture"),
      { params: Promise.resolve({ id, action: "capture" }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("passes only the cookie digest and local order ID to the service", async () => {
    const token = newSessionToken();
    const response = await mutate(
      request("/api/checkout/orders/" + id + "/capture", {
        Cookie: `palcare_checkout=${token}`,
      }),
      { params: Promise.resolve({ id, action: "capture" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.capture).toHaveBeenCalledWith(id, sessionHash(token));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects extra capture fields instead of accepting a visitor amount", async () => {
    const token = newSessionToken();
    const response = await mutate(
      request(
        "/api/checkout/orders/" + id + "/capture",
        { Cookie: `palcare_checkout=${token}` },
        '{"amount":1}',
      ),
      { params: Promise.resolve({ id, action: "capture" }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("rejects malformed status IDs and never reads a provider on GET", async () => {
    const response = await view(
      new NextRequest("https://palcare.example/api/checkout/orders/invalid"),
      { params: Promise.resolve({ id: "invalid" }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.view).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
