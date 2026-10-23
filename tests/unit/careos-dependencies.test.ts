import { describe, it, expect, vi } from "vitest";
import { resolveTurn } from "../../src/lib/careos/service";
import { demoData } from "../../src/lib/demo/fixtures";
describe("CareOS relevant-dependency isolation", () => {
  it("receipt succeeds without touching broken knowledge, Guardian or recall services", async () => {
    const fail = vi.fn(async () => {
      throw new Error("Injected outage");
    });
    const answer = await resolveTurn({
      data: demoData,
      input: {
        requestId: crypto.randomUUID(),
        twinId: demoData.twins[0].id,
        revision: 1,
        message: "Find my receipt",
      },
      sources: [],
      history: [],
      mode: "fixture",
      load: { knowledge: fail, guardian: fail, recall: fail },
    });
    expect(answer.outcome).toBe("answered");
    expect(answer.actions[0].href).toMatch(/^\/documents\//);
    expect(fail).not.toHaveBeenCalled();
  });
  it("a relevant recall outage rejects instead of inventing a no-match answer", async () => {
    const fail = vi.fn(async () => {
      throw new Error("Injected recall outage");
    });
    await expect(
      resolveTurn({
        data: demoData,
        input: {
          requestId: crypto.randomUUID(),
          twinId: demoData.twins[0].id,
          revision: 1,
          message: "Is this recalled?",
          intent: "recall",
        },
        sources: [],
        history: [],
        mode: "fixture",
        load: { knowledge: vi.fn(), guardian: vi.fn(), recall: fail },
      }),
    ).rejects.toThrow("Injected recall outage");
    expect(fail).toHaveBeenCalledOnce();
  });
});
