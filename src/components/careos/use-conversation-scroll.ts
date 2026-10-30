"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function intentionalUpwardScroll(
  previous: number,
  top: number,
  maxTop: number,
) {
  // A position outside the new range was clamped by layout, not the reader.
  return top < previous - 2 && previous <= Math.max(0, maxTop) + 2;
}

// Only the transcript scrolls. Atomic long replies open at their beginning.
export function useConversationScroll(
  requestId: string | undefined,
  completed: boolean,
) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const position = useRef(0);
  const last = useRef<{ id?: string; completed: boolean }>({
    completed: false,
  });
  const deferred = useRef(false);
  const observer = useRef<ResizeObserver | null>(null);
  const [showJump, setShowJump] = useState(false);

  const reveal = useCallback((answer: boolean) => {
    const node = viewport.current;
    if (!node) {
      deferred.current = true;
      return;
    }
    deferred.current = false;
    const target = node.querySelector<HTMLElement>(
      answer ? "[data-latest-answer]" : "[data-pending-question]",
    );
    const top =
      target && target.offsetHeight > node.clientHeight - 32
        ? node.scrollTop +
          target.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          16
        : node.scrollHeight - node.clientHeight;
    // Immediate scrolling is intentional: no animation can steal reading/focus or ignore reduced motion.
    node.scrollTop = Math.max(0, top);
    position.current = node.scrollTop;
    following.current =
      node.scrollHeight - node.clientHeight - node.scrollTop < 48;
    setShowJump(false);
  }, []);

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (viewport.current) position.current = viewport.current.scrollTop;
      observer.current?.disconnect();
      viewport.current = node;
      if (node) {
        node.scrollTop = following.current
          ? node.scrollHeight - node.clientHeight
          : position.current;
        // Browsers may clamp a restored position to the new scroll range.
        // That layout adjustment is not an intentional upward scroll.
        position.current = node.scrollTop;
        let width = node.clientWidth;
        let height = node.clientHeight;
        observer.current = new ResizeObserver(() => {
          if (node.clientWidth === width && node.clientHeight === height)
            return;
          width = node.clientWidth;
          height = node.clientHeight;
          if (following.current) {
            node.scrollTop = node.scrollHeight - node.clientHeight;
            position.current = node.scrollTop;
          }
        });
        observer.current.observe(node);
        if (deferred.current)
          requestAnimationFrame(() => reveal(last.current.completed));
      }
    },
    [reveal],
  );

  useLayoutEffect(() => {
    const previous = last.current;
    const newQuestion = requestId && previous.id !== requestId && !completed;
    const newAnswer =
      requestId &&
      completed &&
      (previous.id !== requestId || !previous.completed);
    last.current = { id: requestId, completed };
    if (!requestId) {
      position.current = 0;
      following.current = true;
    } else if (newQuestion || (newAnswer && following.current))
      reveal(completed);
    else if (newAnswer) setShowJump(true);
  }, [requestId, completed, reveal]);

  function onScroll() {
    const node = viewport.current;
    if (!node) return;
    const top = node.scrollTop;
    if (
      intentionalUpwardScroll(
        position.current,
        top,
        node.scrollHeight - node.clientHeight,
      )
    ) {
      following.current = false;
      setShowJump(true);
    } else if (node.scrollHeight - node.clientHeight - top < 48) {
      following.current = true;
      setShowJump(false);
    }
    position.current = top;
  }
  function focusTranscript() {
    viewport.current?.focus({ preventScroll: true });
  }
  function jump() {
    // The control disappears after activation; leave keyboard users at a useful reading target.
    focusTranscript();
    reveal(completed);
  }
  return { attach, onScroll, showJump, jump, focusTranscript };
}
