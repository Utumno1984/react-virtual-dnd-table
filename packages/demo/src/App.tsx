import { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  type Cell,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DndContext, DragOverlay, useDraggable } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useVirtualRowReorder } from "react-virtual-dnd-table";
import "./App.css";

type Row = {
  id: string;
  name: string;
  value: number;
};

const ROW_COUNT = 10000;
const ROW_HEIGHT = 36;

function makeRows(count: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `row-${i}`,
      name: `Elemento ${i}`,
      value: Math.round(Math.random() * 10000) / 100,
    });
  }
  return out;
}

function App() {
  const [data, setData] = useState<Row[]>(() => makeRows(ROW_COUNT));

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: "drag", header: "", size: 36, cell: () => null },
      { id: "index", header: "#", size: 80, cell: (ctx) => ctx.row.index },
      { accessorKey: "name", header: "Nome" },
      {
        accessorKey: "value",
        header: "Valore (€)",
        cell: (ctx) => ctx.getValue<number>().toFixed(2),
      },
    ],
    [],
  );

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const { rows } = table.getRowModel();

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const { activeIndex, overIndex, sensors, onDragStart, onDragMove, onDragEnd, onDragCancel } =
    useVirtualRowReorder({
      count: data.length,
      rowHeight: ROW_HEIGHT,
      getScrollElement: () => parentRef.current,
      onReorder: (from, to) => setData((prev) => arrayMove(prev, from, to)),
    });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className="app">
      <h1>react-virtual-dnd-table — demo</h1>
      <p className="hint">
        10.000 righe virtualizzate (TanStack Virtual). Trascina dall'icona ⠿: prova a
        trascinare da cima a fondo, lo scroll automatico e il riordino funzionano anche su
        righe non ancora montate nel DOM.
      </p>
      <DndContext
        sensors={sensors}
        // dnd-kit's own auto-scroll is on by default and fights with the one
        // useVirtualRowReorder implements (which is virtualization-aware) —
        // without this it keeps scrolling past where the pointer says it should.
        autoScroll={false}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="table-header">
          {table.getHeaderGroups().map((hg) => (
            <div className="tr" key={hg.id}>
              {hg.headers.map((header) => (
                <div
                  className={`th th-${header.column.id}`}
                  key={header.id}
                  style={{ width: header.getSize() }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div ref={parentRef} className="table-body">
          <div style={{ height: totalSize, position: "relative" }}>
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <DraggableRow
                  key={row.id}
                  index={virtualRow.index}
                  start={virtualRow.start}
                  isActive={virtualRow.index === activeIndex}
                  overSide={
                    overIndex !== null &&
                    activeIndex !== null &&
                    virtualRow.index === overIndex &&
                    virtualRow.index !== activeIndex
                      ? // Dragged down: the record lands after this row; dragged up: before it.
                        overIndex > activeIndex
                        ? "below"
                        : "above"
                      : null
                  }
                  cells={row.getVisibleCells()}
                />
              );
            })}
          </div>
        </div>
        {/* The dragged row's own <DraggableRow> unmounts once auto-scroll carries its index
            out of the virtualizer's window, so the visible "lifted" copy lives in a
            DragOverlay instead — it is independent of what the virtualizer has mounted. */}
        {/* dropAnimation={null}: by default dnd-kit animates the overlay towards the node whose
            draggable id equals the active id. Ids are row POSITIONS, and after onReorder the node
            holding the old id is a different record sitting near the drag's origin — so the copy
            would fly back to where it started. The real row is already in its final place. */}
        <DragOverlay dropAnimation={null}>
          {activeIndex !== null ? (
            <div className="tr row row-active" style={{ height: ROW_HEIGHT }}>
              <RowCells cells={rows[activeIndex].getVisibleCells()} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DraggableRow(props: {
  index: number;
  start: number;
  isActive: boolean;
  overSide: "above" | "below" | null;
  cells: Cell<Row, unknown>[];
}) {
  // The drag handle's id is the row's CURRENT index, not a stable row id — that's what
  // lets useVirtualRowReorder derive the drop target from pointer math alone.
  const { attributes, listeners, setNodeRef } = useDraggable({ id: props.index });

  const style: CSSProperties = {
    position: "absolute",
    // `top`, not `transform: translateY(...)`: DragOverlay starts from the draggable's rect as
    // measured by dnd-kit, which strips CSS transforms — a transform-positioned row would make
    // the overlay start at the list's top instead of at the row (offset of index * ROW_HEIGHT).
    top: props.start,
    left: 0,
    width: "100%",
    height: ROW_HEIGHT,
  };

  return (
    <div
      ref={setNodeRef}
      className={`tr row${props.isActive ? " row-placeholder" : ""}${props.overSide ? ` row-over-${props.overSide}` : ""}`}
      style={style}
    >
      <RowCells cells={props.cells} handleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function RowCells(props: { cells: Cell<Row, unknown>[]; handleProps?: object }) {
  return (
    <>
      <div className="td td-drag">
        <button className="drag-handle" {...props.handleProps}>
          ⠿
        </button>
      </div>
      {props.cells.slice(1).map((cell) => (
        <div className={`td td-${cell.column.id}`} key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </>
  );
}

export default App;
