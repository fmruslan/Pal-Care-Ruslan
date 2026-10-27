import { createElement, type RefCallback } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  calculateVisibleViewport,
  useVisibleViewport,
} from "@/components/careos/use-visible-viewport";

const keyboard = {
  width: 390,
  innerHeight: 844,
  focused: true,
  viewport: { height: 464, offsetTop: 0, scale: 1 },
};

describe("CareOS mobile visible viewport geometry", () => {
  it("uses the actual visible height and keyboard inset", () => {
    expect(calculateVisibleViewport(keyboard)).toEqual({
      height: 464,
      bottom: 380,
    });
  });

  it("accounts for viewport panning without subtracting offsetTop from height", () => {
    expect(
      calculateVisibleViewport({
        ...keyboard,
        viewport: { ...keyboard.viewport, offsetTop: 100 },
      }),
    ).toEqual({ height: 464, bottom: 280 });
  });

  it("never returns a negative bottom inset", () => {
    expect(
      calculateVisibleViewport({
        ...keyboard,
        viewport: { ...keyboard.viewport, offsetTop: 400 },
      }),
    ).toEqual({ height: 464, bottom: 0 });
  });

  it("uses only the remaining inset when the layout viewport partially shrinks", () => {
    expect(calculateVisibleViewport({ ...keyboard, innerHeight: 700 })).toEqual(
      { height: 464, bottom: 236 },
    );
  });

  it("leaves a fully resized layout viewport to dvh instead of double shrinking", () => {
    expect(
      calculateVisibleViewport({ ...keyboard, innerHeight: 464 }),
    ).toBeNull();
  });

  it("preserves fractional CSS-pixel measurements", () => {
    expect(
      calculateVisibleViewport({
        ...keyboard,
        viewport: { height: 463.75, offsetTop: 12.5, scale: 1 },
      }),
    ).toEqual({ height: 463.75, bottom: 367.75 });
  });

  it("leaves desktop, unfocused and API-free views to CSS", () => {
    for (const input of [
      { ...keyboard, width: 1024 },
      { ...keyboard, width: 1440 },
      { ...keyboard, focused: false },
      { ...keyboard, viewport: undefined },
      { ...keyboard, viewport: null },
      { ...keyboard, viewport: { ...keyboard.viewport, height: 844 } },
      { ...keyboard, viewport: { ...keyboard.viewport, height: 850 } },
    ])
      expect(calculateVisibleViewport(input)).toBeNull();
    expect(
      calculateVisibleViewport({ ...keyboard, width: 1023 }),
    ).not.toBeNull();
  });

  it("does not mistake any non-unit pinch zoom for a keyboard", () => {
    for (const scale of [0.8, 1.0001, 1.5, 2, NaN])
      expect(
        calculateVisibleViewport({
          ...keyboard,
          viewport: { ...keyboard.viewport, scale },
        }),
      ).toBeNull();
  });

  it("rejects unavailable or non-finite geometry rather than writing invalid CSS", () => {
    for (const input of [
      { ...keyboard, width: 0 },
      { ...keyboard, width: NaN },
      { ...keyboard, innerHeight: 0 },
      { ...keyboard, innerHeight: Infinity },
      { ...keyboard, viewport: { ...keyboard.viewport, height: 0 } },
      { ...keyboard, viewport: { ...keyboard.viewport, height: NaN } },
      { ...keyboard, viewport: { ...keyboard.viewport, offsetTop: Infinity } },
    ])
      expect(calculateVisibleViewport(input)).toBeNull();
  });
});

// Element-local event doubles, not browser/real-device keyboard acceptance.
function panelFixture() {
  const properties = new Map<string, string>();
  const attributes = new Map<string, string>();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const viewport = Object.assign(new EventTarget(), keyboard.viewport);
  const view = Object.assign(new EventTarget(), {
    innerWidth: keyboard.width,
    innerHeight: keyboard.innerHeight,
    visualViewport: viewport as typeof viewport | null,
    requestAnimationFrame(callback: FrameRequestCallback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
  });
  const input = {
    type: null as string | null,
    inputMode: null as string | null,
    disabled: false,
    getAttribute(name: string) {
      return name === "type" ? this.type : this.inputMode;
    },
    matches(selector: string) {
      return selector === "textarea, input" || this.disabled;
    },
  };
  const document = Object.assign(new EventTarget(), {
    defaultView: view,
    activeElement: input as typeof input | null,
  });
  const node = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    ownerDocument: document,
    contains: (element: unknown) => element === input,
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => properties.delete(name),
    },
  } as unknown as HTMLElement;
  return {
    node,
    viewport,
    view,
    document,
    input,
    properties,
    attributes,
    frames,
    flush() {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(0);
    },
  };
}

function viewportRef(): RefCallback<HTMLElement> {
  let ref: RefCallback<HTMLElement> | undefined;
  function Host() {
    ref = useVisibleViewport();
    return null;
  }
  // Rendering the hook needs neither window nor a DOM, and writes no server style.
  expect(renderToStaticMarkup(createElement(Host))).toBe("");
  return ref!;
}

describe("CareOS viewport callback ref", () => {
  it("is SSR-safe and tolerates a missing node or VisualViewport API", () => {
    const ref = viewportRef();
    expect(ref(null)).toBeUndefined();
    const panel = panelFixture();
    panel.view.visualViewport = null;
    expect(ref(panel.node)).toBeUndefined();
    expect(panel.properties.size).toBe(0);
    expect(panel.frames.size).toBe(0);
  });

  it("coalesces resize/scroll/orientation events and clears overrides on zoom or desktop", () => {
    const panel = panelFixture();
    const cleanup = viewportRef()(panel.node);
    expect(panel.properties.get("--careos-visible-height")).toBe("464px");
    expect(panel.properties.get("--careos-keyboard-bottom")).toBe("380px");
    expect(panel.attributes.get("data-careos-keyboard")).toBe("true");
    panel.viewport.height = 400;
    panel.viewport.offsetTop = 50;
    panel.viewport.dispatchEvent(new Event("resize"));
    panel.viewport.dispatchEvent(new Event("scroll"));
    panel.view.dispatchEvent(new Event("orientationchange"));
    panel.view.dispatchEvent(new Event("scroll"));
    expect(panel.frames.size).toBe(1);
    panel.flush();
    expect(panel.properties.get("--careos-visible-height")).toBe("400px");
    expect(panel.properties.get("--careos-keyboard-bottom")).toBe("394px");
    panel.viewport.scale = 2;
    panel.viewport.dispatchEvent(new Event("resize"));
    panel.flush();
    expect(panel.properties.size).toBe(0);
    expect(panel.attributes.size).toBe(0);
    panel.viewport.scale = 1;
    panel.view.innerWidth = 1024;
    panel.view.dispatchEvent(new Event("resize"));
    panel.flush();
    expect(panel.properties.size).toBe(0);
    if (typeof cleanup === "function") cleanup();
  });

  it("requires editable focus inside the panel and waits for focusout to settle", () => {
    const panel = panelFixture();
    const cleanup = viewportRef()(panel.node);
    panel.document.dispatchEvent(new Event("focusout"));
    panel.document.activeElement = null;
    panel.flush();
    expect(panel.properties.size).toBe(0);
    panel.document.activeElement = panel.input;
    panel.document.dispatchEvent(new Event("focusin"));
    panel.flush();
    expect(panel.properties.size).toBe(2);
    panel.document.activeElement = { ...panel.input };
    panel.document.dispatchEvent(new Event("focusin"));
    panel.flush();
    expect(panel.properties.size).toBe(0);
    panel.document.activeElement = panel.input;
    for (const type of ["checkbox", "button", "file", "range"]) {
      panel.input.type = type;
      panel.document.dispatchEvent(new Event("focusin"));
      panel.flush();
      expect(panel.properties.size).toBe(0);
    }
    panel.input.type = "text";
    panel.input.disabled = true;
    panel.document.dispatchEvent(new Event("focusin"));
    panel.flush();
    expect(panel.properties.size).toBe(0);
    panel.input.disabled = false;
    panel.input.inputMode = "none";
    panel.document.dispatchEvent(new Event("focusin"));
    panel.flush();
    expect(panel.properties.size).toBe(0);
    if (typeof cleanup === "function") cleanup();
  });

  it("removes listeners, pending frames and custom properties on detach", () => {
    const panel = panelFixture();
    const ref = viewportRef();
    const cleanup = ref(panel.node);
    panel.viewport.dispatchEvent(new Event("resize"));
    expect(panel.frames.size).toBe(1);
    expect(cleanup).toBeTypeOf("function");
    if (typeof cleanup === "function") cleanup();
    expect(panel.frames.size).toBe(0);
    expect(panel.properties.size).toBe(0);
    expect(panel.attributes.size).toBe(0);
    for (const [target, events] of [
      [panel.viewport, ["resize", "scroll"]],
      [panel.view, ["resize", "scroll", "orientationchange"]],
      [panel.document, ["focusin", "focusout"]],
    ] as const)
      for (const event of events) target.dispatchEvent(new Event(event));
    expect(panel.frames.size).toBe(0);
    panel.flush();
    expect(panel.properties.size).toBe(0);
    // React 19 Strict Mode may attach again after cleanup.
    const reattached = ref(panel.node);
    expect(panel.properties.size).toBe(2);
    if (typeof reattached === "function") reattached();
  });
});
