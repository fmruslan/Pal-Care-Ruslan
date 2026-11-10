import { afterEach, describe, expect, it, vi } from "vitest";
import { _GridWidgetCore } from "ag-studio";

// Exercise the actual pinned native core, not a copied implementation. This
// narrow test surface exposes private lifecycle methods only for regression
// evidence; it is not an application API or an SDK/data-engine browser claim.
type Core = {
  core: {
    gridApi?: {
      getCacheBlockState: () => Record<number, unknown>;
      destroy: () => void;
    };
    widgetParams: unknown;
    handle?: { set: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
    stores: Map<string, unknown>;
    onHandleResult: (event: unknown) => void;
    onFrameEnd: () => void;
  };
  isBlockStillWanted: (start: number, generation: number) => boolean;
  destroy: () => void;
  getRows: (params: {
    request: { startRow: number; endRow: number; sortModel: never[] };
    success: () => void;
    fail: () => void;
  }) => void;
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
    core.core.gridApi = api;
    expect(core.isBlockStillWanted(0, 0)).toBe(true);
    expect(core.isBlockStillWanted(500, 0)).toBe(false);
    expect(core.isBlockStillWanted(0, 1)).toBe(false);
    expect(api.getCacheBlockState).toHaveBeenCalledTimes(2);
    core.destroy();
    expect(api.destroy).toHaveBeenCalledOnce();
    expect(core.isBlockStillWanted(0, 0)).toBe(false);
    expect(api.getCacheBlockState).toHaveBeenCalledTimes(2);
  });
  it("closes an outstanding native row-query handle on destroy without stale failure/retry callbacks", async () => {
    vi.useFakeTimers();
    const core = nativeCore();
    core.core.gridApi = {
      getCacheBlockState: vi.fn(() => ({ 0: {} })),
      destroy: vi.fn(),
    };
    // 3.1 replaces per-request polling with a shared data handle. Exercise the
    // real pending store and late delivery guards, not the removed 3.0 methods.
    const handle = { set: vi.fn(), close: vi.fn() };
    core.core.handle = handle;
    core.core.widgetParams = {
      dataMapping: { cols: [{ id: "purchases.name", key: "purchases.name" }] },
      config: {},
      widgetApi: { isGroupingField: () => false, setSort: vi.fn() },
    };
    const success = vi.fn(),
      fail = vi.fn();
    core.getRows({
      request: { startRow: 0, endRow: 100, sortModel: [] },
      success,
      fail,
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(handle.set).toHaveBeenCalledOnce();
    expect(core.core.stores.size).toBe(1);
    const key = handle.set.mock.calls[0][0];
    core.destroy();
    core.core.onHandleResult({ key, response: { results: { rows: [] } } });
    core.core.onFrameEnd();
    await vi.advanceTimersByTimeAsync(250);
    expect(handle.close).toHaveBeenCalledOnce();
    expect(core.core.stores.size).toBe(0);
    expect(success).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
