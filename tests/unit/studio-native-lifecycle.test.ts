import { afterEach, describe, expect, it, vi } from "vitest";
import { _GridWidgetCore } from "ag-studio";

// Exercise the actual pinned native core, not a copied implementation. This
// narrow test surface exposes private lifecycle methods only for regression
// evidence; it is not an application API or an SDK/data-engine browser claim.
type Core = {
  api?: {
    getCacheBlockState: () => Record<number, unknown>;
    destroy: () => void;
  };
  refreshGeneration: number;
  params: unknown;
  isBlockStillWanted: (start: number, generation: number) => boolean;
  destroy: () => void;
  createServerSideDatasource: () => {
    getRows: (params: {
      request: { startRow: number; endRow: number; sortModel: never[] };
      success: () => void;
      fail: () => void;
    }) => Promise<void>;
  };
};
function nativeCore() {
  return new _GridWidgetCore({
    beans: {},
    createGrid: vi.fn(),
    setCssProperties: vi.fn(),
    getWidth: () => 320,
  } as unknown as ConstructorParameters<
    typeof _GridWidgetCore
  >[0]) as unknown as Core;
}
afterEach(() => vi.useRealTimers());

describe("pinned native Studio lifecycle regressions", () => {
  it("does not access a grid API before asynchronous initialization assigns it", () => {
    const core = nativeCore();
    expect(core.isBlockStillWanted(0, 0)).toBe(false);
    core.destroy();
  });
  it("checks actual cache/generation while alive and never touches the API after destroy", () => {
    const core = nativeCore();
    const api = {
      getCacheBlockState: vi.fn(() => ({ 0: {} })),
      destroy: vi.fn(),
    };
    core.api = api;
    expect(core.isBlockStillWanted(0, 0)).toBe(true);
    expect(core.isBlockStillWanted(500, 0)).toBe(false);
    expect(core.isBlockStillWanted(0, 1)).toBe(false);
    expect(api.getCacheBlockState).toHaveBeenCalledTimes(2);
    core.destroy();
    expect(api.destroy).toHaveBeenCalledOnce();
    expect(core.isBlockStillWanted(0, 0)).toBe(false);
    expect(api.getCacheBlockState).toHaveBeenCalledTimes(2);
  });
  it("cancels an outstanding native row-query poll on destroy without stale failure/retry callbacks", async () => {
    vi.useFakeTimers();
    const core = nativeCore();
    core.api = {
      getCacheBlockState: vi.fn(() => ({ 0: {} })),
      destroy: vi.fn(),
    };
    let signal: AbortSignal | undefined;
    const getData = vi.fn(
      (_query: unknown, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("injected destroyed query")),
            { once: true },
          );
        });
      },
    );
    core.params = {
      dataMapping: { cols: [{ id: "purchases.name", key: "purchases.name" }] },
      widgetApi: { getData, isGroupingField: () => false, setSort: vi.fn() },
    };
    const success = vi.fn(),
      fail = vi.fn();
    const request = core
      .createServerSideDatasource()
      .getRows({
        request: { startRow: 0, endRow: 100, sortModel: [] },
        success,
        fail,
      });
    await vi.advanceTimersByTimeAsync(1);
    expect(getData).toHaveBeenCalledOnce();
    core.destroy();
    await vi.advanceTimersByTimeAsync(250);
    await request;
    expect(signal?.aborted).toBe(true);
    expect(success).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
