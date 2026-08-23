import { useEffect, useMemo, useState } from "react";
import { buildGraph } from "@/lib/graph/model";
import { useStudio } from "@/store/studio";
import type { GraphNode } from "@/lib/graph/types";

type Pt = { x: number; y: number };

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function layout(nodes: GraphNode[], explode: boolean): Map<string, Pt> {
  const pos = new Map<string, Pt>();
  const brands = nodes.filter((n) => n.kind === "brand");
  const brandX: Record<string, number> = { fdr: -280, achieve: 280 };
  brands.forEach((b) => {
    pos.set(b.id, { x: brandX[b.brand ?? "fdr"] ?? 0, y: 0 });
  });

  const hubs = nodes.filter((n) => n.kind === "product" || n.kind === "glossary");
  const byBrand = new Map<string, GraphNode[]>();
  for (const h of hubs) {
    const key = h.brand ?? "fdr";
    const list = byBrand.get(key) ?? [];
    list.push(h);
    byBrand.set(key, list);
  }
  for (const [brand, list] of byBrand) {
    const origin = pos.get(`brand:${brand}`) ?? { x: 0, y: 0 };
    const radius = explode ? 168 : 148;
    list.forEach((h, i) => {
      const a = -Math.PI / 2 + (i / Math.max(list.length, 1)) * Math.PI * 2;
      pos.set(h.id, {
        x: r2(origin.x + Math.cos(a) * radius),
        y: r2(origin.y + Math.sin(a) * radius),
      });
    });
  }

  const issues = nodes.filter((n) => n.kind === "issue");
  issues.forEach((iss, i) => {
    const a = (i / Math.max(issues.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(iss.id, { x: r2(Math.cos(a) * 360), y: r2(Math.sin(a) * 210) });
  });

  const pages = nodes.filter((n) => n.kind === "page");
  const pageGroups = new Map<string, GraphNode[]>();
  for (const p of pages) {
    const hid = `hub:${p.brand}:${p.product}`;
    const list = pageGroups.get(hid) ?? [];
    list.push(p);
    pageGroups.set(hid, list);
  }
  for (const [hid, list] of pageGroups) {
    const origin = pos.get(hid) ?? { x: 0, y: 0 };
    list.forEach((p, i) => {
      const a = (i / Math.max(list.length, 1)) * Math.PI * 2;
      pos.set(p.id, {
        x: r2(origin.x + Math.cos(a) * 46),
        y: r2(origin.y + Math.sin(a) * 46),
      });
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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<null | { x: number; y: number }>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const graph = useMemo(
    () => buildGraph({ explode, brand, product, layer }),
    [explode, brand, product, layer],
  );
  const pos = useMemo(() => layout(graph.nodes, explode), [graph.nodes, explode]);

  const vb = explode
    ? { x: -520, y: -340, w: 1040, h: 680 }
    : { x: -480, y: -300, w: 960, h: 600 };

  function nodeFill(n: GraphNode) {
    if (n.kind === "issue") return "var(--color-raised)";
    if (n.kind === "page") return "var(--color-raised)";
    return "var(--color-surface)";
  }
  function nodeStroke(n: GraphNode) {
    if (n.id === selectedNodeId) return "var(--color-accent)";
    if (n.kind === "issue") return "var(--color-danger)";
    if (n.brand === "fdr") return "var(--color-fdr)";
    if (n.brand === "achieve") return "var(--color-achieve)";
    return "color-mix(in oklab, var(--color-fg) 18%, transparent)";
  }
  function nodeR(n: GraphNode) {
    if (n.kind === "brand") return 42;
    if (n.kind === "page") return 5;
    if (n.kind === "issue") return 16;
    if (n.kind === "glossary") return 22;
    return 24;
  }

  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden rounded-xl bg-bg">
      {ready ? (
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="h-full w-full touch-none"
          role="img"
          aria-label="Content graph of Freedom Debt Relief and Achieve"
          onPointerDown={(e) => setDragging({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
          onPointerMove={(e) => {
            if (!dragging) return;
            setPan({ x: e.clientX - dragging.x, y: e.clientY - dragging.y });
          }}
          onPointerUp={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
          onClick={() => selectNode(null)}
        >
          <g transform={`translate(${r2(pan.x * 0.4)} ${r2(pan.y * 0.4)})`}>
            {graph.edges.map((e) => {
              const a = pos.get(e.source);
              const b = pos.get(e.target);
              if (!a || !b) return null;
              const conflict = e.kind === "conflict";
              const sameAs = e.kind === "sameAs";
              const cites = e.kind === "cites";
              const mx = r2((a.x + b.x) / 2);
              const my = r2((a.y + b.y) / 2 - 18);
              return (
                <g key={e.id}>
                  <path
                    d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={
                      conflict
                        ? "var(--color-danger)"
                        : sameAs
                          ? "var(--color-accent)"
                          : cites
                            ? "color-mix(in oklab, var(--color-danger) 45%, transparent)"
                            : "color-mix(in oklab, var(--color-fg) 16%, transparent)"
                    }
                    strokeWidth={conflict ? 1.6 : 1.1}
                    strokeDasharray={conflict ? "5 4" : sameAs || cites ? "2 3" : undefined}
                  />
                  {e.label ? (
                    <text
                      x={mx}
                      y={my + 8}
                      textAnchor="middle"
                      className="fill-subtle"
                      fontSize={8}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {e.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {graph.nodes.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const radius = nodeR(n);
              const label =
                n.kind === "brand"
                  ? n.brand === "fdr"
                    ? "FDR"
                    : "Achieve"
                  : n.kind === "issue"
                    ? n.label
                    : n.kind === "page"
                      ? ""
                      : n.label;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x} ${p.y})`}
                  className="cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
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
                      y={n.kind === "issue" ? 3 : 4}
                      textAnchor="middle"
                      fill="var(--color-fg)"
                      fontSize={n.kind === "brand" ? 12 : 8}
                      fontWeight={n.kind === "brand" || n.kind === "issue" ? 600 : 500}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {label}
                    </text>
                  ) : null}
                  {n.count != null && n.kind !== "brand" ? (
                    <text
                      y={radius + 12}
                      textAnchor="middle"
                      fill="var(--color-muted)"
                      fontSize={8}
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {n.count}
                    </text>
                  ) : null}
                  {n.kind === "brand" && n.count != null ? (
                    <text
                      y={16}
                      textAnchor="middle"
                      fill="var(--color-muted)"
                      fontSize={8}
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {n.count}
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
      <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 text-[10px] uppercase tracking-wide text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-fdr" /> FDR
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-achieve" /> Achieve
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-3 bg-danger" /> Conflict
        </span>
      </div>
    </div>
  );
}
