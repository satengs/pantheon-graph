import { useEffect, useMemo, useRef, useState, type PointerEvent as RE } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { buildGraph } from "@/lib/graph/model";
import { useStudio, type GraphLayout } from "@/store/studio";
import type { GraphNode } from "@/lib/graph/types";

type Pt = { x: number; y: number };

const LAYOUTS: { id: GraphLayout; label: string }[] = [
  { id: "tree", label: "Tree" },
  { id: "circle", label: "Circle" },
  { id: "breadthfirst", label: "Layers" },
  { id: "grid", label: "Grid" },
];

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function layoutOf(kind: GraphLayout, nodes: GraphNode[], explode: boolean): Map<string, Pt> {
  const pos = new Map<string, Pt>();
  const brands = nodes.filter((n) => n.kind === "brand");
  const hubs = nodes.filter((n) => n.kind === "product" || n.kind === "glossary");
  const pages = nodes.filter((n) => n.kind === "page");

  if (kind === "circle") {
    brands.forEach((b) => pos.set(b.id, { x: b.brand === "achieve" ? 280 : -280, y: 0 }));
    const byBrand = new Map<string, GraphNode[]>();
    for (const h of hubs) {
      const k = h.brand ?? "fdr";
      byBrand.set(k, [...(byBrand.get(k) ?? []), h]);
    }
    for (const [brand, list] of byBrand) {
      const origin = pos.get(`brand:${brand}`) ?? { x: 0, y: 0 };
      const radius = explode ? 170 : 150;
      list.forEach((h, i) => {
        const a = -Math.PI / 2 + (i / Math.max(list.length, 1)) * Math.PI * 2;
        pos.set(h.id, { x: r2(origin.x + Math.cos(a) * radius), y: r2(origin.y + Math.sin(a) * radius) });
      });
    }
  } else if (kind === "grid") {
    const rest = [...brands, ...hubs];
    const cols = Math.max(3, Math.ceil(Math.sqrt(rest.length)));
    rest.forEach((n, i) => {
      pos.set(n.id, { x: r2(((i % cols) - (cols - 1) / 2) * 160), y: r2(Math.floor(i / cols) * 110 - 80) });
    });
  } else if (kind === "breadthfirst") {
    brands.forEach((b, i) => {
      pos.set(b.id, { x: r2((i - (brands.length - 1) / 2) * 420), y: -210 });
    });
    const byBrand = new Map<string, GraphNode[]>();
    for (const h of hubs) {
      const k = h.brand ?? "fdr";
      byBrand.set(k, [...(byBrand.get(k) ?? []), h]);
    }
    for (const [brand, list] of byBrand) {
      const bx = pos.get(`brand:${brand}`)?.x ?? 0;
      list.forEach((h, i) => {
        pos.set(h.id, { x: r2(bx + (i - (list.length - 1) / 2) * 120), y: -40 });
      });
    }
  } else {
    brands.forEach((b, i) => {
      pos.set(b.id, { x: r2((i - (brands.length - 1) / 2) * 420), y: -220 });
    });
    const byBrand = new Map<string, GraphNode[]>();
    for (const h of hubs) {
      const k = h.brand ?? "fdr";
      byBrand.set(k, [...(byBrand.get(k) ?? []), h]);
    }
    for (const [brand, list] of byBrand) {
      const origin = pos.get(`brand:${brand}`) ?? { x: 0, y: 0 };
      list.forEach((h, i) => {
        pos.set(h.id, { x: r2(origin.x + (i - (list.length - 1) / 2) * 118), y: origin.y + 150 });
      });
    }
  }

  const pageGroups = new Map<string, GraphNode[]>();
  for (const p of pages) {
    const hid = `hub:${p.brand}:${p.product}`;
    pageGroups.set(hid, [...(pageGroups.get(hid) ?? []), p]);
  }
  for (const [hid, list] of pageGroups) {
    const origin = pos.get(hid) ?? { x: 0, y: 0 };
    list.forEach((p, i) => {
      if (kind === "circle") {
        const a = (i / Math.max(list.length, 1)) * Math.PI * 2;
        pos.set(p.id, { x: r2(origin.x + Math.cos(a) * 46), y: r2(origin.y + Math.sin(a) * 46) });
      } else {
        pos.set(p.id, { x: r2(origin.x + (i - (list.length - 1) / 2) * 28), y: origin.y + 78 });
      }
    });
  }
  return pos;
}

export function GraphCanvas() {
  const explode = useStudio((s) => s.explode);
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectNode = useStudio((s) => s.selectNode);
  const selectIssue = useStudio((s) => s.selectIssue);
  const graphLayout = useStudio((s) => s.graphLayout);
  const setGraphLayout = useStudio((s) => s.setGraphLayout);
  const maximized = useStudio((s) => s.maximized);
  const setMaximized = useStudio((s) => s.setMaximized);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<null | { kind: "pan" | "node"; id?: string; x: number; y: number; ox: number; oy: number }>(null);
  const [offsets, setOffsets] = useState<Record<string, Pt>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    try {
      const raw = window.localStorage.getItem("origin.graphOffsets");
      if (raw) setOffsets(JSON.parse(raw) as Record<string, Pt>);
    } catch {
      /* ignore */
    }
  }, []);

  const graph = useMemo(
    () => buildGraph({ explode, brand, product, layer }),
    [explode, brand, product, layer],
  );
  const base = useMemo(() => layoutOf(graphLayout, graph.nodes, explode), [graph.nodes, explode, graphLayout]);

  function at(id: string): Pt | undefined {
    const p = base.get(id);
    if (!p) return undefined;
    const o = offsets[id];
    return o ? { x: p.x + o.x, y: p.y + o.y } : p;
  }

  const vb = { x: -560, y: -340, w: 1120, h: 720 };

  function clientToSvg(e: RE<SVGSVGElement> | PointerEvent): Pt {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: vb.x + ((e.clientX - r.left) / r.width) * vb.w,
      y: vb.y + ((e.clientY - r.top) / r.height) * vb.h,
    };
  }

  function nodeFill(n: GraphNode) {
    if (n.kind === "page") return "var(--color-raised)";
    return "var(--color-surface)";
  }
  function nodeStroke(n: GraphNode) {
    if (n.id === selectedNodeId) return "var(--color-accent)";
    if (n.brand === "fdr") return "var(--color-fdr)";
    if (n.brand === "achieve") return "var(--color-achieve)";
    return "color-mix(in oklab, var(--color-fg) 18%, transparent)";
  }
  function nodeR(n: GraphNode) {
    if (n.kind === "brand") return 42;
    if (n.kind === "page") return 6;
    if (n.kind === "glossary") return 22;
    return 26;
  }

  const full = maximized === "graph";

  return (
    <div className={`relative flex h-full min-h-[280px] w-full flex-col overflow-hidden rounded-xl bg-bg ${full ? "fixed inset-0 z-50 rounded-none" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface px-2 py-1.5">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            title={`${l.label} layout`}
            onClick={() => {
              setGraphLayout(l.id);
              setOffsets({});
              window.localStorage.removeItem("origin.graphOffsets");
            }}
            className={`h-8 rounded-md px-2.5 text-xs ${graphLayout === l.id ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
          >
            {l.label}
          </button>
        ))}
        <span className="px-2 text-[11px] text-subtle">Drag nodes · labels are the relationship</span>
        <button
          type="button"
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-md bg-raised px-2 text-xs text-muted"
          onClick={() => setMaximized(full ? null : "graph")}
        >
          {full ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {full ? "Exit" : "Full screen"}
        </button>
      </div>
      {ready ? (
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="h-full min-h-0 w-full flex-1 touch-none"
          role="img"
          aria-label="Content graph. Drag nodes. Edges show relationships."
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget && (e.target as Element).tagName !== "svg") return;
            const s = clientToSvg(e);
            setDrag({ kind: "pan", x: s.x, y: s.y, ox: pan.x, oy: pan.y });
          }}
          onPointerMove={(e) => {
            if (!drag) return;
            const s = clientToSvg(e);
            if (drag.kind === "pan") {
              setPan({ x: drag.ox + (s.x - drag.x), y: drag.oy + (s.y - drag.y) });
            } else if (drag.id) {
              const next = { ...offsets, [drag.id]: { x: drag.ox + (s.x - drag.x), y: drag.oy + (s.y - drag.y) } };
              setOffsets(next);
            }
          }}
          onPointerUp={() => {
            if (drag?.kind === "node") window.localStorage.setItem("origin.graphOffsets", JSON.stringify(offsets));
            setDrag(null);
          }}
          onPointerLeave={() => setDrag(null)}
          onClick={() => selectNode(null)}
        >
          <g transform={`translate(${r2(pan.x)} ${r2(pan.y)})`}>
            {graph.edges.map((e) => {
              const a = at(e.source);
              const b = at(e.target);
              if (!a || !b) return null;
              const conflict = e.kind === "conflict";
              const sameAs = e.kind === "sameAs";
              const suggests = e.kind === "suggests";
              const mx = r2((a.x + b.x) / 2);
              const my = r2((a.y + b.y) / 2 - 14);
              return (
                <g
                  key={e.id}
                  className="cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (e.issueId) selectIssue(e.issueId);
                  }}
                >
                  <path
                    d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={
                      conflict
                        ? "var(--color-danger)"
                        : sameAs
                          ? "var(--color-accent)"
                          : suggests
                            ? "var(--color-achieve)"
                            : "color-mix(in oklab, var(--color-fg) 22%, transparent)"
                    }
                    strokeWidth={conflict || sameAs || suggests ? 1.8 : 1.2}
                    strokeDasharray={conflict ? "5 4" : sameAs ? "2 3" : suggests ? "6 4" : undefined}
                  />
                  {e.label ? (
                    <text
                      x={mx}
                      y={my + 4}
                      textAnchor="middle"
                      fill="var(--color-fg)"
                      fontSize={9}
                      fontWeight={600}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {e.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {graph.nodes.map((n) => {
              const p = at(n.id);
              if (!p) return null;
              const radius = nodeR(n);
              const label =
                n.kind === "brand" ? (n.brand === "fdr" ? "FDR" : "Achieve") : n.kind === "page" ? "" : n.label;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  className="cursor-grab"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    svgRef.current?.setPointerCapture(ev.pointerId);
                    const s = clientToSvg(ev as unknown as RE<SVGSVGElement>);
                    const o = offsets[n.id] ?? { x: 0, y: 0 };
                    setDrag({ kind: "node", id: n.id, x: s.x, y: s.y, ox: o.x, oy: o.y });
                    selectNode(n.id);
                  }}
                >
                  {n.kind === "glossary" ? (
                    <rect
                      x={-radius}
                      y={-radius}
                      width={radius * 2}
                      height={radius * 2}
                      rx={3}
                      transform="rotate(45)"
                      fill={nodeFill(n)}
                      stroke={nodeStroke(n)}
                      strokeWidth={n.id === selectedNodeId ? 2.5 : 1.5}
                    />
                  ) : (
                    <circle
                      r={radius}
                      fill={nodeFill(n)}
                      stroke={nodeStroke(n)}
                      strokeWidth={n.id === selectedNodeId ? 2.5 : n.kind === "brand" ? 2 : 1.4}
                    />
                  )}
                  {label ? (
                    <text
                      y={4}
                      textAnchor="middle"
                      fill="var(--color-fg)"
                      fontSize={n.kind === "brand" ? 12 : 8}
                      fontWeight={600}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <div className="absolute inset-0 bg-bg" />
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 text-[10px] uppercase tracking-wide text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-fdr" /> FDR
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-achieve" /> Achieve
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-3 bg-danger" /> Issue on the edge
        </span>
      </div>
    </div>
  );
}
