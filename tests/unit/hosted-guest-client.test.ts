import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("does nothing in private mode, coalesces hosted admission and never posts a scope token", async () => {
  const marker = vi.fn(() => null as unknown);
  vi.stubGlobal("document", { querySelector: marker });
  const fetcher = vi.fn(async () => new Response('{"guest":true}'));
  vi.stubGlobal("fetch", fetcher);
  const { ensureGuestAccess } =
    await import("../../src/components/careos/guest-client");
  await ensureGuestAccess();
  expect(fetcher).not.toHaveBeenCalled();
  marker.mockReturnValue({});
  await Promise.all([ensureGuestAccess(), ensureGuestAccess()]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/ai/evaluation",
    expect.objectContaining({ method: "POST", body: "{}", cache: "no-store" }),
  );
  // A later explicit send rechecks cookies; it never replays model requests.
  await ensureGuestAccess();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
