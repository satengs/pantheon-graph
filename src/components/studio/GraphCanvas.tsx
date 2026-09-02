import { useEffect, useMemo, useRef, useState, type PointerEvent as RE } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { buildGraph } from "@/lib/graph/model";
import { nodeLabel, TREE_SUGGESTIONS } from "@/lib/graph/suggestions";
import { useStudio, type GraphLayout } from "@/store/studio";
import { setIncludeParent as persistIncludeParent } from "@/lib/server/orgs";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";

type Pt = { x: number; y: number };

const LAYOUTS: { id: GraphLayout; label: string }[] = [
  { id: "tree", label: "Tree" },
  { id: "circle", label: "Circle" },
  { id: "breadthfirst", label: "Layers" },
  { id: "grid", label: "Grid" },
];

const DRAG_PX = 14;

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function pairKey(e: GraphEdge) {
  return `${[e.source, e.target].sort().join("|")}:${e.kind}`;
}

function controlPoint(a: Pt, b: Pt, idx: number, kind: GraphEdge["kind"], explode: boolean): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if (kind === "owns" || kind === "cites") {
    return { x: r2(mx), y: r2(my - 8) };
  }
  if (kind === "sameAs" && my > 0) {
    return { x: r2(mx), y: r2(my + 80) };
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const ring = explode ? 72 : 22;
  const base = kind === "conflict" ? ring + 28 : kind === "sameAs" ? 42 : ring;
  const sign = idx % 2 === 0 ? 1 : -1;
  const mag = base + Math.floor(idx / 2) * 26;
  return { x: r2(mx + px * mag * sign), y: r2(my + py * mag * sign) };
}


function layoutOf(
  kind: GraphLayout,
  nodes: GraphNode[],
  edges: GraphEdge[],
  explode: boolean,
): Map<string, Pt> {
  const pos = new Map<string, Pt>();
  const brands = nodes.filter((n) => n.kind === "brand");
  const parents = nodes.filter((n) => n.kind === "parent");
  const hubs = nodes.filter((n) => n.kind === "product" || n.kind === "glossary");
  const pages = nodes.filter((n) => n.kind === "page");
  const issues = nodes.filter((n) => n.kind === "issue");

  if (kind === "circle") {
    brands.forEach((b) => pos.set(b.id, { x: b.brand === "achieve" ? 280 : -280, y: 0 }));
    const byBrand = new Map<string, GraphNode[]>();
    for (const h of hubs) {
      const k = h.brand ?? "fdr";
      byBrand.set(k, [...(byBrand.get(k) ?? []), h]);
    }
    for (const [brand, list] of byBrand) {
      const origin = pos.get(`brand:${brand}`) ?? { x: 0, y: 0 };
      const radius = explode || pages.length ? 190 : 150;
      list.forEach((h, i) => {
        const a = -Math.PI / 2 + (i / Math.max(list.length, 1)) * Math.PI * 2;
        pos.set(h.id, { x: r2(origin.x + Math.cos(a) * radius), y: r2(origin.y + Math.sin(a) * radius) });
      });
    }
  } else if (kind === "grid") {
    const rest = [...brands, ...hubs];
    const cols = Math.max(3, Math.ceil(Math.sqrt(rest.length)));
    rest.forEach((n, i) => {
      pos.set(n.id, { x: r2(((i % cols) - (cols - 1) / 2) * 170), y: r2(Math.floor(i / cols) * 120 - 80) });
    });
  } else if (kind === "breadthfirst") {
    brands.forEach((b, i) => {
      pos.set(b.id, { x: r2((i - (brands.length - 1) / 2) * 460), y: -230 });
    });
    const byBrand = new Map<string, GraphNode[]>();
    for (const h of hubs) {
      const k = h.brand ?? "fdr";
      byBrand.set(k, [...(byBrand.get(k) ?? []), h]);
    }
    for (const [brand, list] of byBrand) {
      const bx = pos.get(`brand:${brand}`)?.x ?? 0;
      list.forEach((h, i) => {
        pos.set(h.id, { x: r2(bx + (i - (list.length - 1) / 2) * 128), y: -40 });
      });
    }
  } else {
    brands.forEach((b, i) => {
      pos.set(b.id, { x: r2((i - (brands.length - 1) / 2) * 460), y: -230 });
    });
    const byBrand = new Map<string, GraphNode[]>();
    for (const h of hubs) {
      const k = h.brand ?? "fdr";
      byBrand.set(k, [...(byBrand.get(k) ?? []), h]);
    }
    for (const [brand, list] of byBrand) {
      const origin = pos.get(`brand:${brand}`) ?? { x: 0, y: 0 };
      const products = list.filter((h) => h.kind !== "glossary" && h.product !== "glossary");
      const gloss = list.filter((h) => h.kind === "glossary" || h.product === "glossary");
      products.forEach((h, i) => {
        pos.set(h.id, {
          x: r2(origin.x + (i - (products.length - 1) / 2) * 128),
          y: origin.y + 160,
        });
      });
      gloss.forEach((h, i) => {
        pos.set(h.id, {
          x: r2(origin.x + (i - (gloss.length - 1) / 2) * 80),
          y: origin.y + 300,
        });
      });
    }
  }

  if (parents.length) {
    const bxs = brands.map((b) => pos.get(b.id)?.x ?? 0);
    const bys = brands.map((b) => pos.get(b.id)?.y ?? -230);
    const cx = bxs.length ? (Math.min(...bxs) + Math.max(...bxs)) / 2 : 0;
    const cy = (bys[0] ?? -230) - 180;
    parents.forEach((p, i) => {
      pos.set(p.id, { x: r2(cx + (i - (parents.length - 1) / 2) * 160), y: r2(cy) });
    });
  }

  const pairIndex = new Map<string, number>();
  for (const n of issues) {
    const sug = TREE_SUGGESTIONS.find((t) => t.code === n.issueId || `issue:${t.code}` === n.id);
    const a = sug ? pos.get(sug.source) : undefined;
    const b = sug ? pos.get(sug.target) : undefined;
    const pair = sug ? [sug.source, sug.target].sort().join("|") : n.id;
    const idx = pairIndex.get(pair) ?? 0;
    pairIndex.set(pair, idx + 1);
    if (a && b) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const spread = (idx - 0.5) * 36;
      pos.set(n.id, { x: r2(mx - (dy / len) * (42 + spread)), y: r2(my + (dx / len) * (42 + spread)) });
    } else {
      const origin = a ?? b ?? { x: 0, y: -40 };
      const ang = -Math.PI / 2 + idx * 0.55;
      pos.set(n.id, { x: r2(origin.x + Math.cos(ang) * 90), y: r2(origin.y + Math.sin(ang) * 90) });
    }
  }

  const pageGroups = new Map<string, GraphNode[]>();
  for (const p of pages) {
    const via = edges.find((e) => e.target === p.id);
    const hid = via?.source ?? (p.brand && p.product ? `hub:${p.brand}:${p.product}` : "");
    pageGroups.set(hid, [...(pageGroups.get(hid) ?? []), p]);
  }
  for (const [hid, list] of pageGroups) {
    const origin = pos.get(hid) ?? { x: 0, y: 0 };
    list.forEach((p, i) => {
      if (kind === "circle") {
        const a = -Math.PI / 2 + (i / Math.max(list.length, 1)) * Math.PI * 2;
        pos.set(p.id, { x: r2(origin.x + Math.cos(a) * 56), y: r2(origin.y + Math.sin(a) * 56) });
      } else if (kind === "grid") {
        const cols = Math.max(3, Math.ceil(Math.sqrt(list.length)));
        pos.set(p.id, {
          x: r2(origin.x + ((i % cols) - (cols - 1) / 2) * 44),
          y: r2(origin.y + 58 + Math.floor(i / cols) * 40),
        });
      } else {
        const cols = Math.min(5, Math.max(1, list.length));
        pos.set(p.id, {
          x: r2(origin.x + ((i % cols) - (cols - 1) / 2) * 42),
          y: r2(origin.y + 62 + Math.floor(i / cols) * 38),
        });
      }
    });
  }
  return pos;
}

function fitView(pts: Pt[], pad: number) {
  if (!pts.length) return { x: -560, y: -340, w: 1120, h: 720 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(640, maxX - minX + pad * 2);
  const h = Math.max(420, maxY - minY + pad * 2);
  return { x: r2(minX - pad), y: r2(minY - pad), w: r2(w), h: r2(h) };
}

export function GraphCanvas() {
  const explode = useStudio((s) => s.explode);
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectNode = useStudio((s) => s.selectNode);
  const setGraphInspectorOpen = useStudio((s) => s.setGraphInspectorOpen);
  const selectIssue = useStudio((s) => s.selectIssue);
  const graphLayout = useStudio((s) => s.graphLayout);
  const setGraphLayout = useStudio((s) => s.setGraphLayout);
  const maximized = useStudio((s) => s.maximized);
  const setMaximized = useStudio((s) => s.setMaximized);
  const graphFocusStack = useStudio((s) => s.graphFocusStack);
  const pushGraphFocus = useStudio((s) => s.pushGraphFocus);
  const popGraphFocus = useStudio((s) => s.popGraphFocus);
  const toggleCluster = useStudio((s) => s.toggleCluster);
  const collapsedClusters = useStudio((s) => s.collapsedClusters);
  const includeParent = useStudio((s) => s.includeParent);
  const setIncludeParent = useStudio((s) => s.setIncludeParent);
  const parentId = useStudio((s) => s.parentId);
  const graphOrg = useStudio((s) => s.graphOrg);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<null | {
    kind: "pan" | "node";
    id?: string;
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
  }>(null);
  const [offsets, setOffsets] = useState<Record<string, Pt>>({});
  const [ready, setReady] = useState(false);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const lastExpand = useRef(0);
  const dragRef = useRef<typeof drag>(null);
  dragRef.current = drag;

  useEffect(() => {
    setReady(true);
    try {
      const raw = window.localStorage.getItem("origin.graphOffsets");
      if (raw) setOffsets(JSON.parse(raw) as Record<string, Pt>);
    } catch {
      /* ignore */
    }
  }, []);

  const full = maximized === "graph";

  useEffect(() => {
    if (!full) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(null);
      if (e.key === "Backspace") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        popGraphFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
      window.removeEventListener("keydown", onKey);
    };
  }, [full, setMaximized, popGraphFocus]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [graphFocusStack.length, full, graphLayout]);

  const graph = useMemo(
    () =>
      buildGraph({
        explode: false,
        brand,
        product,
        layer,
        expandIds: graphFocusStack,
        collapsedIds: collapsedClusters,
        includeParent,
        org: graphOrg ?? undefined,
        ruleCodes: attachedRuleCodes,
      }),
    [explode, brand, product, layer, graphFocusStack, collapsedClusters, includeParent, graphOrg, attachedRuleCodes],
  );
  const base = useMemo(
    () => layoutOf(graphLayout, graph.nodes, graph.edges, explode),
    [graph.nodes, graph.edges, explode, graphLayout],
  );

  const edgePairIndex = useMemo(() => {
    const counts = new Map<string, number>();
    const idx = new Map<string, number>();
    for (const e of graph.edges) {
      const k = pairKey(e);
      const i = counts.get(k) ?? 0;
      counts.set(k, i + 1);
      idx.set(e.id, i);
    }
    return idx;
  }, [graph.edges]);

  function at(id: string): Pt | undefined {
    const p = base.get(id);
    if (!p) return undefined;
    const o = offsets[id];
    return o ? { x: p.x + o.x, y: p.y + o.y } : p;
  }

  const vb = useMemo(() => {
    const pts: Pt[] = [];
    for (const n of graph.nodes) {
      const p = base.get(n.id);
      if (!p) continue;
      const o = offsets[n.id];
      pts.push(o ? { x: p.x + o.x, y: p.y + o.y } : p);
    }
    return fitView(pts, full ? 96 : 72);
  }, [graph.nodes, base, offsets, full]);

  function clientToSvg(e: RE<SVGSVGElement> | PointerEvent): Pt {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const vw = vb.w / zoom;
    const vh = vb.h / zoom;
    const vx = vb.x + (vb.w - vw) / 2;
    const vy = vb.y + (vb.h - vh) / 2;
    return {
      x: vx + ((e.clientX - r.left) / r.width) * vw,
      y: vy + ((e.clientY - r.top) / r.height) * vh,
    };
  }

  function nodeFill(n: GraphNode) {
    if (n.kind === "issue") return "var(--color-raised)";
    if (n.kind === "page") return "var(--color-raised)";
    return "var(--color-surface)";
  }
  function nodeStroke(n: GraphNode) {
    if (n.kind === "issue") {
      const k = TREE_SUGGESTIONS.find((t) => t.code === n.issueId)?.kind;
      if (k === "conflict") return "var(--color-danger)";
      if (k === "sameAs") return "var(--color-accent)";
      return "var(--color-achieve)";
    }
    if (n.kind === "parent") return "var(--color-accent)";
    if (n.brand === "fdr") return "var(--color-fdr)";
    if (n.brand === "achieve") return "var(--color-achieve)";
    return "color-mix(in oklab, var(--color-fg) 18%, transparent)";
  }
  function nodeR(n: GraphNode) {
    if (n.kind === "parent") return 50;
    if (n.kind === "brand") return 44;
    if (n.kind === "page") return 9;
    if (n.kind === "issue") return 18;
    if (n.kind === "glossary") return 22;
    return 26;
  }

  function expandNode(n: GraphNode) {
    const now = Date.now();
    if (now - lastExpand.current < 350) return;
    lastExpand.current = now;
    if (n.kind === "page") return;
    if (n.kind === "product" || n.kind === "glossary" || n.kind === "brand") {
      toggleCluster(n.id);
      selectNode(n.id);
      return;
    }
    pushGraphFocus(n.id);
    if (n.issueId) selectIssue(n.issueId);
    else selectNode(n.id);
  }

  const lastFocus = graphFocusStack[graphFocusStack.length - 1];

  const shell = (
    <div
      className={
        full
          ? "fixed inset-0 z-50 flex h-dvh w-full flex-col bg-bg"
          : "relative flex h-full min-h-72 w-full flex-col overflow-hidden rounded-xl bg-bg"
      }
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-surface px-2 py-1.5">
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
            className={`h-9 rounded-md px-2.5 text-xs ${graphLayout === l.id ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
          >
            {l.label}
          </button>
        ))}
        <span className="hidden px-2 text-xs text-subtle sm:inline">
          Drag to move · double-click a brand or product to show or hide its pages
        </span>
        <label className="flex h-9 items-center gap-1.5 rounded-md bg-raised px-2.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={includeParent}
            onChange={(e) => {
              const on = e.target.checked;
              setIncludeParent(on);
              if (parentId) void persistIncludeParent({ data: { parentId, include: on } });
            }}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          Parent
        </label>
        <button
          type="button"
          disabled={!graphFocusStack.length}
          title={lastFocus ? `Undo ${nodeLabel(lastFocus)}` : "Undo last expand"}
          onClick={() => popGraphFocus()}
          className="inline-flex h-9 items-center gap-1 rounded-md bg-raised px-2.5 text-xs text-muted disabled:opacity-40"
        >
          <ArrowLeft className="size-3.5" />
          Back
          {graphFocusStack.length ? (
            <span className="font-mono text-fg">{graphFocusStack.length}</span>
          ) : null}
        </button>
        {lastFocus ? (
          <span className="max-w-[14rem] truncate text-xs text-fg">{nodeLabel(lastFocus)}</span>
        ) : null}
        <button
          type="button"
          className="ml-auto inline-flex h-9 items-center gap-1 rounded-md bg-raised px-2.5 text-xs text-muted"
          onClick={() => setMaximized(full ? null : "graph")}
        >
          {full ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {full ? "Exit" : "Full screen"}
        </button>
      </div>
      {ready ? (
        <svg
          ref={svgRef}
          viewBox={`${r2(vb.x + (vb.w - vb.w / zoom) / 2)} ${r2(vb.y + (vb.h - vb.h / zoom) / 2)} ${r2(vb.w / zoom)} ${r2(vb.h / zoom)}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full min-h-0 w-full flex-1 touch-none bg-bg"
          onWheel={(e) => {
            e.preventDefault();
            const dir = e.deltaY > 0 ? 1 / 1.12 : 1.12;
            setZoom((z) => Math.min(2.8, Math.max(0.45, z * dir)));
          }}
          role="img"
          aria-label="Content graph. Double-click a node to load related nodes. Back undoes the last step."
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget && (e.target as Element).tagName !== "svg") return;
            const s = clientToSvg(e);
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag({ kind: "pan", x: s.x, y: s.y, ox: pan.x, oy: pan.y, moved: false });
            dragRef.current = { kind: "pan", x: s.x, y: s.y, ox: pan.x, oy: pan.y, moved: false };
          }}
          onPointerMove={(e) => {
            const cur = dragRef.current;
            if (!cur) return;
            const s = clientToSvg(e);
            const dist = Math.hypot(s.x - cur.x, s.y - cur.y);
            const moved = cur.moved || dist > DRAG_PX;
            if (cur.kind === "pan") {
              if (moved) setPan({ x: cur.ox + (s.x - cur.x), y: cur.oy + (s.y - cur.y) });
              if (moved && !cur.moved) {
                const next = { ...cur, moved: true };
                dragRef.current = next;
                setDrag(next);
              }
            } else if (cur.id && moved) {
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* already captured */
              }
              setOffsets({ ...offsets, [cur.id]: { x: cur.ox + (s.x - cur.x), y: cur.oy + (s.y - cur.y) } });
              if (!cur.moved) {
                const next = { ...cur, moved: true };
                dragRef.current = next;
                setDrag(next);
              }
            }
          }}
          onPointerUp={(e) => {
            const cur = dragRef.current;
            if (cur?.kind === "node" && cur.moved) {
              window.localStorage.setItem("origin.graphOffsets", JSON.stringify(offsets));
            }
            if (cur?.kind === "node" && cur.id && !cur.moved) {
              /* single click selects via pointerdown; double-click on the node expands */
            }
            dragRef.current = null;
            setDrag(null);
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* not captured */
            }
          }}
          onClick={(e) => {
            e.preventDefault();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g transform={`translate(${r2(pan.x)} ${r2(pan.y)})`}>
            {graph.edges.map((e) => {
              const a = at(e.source);
              const b = at(e.target);
              if (!a || !b) return null;
              const srcN = graph.nodes.find((n) => n.id === e.source);
              const tgtN = graph.nodes.find((n) => n.id === e.target);
              if (e.kind === "suggests" || e.kind === "cites") return null;
              if (e.kind === "conflict" && e.issueId !== "S01") return null;
              if (e.kind === "sameAs" && e.issueId !== "S06") return null;
              if (srcN?.kind === "issue" || tgtN?.kind === "issue") return null;
              const conflict = e.kind === "conflict";
              const sameAs = e.kind === "sameAs";
              const suggests = false;
              const cites = false;
              const idx = edgePairIndex.get(e.id) ?? 0;
              const c = controlPoint(a, b, idx, e.kind, explode);
              const issueNode = e.issueId ? graph.nodes.some((n) => n.id === `issue:${e.issueId}`) : false;
              const showLabel = Boolean(e.label) && (conflict || sameAs);
              const pairTitle = `${nodeLabel(e.source)} ↔ ${nodeLabel(e.target)}${e.label ? ` · ${e.label}` : ""}`;
              const hovered = hoverEdgeId === e.id;
              return (
                <g
                  key={e.id}
                  className="cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (e.issueId) selectIssue(e.issueId);
                  }}
                  onPointerEnter={() => setHoverEdgeId(e.id)}
                  onPointerLeave={() => setHoverEdgeId((id) => (id === e.id ? null : id))}
                >
                  <title>{pairTitle}</title>
                  <path d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={
                      conflict
                        ? "var(--color-danger)"
                        : sameAs
                          ? "var(--color-accent)"
                          : suggests
                            ? "var(--color-achieve)"
                            : cites
                              ? "color-mix(in oklab, var(--color-fg) 28%, transparent)"
                              : "color-mix(in oklab, var(--color-fg) 22%, transparent)"
                    }
                    strokeWidth={conflict || sameAs || suggests ? (hovered ? 2.4 : 1.8) : 1.2}
                    strokeDasharray={conflict ? "5 4" : sameAs ? "2 3" : suggests ? "6 4" : cites ? "1 3" : undefined}
                  />
                  {showLabel ? (
                    <text
                      x={c.x}
                      y={c.y - 4}
                      textAnchor="middle"
                      fill="var(--color-fg)"
                      fontSize={9}
                      fontWeight={600}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {e.label}
                    </text>
                  ) : null}
                  {hovered ? (
                    <text
                      x={c.x}
                      y={c.y + (showLabel ? 12 : 4)}
                      textAnchor="middle"
                      fill="var(--color-fg)"
                      fontSize={10}
                      fontWeight={600}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {`${nodeLabel(e.source)} ↔ ${nodeLabel(e.target)}`}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {graph.nodes.map((n) => {
              if (n.kind === "issue") return null;
              const p = at(n.id);
              if (!p) return null;
              const radius = nodeR(n);
              const label =
                n.kind === "parent"
                  ? n.label
                  : n.kind === "brand"
                    ? n.brand === "fdr"
                      ? "FDR"
                      : n.brand === "achieve"
                        ? "Achieve"
                        : n.label
                    : n.kind === "page"
                      ? ""
                      : n.label;
              const on = n.id === selectedNodeId;
              const r = on ? radius * 1.3 : radius;
              const brandFill = nodeStroke(n);
              const fill =
                n.kind === "page"
                  ? brandFill
                  : on && n.kind !== "parent"
                    ? brandFill
                    : selectedNodeId && !on
                      ? "color-mix(in oklab, var(--color-bg) 35%, var(--color-surface))"
                      : nodeFill(n);
              return (
                <g
                  key={n.id}
                  data-kind={n.kind}
                  data-url={n.url ?? ""}
                  data-selected={on ? "true" : undefined}
                  transform={`translate(${p.x} ${p.y})`}
                  className="cursor-grab"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    const s = clientToSvg(ev as unknown as RE<SVGSVGElement>);
                    const o = offsets[n.id] ?? { x: 0, y: 0 };
                    const gesture = { kind: "node" as const, id: n.id, x: s.x, y: s.y, ox: o.x, oy: o.y, moved: false };
                    dragRef.current = gesture;
                    setDrag(gesture);
                    if (ev.button === 0) {
                      selectNode(n.id);
                      if (n.issueId) selectIssue(n.issueId);
                    }
                  }}
                  onClick={(ev) => ev.stopPropagation()}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    selectNode(n.id);
                    if (n.issueId) selectIssue(n.issueId);
                    setGraphInspectorOpen(true);
                  }}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    expandNode(n);
                  }}
                >
                  {on && n.kind === "glossary" ? (
                    <rect
                      x={-(r + 4)}
                      y={-(r + 4)}
                      width={(r + 4) * 2}
                      height={(r + 4) * 2}
                      rx={4}
                      transform="rotate(45)"
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth={3}
                    />
                  ) : null}
                  {on && n.kind === "page" ? (
                    <circle r={r + 7} fill="none" stroke="#c4b8a4" strokeWidth={5} />
                  ) : on && n.kind !== "glossary" ? (
                    <circle r={r + 4} fill="none" stroke={brandFill} strokeWidth={3} />
                  ) : null}
                  {n.kind === "glossary" ? (
                    <rect
                      x={-r}
                      y={-r}
                      width={r * 2}
                      height={r * 2}
                      rx={3}
                      transform="rotate(45)"
                      fill={fill}
                      stroke={nodeStroke(n)}
                      strokeWidth={on ? 2.2 : 1.5}
                    />
                  ) : (
                    <circle
                      r={r}
                      fill={fill}
                      stroke={on && n.kind === "page" ? "none" : nodeStroke(n)}
                      strokeWidth={on ? (n.kind === "page" ? 0 : 2.2) : n.kind === "brand" || n.kind === "parent" ? 2 : 1.4}
                    />
                  )}
                  {label ? (
                    <text
                      y={n.kind === "product" || n.kind === "glossary" ? r + 12 : 4}
                      textAnchor="middle"
                      fill="var(--color-fg)"
                      fontSize={n.kind === "parent" || n.kind === "brand" ? 12 : 8}
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
        <div className="min-h-0 flex-1 bg-bg" />
      )}
      <div className="absolute bottom-3 right-3 z-10 flex gap-1">
        <button
          type="button"
          title="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.45, z / 1.2))}
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-surface px-2 text-sm text-fg shadow-[var(--shadow-border)]"
        >
          −
        </button>
        <button
          type="button"
          title="Zoom in"
          onClick={() => setZoom((z) => Math.min(2.8, z * 1.2))}
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-surface px-2 text-sm text-fg shadow-[var(--shadow-border)]"
        >
          +
        </button>
        <button
          type="button"
          title="Fit"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="inline-flex h-8 items-center justify-center rounded-md bg-surface px-2 text-xs text-fg shadow-[var(--shadow-border)]"
        >
          Fit
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 text-[10px] uppercase tracking-wide text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-accent" /> Parent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-fdr" /> FDR
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-achieve" /> Achieve
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-3 bg-danger" /> Conflict
        </span>
        <span className="flex items-center gap-1.5">Double-click cluster = pages</span>
      </div>
    </div>
  );

  if (full && ready) {
    return createPortal(shell, document.body);
  }
  return shell;
}
