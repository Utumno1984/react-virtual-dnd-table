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
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: index });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        top: 0,
        transform: `translateY(${top}px) ${
          isActive && transform ? `translate(${transform.x}px, ${transform.y}px)` : ""
        }`,
      }}
    >
      <button {...attributes} {...listeners}>⠿</button>
      {/* row content */}
    </div>
  );
}
```

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
