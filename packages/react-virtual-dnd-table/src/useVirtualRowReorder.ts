import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  SensorDescriptor,
  SensorOptions,
} from "@dnd-kit/core";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

export interface UseVirtualRowReorderOptions {
  /** Total number of rows in the list (the full, un-virtualized count). */
  count: number;
  /** Fixed row height in pixels. v1 only supports fixed-height rows. */
  rowHeight: number;
  /** Returns the scrollable element that contains the virtualized rows. */
  getScrollElement: () => HTMLElement | null;
  /** Called once, on drop, with the reorder to apply to your data. No-op if the index didn't change. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Distance in px from the pointer activates a drag (passed to dnd-kit's PointerSensor). Default 4. */
  activationDistance?: number;
  /** Distance in px from the top/bottom edge of the scroll container that triggers auto-scroll. Default 60. */
  edgeScrollZone?: number;
  /** Max auto-scroll speed in px per animation frame, at full deflection into the edge zone. Default 14. */
  edgeScrollSpeed?: number;
}

export interface UseVirtualRowReorderResult {
  /** Index of the row currently being dragged, or null when idle. */
  activeIndex: number | null;
  /** Index the dragged row would land on if dropped right now, or null when idle. */
  overIndex: number | null;
  /** True while a drag is in progress. */
  isDragging: boolean;
  /** dnd-kit sensors, ready to pass to <DndContext sensors={...}>. */
  sensors: SensorDescriptor<SensorOptions>[];
  /** Spread the rest directly onto <DndContext>. */
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
}

/**
 * Makes drag-to-reorder work on a virtualized row list (TanStack Virtual, react-window,
 * or anything with fixed-height rows), where dnd-kit's own collision detection can't see
 * rows that aren't currently mounted in the DOM.
 *
 * Give each row's drag handle `useDraggable({ id: virtualRow.index })` — the row's CURRENT
 * index, not a stable row id. This hook derives the drop target from raw pointer position
 * ÷ row height instead of DOM collision, so it works even when the target row is off-screen,
 * and drives auto-scroll while the pointer sits near the edge of the scroll container.
 *
 * Pointer position is tracked with a native, capture-phase `pointermove` listener rather
 * than dnd-kit's own `event.delta`, for two reasons found the hard way:
 *
 * 1. dnd-kit compensates `delta` for scroll on the dragged item's ancestors. Since this hook
 *    scrolls the container itself, that compensation fights back — each auto-scroll tick
 *    inflates `delta`, which the hook reads as "the pointer moved further", triggering more
 *    auto-scroll, in a runaway loop that only stops once the container scrolls back to 0.
 * 2. Once a drag is active, dnd-kit stops propagation of pointer events at the bubble phase,
 *    so a plain `window.addEventListener("pointermove", ...)` stops firing almost
 *    immediately. Listening in the capture phase runs before that happens.
 *
 * Every piece of `options` is read through a ref rather than closed over directly, so
 * `runAutoScroll`/`handlePointerMove` keep a stable identity for the component's lifetime —
 * including when a caller (reasonably) passes an inline `getScrollElement` that gets a new
 * identity on every render. Without that, the pointermove listener attached in `onDragStart`
 * would get silently detached by effect cleanup on the very next render triggered by
 * `setActiveIndex`, and auto-scroll would die after a single tick.
 */
export function useVirtualRowReorder(
  options: UseVirtualRowReorderOptions,
): UseVirtualRowReorderResult {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Raw (uncompensated) pointer Y and the scrollTop/pointerY the drag started at — together
  // these give the total content-space displacement: how much the container has scrolled,
  // plus how much the pointer itself has moved, since the drag began.
  const startClientY = useRef(0);
  const startScrollTop = useRef(0);
  const rawClientY = useRef<number | null>(null);
  const autoScrollFrame = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: options.activationDistance ?? 4 },
    }),
  );

  const clampIndex = useCallback((index: number) => {
    return Math.min(Math.max(index, 0), optionsRef.current.count - 1);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  }, []);

  // Held in a ref so rAF/event callbacks below always read the latest activeIndex/clampIndex
  // without needing to be re-subscribed every time they change.
  const recomputeOverIndexRef = useRef<() => void>(() => {});
  recomputeOverIndexRef.current = () => {
    if (activeIndex === null || rawClientY.current === null) return;
    const { getScrollElement, rowHeight } = optionsRef.current;
    const container = getScrollElement();
    const scrollDelta = (container?.scrollTop ?? startScrollTop.current) - startScrollTop.current;
    const pointerDelta = rawClientY.current - startClientY.current;
    const rawOffset = (scrollDelta + pointerDelta) / rowHeight;
    setOverIndex(clampIndex(activeIndex + Math.round(rawOffset)));
  };

  // Stable for the component's lifetime: reads everything through optionsRef instead of
  // closing over `options` fields directly, so it's immune to the caller's own render churn.
  const runAutoScroll = useCallback(() => {
    const { getScrollElement, edgeScrollZone = 60, edgeScrollSpeed = 14 } = optionsRef.current;
    const container = getScrollElement();
    const clientY = rawClientY.current;
    if (!container || clientY === null) {
      autoScrollFrame.current = null;
      return;
    }
    const rect = container.getBoundingClientRect();
    const distanceFromTop = clientY - rect.top;
    const distanceFromBottom = rect.bottom - clientY;

    let delta = 0;
    if (distanceFromTop < edgeScrollZone) {
      const strength = 1 - Math.max(distanceFromTop, 0) / edgeScrollZone;
      delta = -strength * edgeScrollSpeed;
    } else if (distanceFromBottom < edgeScrollZone) {
      const strength = 1 - Math.max(distanceFromBottom, 0) / edgeScrollZone;
      delta = strength * edgeScrollSpeed;
    }

    if (delta !== 0) {
      container.scrollTop += delta;
      recomputeOverIndexRef.current();
      autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
    } else {
      autoScrollFrame.current = null;
    }
  }, []);

  // Also stable, since runAutoScroll is stable.
  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      rawClientY.current = event.clientY;
      recomputeOverIndexRef.current();
      if (autoScrollFrame.current === null) {
        autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [runAutoScroll],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const index = Number(event.active.id);
      setActiveIndex(index);
      setOverIndex(index);
      const activatorEvent = event.activatorEvent as PointerEvent | undefined;
      startClientY.current = activatorEvent?.clientY ?? 0;
      rawClientY.current = startClientY.current;
      startScrollTop.current = optionsRef.current.getScrollElement()?.scrollTop ?? 0;
      // Capture phase: once the drag is active, dnd-kit stops propagation of pointer events
      // at the bubble phase, so a bubble-phase listener here would stop firing almost
      // immediately.
      window.addEventListener("pointermove", handlePointerMove, true);
    },
    [handlePointerMove],
  );

  // Kept for API stability (and in case a future version needs it) — position tracking
  // happens via the native pointermove listener above, not dnd-kit's own delta. See the
  // hook's doc comment for why.
  const onDragMove = useCallback((_event: DragMoveEvent) => {}, []);

  const reset = useCallback(() => {
    stopAutoScroll();
    window.removeEventListener("pointermove", handlePointerMove, true);
    setActiveIndex(null);
    setOverIndex(null);
    rawClientY.current = null;
  }, [stopAutoScroll, handlePointerMove]);

  const onDragEnd = useCallback(
    (_event: DragEndEvent) => {
      if (activeIndex !== null && overIndex !== null && activeIndex !== overIndex) {
        optionsRef.current.onReorder(activeIndex, overIndex);
      }
      reset();
    },
    [activeIndex, overIndex, reset],
  );

  const onDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      reset();
    },
    [reset],
  );

  // Safety net: drop the listener if the component unmounts mid-drag. handlePointerMove is
  // stable, so this only ever runs on true unmount — not on every render.
  useEffect(() => () => window.removeEventListener("pointermove", handlePointerMove, true), [handlePointerMove]);

  return {
    activeIndex,
    overIndex,
    isDragging: activeIndex !== null,
    sensors,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
  };
}
