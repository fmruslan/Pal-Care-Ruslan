"use client";

import { useCallback, type RefCallback } from "react";

type ViewportMeasurement = {
  height: number;
  offsetTop: number;
  scale: number;
};

type VisibleViewportInput = {
  width: number;
  innerHeight: number;
  focused: boolean;
  viewport?: ViewportMeasurement | null;
};

export type VisibleViewport = { height: number; bottom: number };

/** Null leaves sizing to CSS/dvh; editable focus plus occlusion is a keyboard hint. */
export function calculateVisibleViewport({
  width,
  innerHeight,
  focused,
  viewport,
}: VisibleViewportInput): VisibleViewport | null {
  if (
    !focused ||
    !Number.isFinite(width) ||
    width <= 0 ||
    width >= 1024 ||
    !Number.isFinite(innerHeight) ||
    innerHeight <= 0 ||
    !viewport ||
    viewport.scale !== 1 ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0 ||
    !Number.isFinite(viewport.offsetTop) ||
    viewport.height >= innerHeight
  )
    return null;

  return {
    height: viewport.height,
    // Some browsers already shrink innerHeight: never subtract the keyboard twice.
    bottom: Math.max(0, innerHeight - (viewport.height + viewport.offsetTop)),
  };
}

function hasEditableFocus(panel: HTMLElement): boolean {
  const active = panel.ownerDocument.activeElement;
  if (
    !active ||
    !panel.contains(active) ||
    active.getAttribute("inputmode") === "none"
  )
    return false;

  if (active.matches("textarea, input"))
    return (
      !active.matches(":disabled, [readonly]") &&
      !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/i.test(
        active.getAttribute("type") ?? "text",
      )
    );

  return (active as HTMLElement).isContentEditable === true;
}

/**
 * Attach to the assistant panel. React 19 runs the callback-ref cleanup on detach.
 * Only element-local CSS variables change; no React state, focus or scroll writes.
 */
export function useVisibleViewport(): RefCallback<HTMLElement> {
  return useCallback((panel: HTMLElement | null) => {
    const view = panel?.ownerDocument.defaultView;
    const viewport = view?.visualViewport;
    if (!panel || !view || !viewport) return;

    let frame: number | undefined;
    const clear = () => {
      panel.removeAttribute("data-careos-keyboard");
      panel.style.removeProperty("--careos-visible-height");
      panel.style.removeProperty("--careos-keyboard-bottom");
    };
    const update = () => {
      const size = calculateVisibleViewport({
        width: view.innerWidth,
        innerHeight: view.innerHeight,
        focused: hasEditableFocus(panel),
        viewport,
      });
      if (!size) {
        clear();
        return;
      }
      panel.style.setProperty("--careos-visible-height", `${size.height}px`);
      panel.style.setProperty("--careos-keyboard-bottom", `${size.bottom}px`);
      panel.setAttribute("data-careos-keyboard", "true");
    };
    const schedule = () => {
      if (frame !== undefined) return;
      // Coalesce keyboard animation events and read focus after focusout settles.
      frame = view.requestAnimationFrame(() => {
        frame = undefined;
        update();
      });
    };
    const listeners: [EventTarget, string][] = [
      [viewport, "resize"],
      [viewport, "scroll"],
      [view, "resize"],
      [view, "scroll"],
      [view, "orientationchange"],
      [panel.ownerDocument, "focusin"],
      [panel.ownerDocument, "focusout"],
    ];
    for (const [target, event] of listeners)
      target.addEventListener(event, schedule);
    update();

    return () => {
      for (const [target, event] of listeners)
        target.removeEventListener(event, schedule);
      if (frame !== undefined) view.cancelAnimationFrame(frame);
      clear();
    };
  }, []);
}
