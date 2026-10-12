import { useCallback, useRef, useState } from "react";
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
 * index, not a stable row id. This hook derives the drop target from pointer delta ÷
 * row height instead of DOM collision, so it works even when the target row is off-screen,
 * and drives auto-scroll while the pointer sits near the edge of the scroll container.
 */
export function useVirtualRowReorder(
  options: UseVirtualRowReorderOptions,
): UseVirtualRowReorderResult {
  const {
    count,
    rowHeight,
    getScrollElement,
    onReorder,
    activationDistance = 4,
    edgeScrollZone = 60,
    edgeScrollSpeed = 14,
  } = options;

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const accumulatedDeltaY = useRef(0);
  const lastClientY = useRef<number | null>(null);
  const autoScrollFrame = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: activationDistance },
    }),
  );

  const clampIndex = useCallback(
    (index: number) => Math.min(Math.max(index, 0), count - 1),
    [count],
  );

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  }, []);

  // Held in a ref so the rAF loop below always reads the latest activeIndex/clampIndex
  // without needing to be restarted every time they change.
  const recomputeOverIndexRef = useRef<() => void>(() => {});
  recomputeOverIndexRef.current = () => {
    if (activeIndex === null) return;
    const rawOffset = accumulatedDeltaY.current / rowHeight;
    setOverIndex(clampIndex(activeIndex + Math.round(rawOffset)));
  };

  const runAutoScroll = useCallback(() => {
    const container = getScrollElement();
    const clientY = lastClientY.current;
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
      accumulatedDeltaY.current += delta;
      recomputeOverIndexRef.current();
      autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
    } else {
      autoScrollFrame.current = null;
    }
  }, [getScrollElement, edgeScrollZone, edgeScrollSpeed]);

  const onDragStart = useCallback((event: DragStartEvent) => {
    const index = Number(event.active.id);
    setActiveIndex(index);
    setOverIndex(index);
    accumulatedDeltaY.current = 0;
  }, []);

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (activeIndex === null) return;
      accumulatedDeltaY.current = event.delta.y;
      setOverIndex(clampIndex(activeIndex + Math.round(event.delta.y / rowHeight)));

      const activatorEvent = event.activatorEvent as PointerEvent | undefined;
      if (activatorEvent) {
        lastClientY.current = activatorEvent.clientY + event.delta.y;
      }
      if (autoScrollFrame.current === null) {
        autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
      }
    },
    [activeIndex, rowHeight, clampIndex, runAutoScroll],
  );

  const reset = useCallback(() => {
    stopAutoScroll();
    setActiveIndex(null);
    setOverIndex(null);
    lastClientY.current = null;
  }, [stopAutoScroll]);

  const onDragEnd = useCallback(
    (_event: DragEndEvent) => {
      if (activeIndex !== null && overIndex !== null && activeIndex !== overIndex) {
        onReorder(activeIndex, overIndex);
      }
      reset();
    },
    [activeIndex, overIndex, onReorder, reset],
  );

  const onDragCancel = useCallback(
    (_event: DragCancelEvent) => {
      reset();
    },
    [reset],
  );

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
