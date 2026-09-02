import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { ArrowLeft, GripVertical } from "lucide-react";
import { useStudio } from "@/store/studio";

const KEY = "origin.graphClickNotePos";
const DEFAULT = { x: 12, y: 12 };

function stop<E extends { stopPropagation: () => void }>(e: E) {
  e.stopPropagation();
}

export function GraphClickNote() {
  const graphFocusStack = useStudio((s) => s.graphFocusStack);
  const toggleCluster = useStudio((s) => s.toggleCluster);
  const [pos, setPos] = useState(DEFAULT);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof p.x === "number" && typeof p.y === "number") setPos({ x: p.x, y: p.y });
    } catch {
      /* ignore */
    }
  }, []);

  function persist(next: { x: number; y: number }) {
    setPos(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function onHandleDown(e: PE<HTMLElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  }

  function onHandleMove(e: PE<HTMLElement>) {
    e.stopPropagation();
    const d = drag.current;
    if (!d) return;
    persist({
      x: Math.max(0, d.ox + (e.clientX - d.px)),
      y: Math.max(0, d.oy + (e.clientY - d.py)),
    });
  }

  function onHandleUp(e: PE<HTMLElement>) {
    e.stopPropagation();
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  }

  const last = graphFocusStack[graphFocusStack.length - 1];

  return (
    <aside
      className="absolute z-20 w-[14.5rem] rounded-md border border-border bg-surface text-[11px] leading-snug text-fg shadow-[var(--shadow-border)]"
      style={{ left: pos.x, top: pos.y, borderLeftWidth: 3, borderLeftColor: "#c4b8a4" }}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onClick={stop}
      onDoubleClick={stop}
      onWheel={stop}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className="flex cursor-grab items-center gap-1 border-b border-border px-2 py-1.5 active:cursor-grabbing"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
      >
        <GripVertical className="size-3.5 shrink-0 text-[#c4b8a4]" aria-hidden />
        <span className="font-medium text-[#c4b8a4]">Clicks</span>
      </div>
      <div className="px-2.5 py-2 text-muted">
        <ul className="flex flex-col gap-0.5">
          <li>• Left: select only</li>
          <li>• Right: open inspector</li>
          <li>• Double-click: expand or fold this product’s pages as one group</li>
        </ul>
        <p className="mt-2 font-medium text-[#c4b8a4]">Move</p>
        <ul className="mt-0.5 flex flex-col gap-0.5">
          <li>• Drag the group: hub + pages move together</li>
          <li>• Layout: rearranges that group</li>
        </ul>
        {last ? (
          <button
            type="button"
            title="Fold this product’s pages"
            className="mt-2 inline-flex h-7 items-center gap-1 rounded-md bg-raised px-2 text-[11px] text-muted"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleCluster(last);
            }}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </button>
        ) : null}
      </div>
    </aside>
  );
}
