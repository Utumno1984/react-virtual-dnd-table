# react-virtual-dnd-table

Drag-to-reorder for virtualized row lists (TanStack Virtual, `react-window`, or anything with
fixed-height rows), built on top of [dnd-kit](https://dndkit.com/).

dnd-kit's own `SortableContext` needs every droppable row mounted in the DOM to detect a
collision — which breaks the moment your rows are virtualized, since off-screen rows don't
exist in the DOM. This hook sidesteps that entirely: it derives the drop target from
`pointer delta ÷ row height` instead of DOM collision, and drives auto-scroll while the
pointer sits near the edge of the scroll container.

Headless: it has no opinion on how your rows render, what UI kit you use, or which table
library (if any) sits on top. You still use dnd-kit's own `useDraggable` on each row.

**[Live demo →](https://react-virtual-dnd-table.vercel.app)** · Full story, screenshots and source: [GitHub repo](https://github.com/Utumno1984/react-virtual-dnd-table).

## Install

```bash
npm install react-virtual-dnd-table @dnd-kit/core
```

`react` (>=18) and `@dnd-kit/core` (^6) are peer dependencies.

## Usage

```tsx
import { DndContext, useDraggable } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useVirtualRowReorder } from "react-virtual-dnd-table";

const ROW_HEIGHT = 36;

function MyVirtualizedList({ items, setItems, scrollRef, virtualItems }) {
  const { activeIndex, overIndex, sensors, onDragStart, onDragMove, onDragEnd, onDragCancel } =
    useVirtualRowReorder({
      count: items.length,
      rowHeight: ROW_HEIGHT,
      getScrollElement: () => scrollRef.current,
      onReorder: (from, to) => setItems((prev) => arrayMove(prev, from, to)),
    });

  return (
    <DndContext
      sensors={sensors}
      autoScroll={false} // this hook drives its own, virtualization-aware auto-scroll
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div ref={scrollRef} style={{ overflow: "auto", height: 500 }}>
        {virtualItems.map((virtualRow) => (
          <Row
            key={items[virtualRow.index].id}
            index={virtualRow.index}
            top={virtualRow.start}
            isActive={virtualRow.index === activeIndex}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Row({ index, top, isActive }) {
  // The drag handle's id is the row's CURRENT index, not a stable row id — that's what lets
  // useVirtualRowReorder derive the drop target from pointer math alone.
  const { attributes, listeners, setNodeRef } = useDraggable({ id: index });

  return (
    // Position with `top`, not `transform: translateY(...)` — see "Pitfalls" below.
    <div ref={setNodeRef} style={{ position: "absolute", top, left: 0, width: "100%", height: ROW_HEIGHT }}>
      <button {...attributes} {...listeners}>⠿</button>
      {/* row content */}
    </div>
  );
}
```

The example above doesn't render the "lifted" copy of the dragged row. For that, add a
`<DragOverlay>` — and read the next section first, it saves you a few debugging sessions.

## Pitfalls with `DragOverlay` and virtualized rows

These are not bugs in the hook: they follow from how dnd-kit interacts with virtualization (and
from the hook using the row's current index as the draggable id). They're easy to hit when you
wire up your own list, so here is the setup that avoids all of them.

```tsx
<DndContext sensors={sensors} autoScroll={false} onDragStart={onDragStart} /* ... */>
  {/* virtual rows, positioned with `top` (see 2) */}
  <DragOverlay dropAnimation={null}>
    {activeIndex !== null ? <RowView item={items[activeIndex]} /> : null}
  </DragOverlay>
</DndContext>
```

### 1. The dragged row disappears during auto-scroll

If you show the dragged row in place (moving it with the `transform` that `useDraggable`
returns), it leaves the window of rows the virtualizer keeps mounted as soon as auto-scroll
carries the drag far enough. The node is unmounted and the row vanishes from the DOM mid-drag.

Render the lifted copy in a `<DragOverlay>` instead: it lives outside the virtualized list, so
it's independent of what the virtualizer has mounted. Use `activeIndex` to look the record up in
your own array (`items[activeIndex]`); nothing else is needed from the hook. In the list, you can
render the original row as a placeholder (e.g. dimmed) while `index === activeIndex`.

### 2. The overlay copy starts offset by the row's index

If rows are positioned with `transform: translateY(...)`, the overlay starts in the wrong place
— always from the top of the list, shifted by `index * rowHeight`. dnd-kit measures the
draggable's rect with CSS transforms stripped, to know where to anchor the overlay, so the
offset hidden in the transform is lost.

Position virtualized rows with `top` (inline style) instead:

```tsx
style={{ position: "absolute", top: virtualRow.start, left: 0, width: "100%", height: ROW_HEIGHT }}
```

### 3. The drop animation flies back to the origin

By default `<DragOverlay>` animates on drop towards the node whose draggable id equals the active
id. Because the hook uses the row's *current index* as the id (that's what lets it derive the drop
target from pointer math alone), after the reorder that id belongs to a different record, near
where the drag started — so the overlay animates back to the origin, not to the destination.

The simplest robust fix is to turn the animation off. The real row is already in its final
position after the re-render, so there is nothing left to animate:

```tsx
<DragOverlay dropAnimation={null}>{/* ... */}</DragOverlay>
```

### 4. The drop indicator should show only one side

The hook exposes `overIndex`, the destination slot, with no notion of "above" or "below" a row.
If you highlight both edges of the row at `overIndex`, the indicator is ambiguous. Derive the side
by comparing it with `activeIndex`:

```tsx
const side =
  overIndex === null || activeIndex === null || index !== overIndex || index === activeIndex
    ? null
    : overIndex > activeIndex
      ? "below" // dragged down: the record lands after this row → bottom border only
      : "above"; // dragged up: it lands before this row → top border only
```

The complete, working version of all four is in
[`packages/demo/src/App.tsx`](https://github.com/Utumno1984/react-virtual-dnd-table/blob/main/packages/demo/src/App.tsx).

## API

### `useVirtualRowReorder(options)`

**Options**

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `count` | `number` | — | Total number of rows in the list. |
| `rowHeight` | `number` | — | Fixed row height in pixels. |
| `getScrollElement` | `() => HTMLElement \| null` | — | Returns the scrollable container. |
| `onReorder` | `(from: number, to: number) => void` | — | Called once on drop, only if the index changed. |
| `activationDistance` | `number` | `4` | Pointer movement (px) before a drag activates. |
| `edgeScrollZone` | `number` | `60` | Distance (px) from the container edge that triggers auto-scroll. |
| `edgeScrollSpeed` | `number` | `14` | Max auto-scroll speed (px/frame) at full deflection. |

**Returns**

| Field | Type | Description |
| --- | --- | --- |
| `activeIndex` | `number \| null` | Index of the row being dragged. |
| `overIndex` | `number \| null` | Index it would land on if dropped now. |
| `isDragging` | `boolean` | `activeIndex !== null`. |
| `sensors` | dnd-kit sensors | Pass to `<DndContext sensors={...}>`. |
| `onDragStart`, `onDragMove`, `onDragEnd`, `onDragCancel` | dnd-kit handlers | Spread onto `<DndContext>`. |

## License

MIT
