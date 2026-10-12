import { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  type Cell,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DndContext, useDraggable } from "@dnd-kit/core";
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
                  isOver={
                    overIndex !== null &&
                    activeIndex !== null &&
                    virtualRow.index === overIndex &&
                    virtualRow.index !== activeIndex
                  }
                  cells={row.getVisibleCells()}
                />
              );
            })}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function DraggableRow(props: {
  index: number;
  start: number;
  isActive: boolean;
  isOver: boolean;
  cells: Cell<Row, unknown>[];
}) {
  // The drag handle's id is the row's CURRENT index, not a stable row id — that's what
  // lets useVirtualRowReorder derive the drop target from pointer math alone.
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: props.index });

  const style: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: ROW_HEIGHT,
    transform: `translateY(${props.start}px) ${
      props.isActive && transform ? `translate(${transform.x}px, ${transform.y}px)` : ""
    }`,
    zIndex: props.isActive ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className={`tr row${props.isActive ? " row-active" : ""}${props.isOver ? " row-over" : ""}`}
      style={style}
    >
      <div className="td td-drag">
        <button className="drag-handle" {...attributes} {...listeners}>
          ⠿
        </button>
      </div>
      {props.cells.slice(1).map((cell) => (
        <div className={`td td-${cell.column.id}`} key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </div>
  );
}

export default App;
