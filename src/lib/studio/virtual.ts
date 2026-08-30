export function windowRange(
  length: number,
  scrollTop: number,
  viewport: number,
  rowHeight: number,
  overscan = 8,
): { start: number; end: number } {
  if (length <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewport / rowHeight) + overscan * 2;
  const end = Math.min(length, start + visible);
  return { start, end };
}
