import { useEffect, useRef, useState, type ReactNode } from "react";
import { windowRange } from "@/lib/studio/virtual";

export function VirtualList<T>({
  items,
  rowHeight,
  overscan = 8,
  className,
  selectedIndex,
  getKey,
  renderRow,
}: {
  items: T[];
  rowHeight: number;
  overscan?: number;
  className?: string;
  selectedIndex?: number;
  getKey: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(320);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight || 320);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (selectedIndex == null || selectedIndex < 0) return;
    const el = ref.current;
    if (!el) return;
    const top = selectedIndex * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + rowHeight - el.clientHeight;
  }, [selectedIndex, rowHeight]);

  const { start, end } = windowRange(items.length, scrollTop, height, rowHeight, overscan);
  const slice = items.slice(start, end);

  return (
    <div
      ref={ref}
      className={className}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {slice.map((item, i) => {
          const index = start + i;
          return (
            <div
              key={getKey(item, index)}
              style={{ position: "absolute", top: index * rowHeight, height: rowHeight, left: 0, right: 0 }}
            >
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
