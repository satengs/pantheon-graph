import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

function readNum(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const n = Number(window.localStorage.getItem(key));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function HSplit({
  storageKey,
  initial = 360,
  min = 240,
  max = 720,
  left,
  right,
}: {
  storageKey: string;
  initial?: number;
  min?: number;
  max?: number;
  left: ReactNode;
  right?: ReactNode | null;
}) {
  const [w, setW] = useState(initial);
  const drag = useRef(false);
  useEffect(() => setW(readNum(storageKey, initial)), [storageKey, initial]);

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!drag.current) return;
      const next = Math.min(max, Math.max(min, window.innerWidth - e.clientX));
      setW(next);
    },
    [max, min],
  );
  const onUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = false;
    window.localStorage.setItem(storageKey, String(w));
  }, [storageKey, w]);

  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onMove, onUp]);

  if (!right) {
    return <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col">{left}</div>;
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{left}</div>
      <button
        type="button"
        aria-label="Resize inspector"
        onPointerDown={() => {
          drag.current = true;
        }}
        className="hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-accent lg:block"
      />
      <div
        style={{ width: w }}
        className="flex min-h-[240px] min-w-0 w-full flex-col border-t border-border bg-surface lg:min-h-0 lg:w-auto lg:border-t-0 lg:border-l"
      >
        {right}
      </div>
    </div>
  );
}

export function VSplit({
  storageKey,
  initial = 160,
  min = 88,
  max = 480,
  top,
  bottom,
}: {
  storageKey: string;
  initial?: number;
  min?: number;
  max?: number;
  top: ReactNode;
  bottom: ReactNode;
}) {
  const [h, setH] = useState(initial);
  const drag = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setH(readNum(storageKey, initial)), [storageKey, initial]);

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!drag.current || !box.current) return;
      const rect = box.current.getBoundingClientRect();
      const next = Math.min(max, Math.max(min, rect.bottom - e.clientY));
      setH(next);
    },
    [max, min],
  );
  const onUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = false;
    window.localStorage.setItem(storageKey, String(h));
  }, [storageKey, h]);

  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onMove, onUp]);

  return (
    <div ref={box} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{top}</div>
      <button
        type="button"
        aria-label="Resize write pane"
        onPointerDown={() => {
          drag.current = true;
        }}
        className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-accent"
      />
      <div className="min-h-0 overflow-hidden" style={{ height: h }}>
        {bottom}
      </div>
    </div>
  );
}
