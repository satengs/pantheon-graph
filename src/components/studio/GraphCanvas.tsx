import { useEffect, useMemo, useRef, useState, type PointerEvent as RE } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { GraphClickNote } from "@/components/studio/GraphClickNote";
import { buildGraph } from "@/lib/graph/model";
import { nodeLabel, TREE_SUGGESTIONS } from "@/lib/graph/suggestions";
import { useStudio, type GraphLayout } from "@/store/studio";
import { setIncludeParent as persistIncludeParent } from "@/lib/server/orgs";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { RULES } from "@/data/rules-seed";
import { familyIssues, severityTotals, useFamilyIssues } from "@/lib/studio/issue-source";
import { SevTotals } from "@/components/studio/SevTotals";
import {
  buildSeverityIndex,
  filterRollup,
  severityMatches,
  SEVERITIES,
  SEVERITY_COLOR,
  SEVERITY_GLYPH,
  SEVERITY_LABEL,
  type Severity,
  type SevRollup,
} from "@/lib/graph/severity";
import {
  buildEvidenceIndex,
  EV_COLOR,
  EV_LABEL,
  EV_TAG_FILL,
  EV_TAG_STROKE,
  evRank,
  evTagText,
  filterEvRollup,
  useEvidence,
  type EvRollup,
  type EvSeverityFilter,
  type SourceFilter,
} from "@/lib/graph/evidence";
import { evidenceLabel } from "@/lib/graph/evidence-label";
import { EvDiamond, EvidenceCard, EvTag } from "@/components/studio/EvidenceCard";

type Pt = { x: number; y: number };

const LAYOUTS: { id: GraphLayout; label: string }[] = [
  { id: "tree", label: "Tree" },
  { id: "circle", label: "Circle" },
  { id: "breadthfirst", label: "Layers" },
  { id: "grid", label: "Grid" },
];

const DRAG_PX = 14;
/** Page grid width under a tree hub: 3 × 42px fits inside the 128px hub column. */
const TREE_PAGE_COLS = 3;

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function pagePath(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function shortPageLabel(n: GraphNode) {
  const fromUrl = (n.url ?? "").replace(/\/$/, "").split("/").filter(Boolean).slice(-1)[0] ?? "";
  const raw = (n.label && n.label.trim()) || fromUrl;
  return raw.length > 22 ? `${raw.slice(0, 21)}…` : raw;
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


/** Lay brands left to right with room for each brand's hub row, so sibling hubs never overlap. */
function placeBrandsByWidth(brands: GraphNode[], hubs: GraphNode[], step: number, y: number, pos: Map<string, Pt>) {
  const gap = 140;
  const widths = brands.map((b) => {
    const own = hubs.filter((h) => (h.brand ?? "fdr") === b.brand && h.kind !== "glossary" && h.product !== "glossary").length;
    return Math.max(1, own) * step;
  });
  const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, brands.length - 1);
  let x = -total / 2;
  brands.forEach((b, i) => {
    const w = widths[i]!;
    pos.set(b.id, { x: r2(x + w / 2), y });
    x += w + gap;
  });
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
    brands.forEach((b, i) => {
      pos.set(b.id, { x: r2((i - (brands.length - 1) / 2) * 320), y: 0 });
    });
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
    placeBrandsByWidth(brands, hubs, 128, -230, pos);
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
    placeBrandsByWidth(brands, hubs, 128, -230, pos);
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
      // Glossary row sits below the deepest product page grid (3 columns) so they never overlap.
      const rows = Math.max(
        0,
        ...products.map((h) => Math.ceil(pages.filter((pg) => edges.some((e) => e.source === h.id && e.target === pg.id)).length / TREE_PAGE_COLS)),
      );
      const glossY = rows ? 160 + 62 + rows * 38 + 56 : 300;
      gloss.forEach((h, i) => {
        pos.set(h.id, {
          x: r2(origin.x + (i - (gloss.length - 1) / 2) * 80),
          y: origin.y + glossY,
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
  if (issues.length && brands.length) {
    const brandYs = brands.map((b) => pos.get(b.id)?.y ?? -230);
    const railY = Math.min(...brandYs) - 96;
    issues.forEach((n, i) => {
      const sug = TREE_SUGGESTIONS.find((t) => t.code === n.issueId || `issue:${t.code}` === n.id);
      const ax = sug ? pos.get(sug.source)?.x ?? 0 : 0;
      const bx = sug ? pos.get(sug.target)?.x ?? 0 : 0;
      pos.set(n.id, {
        x: r2((ax + bx) / 2 + (i - (issues.length - 1) / 2) * 110),
        y: r2(railY),
      });
    });
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
        const cols = Math.min(kind === "tree" ? TREE_PAGE_COLS : 5, Math.max(1, list.length));
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

const NODE_Z: Record<string, number> = { page: 0, glossary: 1, product: 2, brand: 3, parent: 4, issue: 5 };

const SEV_CHIPS: { id: EvSeverityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "crit-high", label: "Critical + High" },
  ...SEVERITIES.map((s) => ({ id: s as EvSeverityFilter, label: SEVERITY_LABEL[s] })),
];
/** Only Evidence Brief rows can be "unrated" (brief gave no P0 / severity wording). */
const UNKNOWN_CHIP = { id: "unrated" as EvSeverityFilter, label: "Unrated" };
const SOURCE_CHIPS: { id: SourceFilter; label: string }[] = [
  { id: "pantheon", label: "Pantheon" },
  { id: "evidence", label: "Evidence" },
  { id: "both", label: "Both" },
];

function clip(t: string, n: number) {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Brand-pair L2 edge bends above the brand row, clear of the S01/S06 issue rail. */
function brandArc(a: Pt, b: Pt): { c: Pt; apex: Pt } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const c = { x: r2(mx), y: r2(Math.min(a.y, b.y) - 360) };
  return { c, apex: { x: r2(mx), y: r2(0.5 * my + 0.5 * c.y) } };
}

type SevHover = {
  x: number;
  y: number;
  title: string;
  roll: SevRollup | null;
  ev: EvRollup | null;
};

export function GraphCanvas() {
  const explode = useStudio((s) => s.explode);
  const brand = useStudio((s) => s.brand);
  const product = useStudio((s) => s.product);
  const layer = useStudio((s) => s.layer);
  const selectedNodeId = useStudio((s) => s.selectedNodeId);
  const selectNode = useStudio((s) => s.selectNode);
  const setGraphInspectorOpen = useStudio((s) => s.setGraphInspectorOpen);
  const openIssueDrawer = useStudio((s) => s.openIssueDrawer);
  const setTab = useStudio((s) => s.setTab);
  const graphLayout = useStudio((s) => s.graphLayout);
  const setGraphLayout = useStudio((s) => s.setGraphLayout);
  const maximized = useStudio((s) => s.maximized);
  const setMaximized = useStudio((s) => s.setMaximized);
  const graphFocusStack = useStudio((s) => s.graphFocusStack);
  const pushGraphFocus = useStudio((s) => s.pushGraphFocus);
  const popGraphFocus = useStudio((s) => s.popGraphFocus);
  const toggleCluster = useStudio((s) => s.toggleCluster);
  const resetClusters = useStudio((s) => s.resetClusters);
  const collapsedClusters = useStudio((s) => s.collapsedClusters);
  const includeParent = useStudio((s) => s.includeParent);
  const setIncludeParent = useStudio((s) => s.setIncludeParent);
  const parentId = useStudio((s) => s.parentId);
  const graphOrg = useStudio((s) => s.graphOrg);
  const attachedRuleCodes = useStudio((s) => s.attachedRuleCodes);
  const parentSlug = useStudio((s) => s.parentSlug);
  const [sevFilter, setSevFilter] = useState<EvSeverityFilter>("all");
  const [source, setSource] = useState<SourceFilter>("both");
  const [unmappedOpen, setUnmappedOpen] = useState(false);
  const showPantheon = source !== "evidence";
  const showEvidence = source !== "pantheon";
  /** Pantheon rules never carry "unrated", so that chip matches none of them. */
  const pMatch = (s: Severity) => sevFilter !== "unrated" && severityMatches(s, sevFilter);
  const pRoll = (r: SevRollup | null) => (sevFilter === "unrated" ? null : filterRollup(r, sevFilter));
  const [sevHover, setSevHover] = useState<SevHover | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<null | {
    kind: "pan" | "node";
    id?: string;
    group?: string[];
    origins?: Record<string, Pt>;
    x: number;
    y: number;
    cx: number;
    cy: number;
    ox: number;
    oy: number;
    moved: boolean;
  }>(null);
  const [offsets, setOffsets] = useState<Record<string, Pt>>({});
  const [ready, setReady] = useState(false);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitTick, setFitTick] = useState(0);
  const lastExpand = useRef(0);
  /** Last two primary pointerdowns on nodes, to confirm a dblclick is one quick, still pair on one node. */
  const downs = useRef<{ id: string; t: number; x: number; y: number }[]>([]);
  const dragRef = useRef<typeof drag>(null);
  useEffect(() => {
    // No blue text selection while dragging a group or panning.
    const svg = svgRef.current;
    if (!svg) return;
    const on = () => document.body.classList.add("select-none");
    const off = () => document.body.classList.remove("select-none");
    svg.addEventListener("pointerdown", on);
    window.addEventListener("pointerup", off);
    window.addEventListener("pointercancel", off);
    return () => {
      svg.removeEventListener("pointerdown", on);
      window.removeEventListener("pointerup", off);
      window.removeEventListener("pointercancel", off);
      off();
    };
  }, [ready]);
  useEffect(() => {
    // React's onWheel is passive, so preventDefault there logs a warning per tick.
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 / 1.12 : 1.12;
      setZoom((z) => Math.min(2.8, Math.max(0.45, z * dir)));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [ready, maximized]);
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;

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

  // Same rule set as the Issues overlay (Backlog): filterIssues + family fit. Severity = rule.impact.
  const sevIndex = useMemo(() => {
    const rules = familyIssues({ codes: attachedRuleCodes, org: graphOrg, parentSlug, brand, product, layer });
    return buildSeverityIndex(rules);
  }, [brand, product, layer, attachedRuleCodes, graphOrg, parentSlug]);

  const graph = useMemo(
    () =>
      buildGraph({
        explode,
        brand,
        product,
        layer,
        expandIds: graphFocusStack,
        collapsedIds: collapsedClusters,
        includeParent,
        org: graphOrg ?? undefined,
        ruleCodes: attachedRuleCodes,
        issueHubs: sevIndex.issueHubs,
      }),
    [explode, brand, product, layer, graphFocusStack, collapsedClusters, includeParent, graphOrg, attachedRuleCodes, sevIndex],
  );
  const setIssueHubs = useStudio((s) => s.setIssueHubs);
  const familyRules = useFamilyIssues();
  const familyTotals = useMemo(() => severityTotals(familyRules), [familyRules]);
  useEffect(() => setIssueHubs(sevIndex.issueHubs), [sevIndex, setIssueHubs]);
  const base = useMemo(
    () => layoutOf(graphLayout, graph.nodes, graph.edges, explode),
    [graph.nodes, graph.edges, explode, graphLayout],
  );

  const sevByNode = useMemo(() => {
    const m = new Map<string, SevRollup | null>();
    for (const n of graph.nodes) {
      let r: SevRollup | null = null;
      if (n.kind === "page") r = sevIndex.forPage(n.url);
      else if ((n.kind === "product" || n.kind === "glossary") && n.brand && n.product) r = sevIndex.forHub(n.brand, n.product);
      else if (n.kind === "brand" && n.brand) r = sevIndex.forBrand(n.brand);
      else if (n.kind === "parent") r = sevIndex.forAll();
      m.set(n.id, r);
    }
    return m;
  }, [graph.nodes, sevIndex]);

  const evDoc = useEvidence();
  const evIndex = useMemo(() => buildEvidenceIndex(evDoc, brand), [evDoc, brand]);
  const evByNode = useMemo(() => {
    const m = new Map<string, EvRollup | null>();
    for (const n of graph.nodes) {
      let r: EvRollup | null = null;
      if (n.kind === "page") r = evIndex.forPage(n.url);
      else if ((n.kind === "product" || n.kind === "glossary") && n.brand && n.product) r = evIndex.forHub(n.brand, n.product);
      else if (n.kind === "brand" && n.brand) r = evIndex.forBrand(n.brand);
      else if (n.kind === "parent") r = evIndex.forAll();
      m.set(n.id, r);
    }
    return m;
  }, [graph.nodes, evIndex]);

  // Legend examples come from the same roll-ups and the same label function as the canvas tags,
  // so the legend and the tags can't disagree. Nothing until evidence.json has loaded.
  const { legendFull, legendCompact } = useMemo(() => {
    if (!evDoc) return { legendFull: null, legendCompact: null };
    const pick = (kinds: string[]) =>
      graph.nodes
        .filter((n) => kinds.includes(n.kind))
        .map((n) => filterEvRollup(evByNode.get(n.id) ?? null, sevFilter))
        .filter((r): r is EvRollup => !!r)
        .sort((a, b) => b.count - a.count)[0] ?? null;
    return {
      legendFull: evidenceLabel(pick(["parent", "brand"])?.items),
      legendCompact: evidenceLabel(pick(["product", "glossary"])?.items),
    };
  }, [evDoc, graph.nodes, evByNode, sevFilter]);

  const brandEdges = useMemo(
    () =>
      sevIndex.brandEdges.filter(
        (e) => graph.nodes.some((n) => n.id === `brand:${e.a}`) && graph.nodes.some((n) => n.id === `brand:${e.b}`),
      ),
    [sevIndex, graph.nodes],
  );

  function showSev(
    ev: { clientX: number; clientY: number },
    title: string,
    roll: SevRollup | null,
    evRoll: EvRollup | null = null,
  ) {
    if ((!roll && !evRoll) || dragRef.current?.moved) return;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    setSevHover({ x: ev.clientX - box.left, y: ev.clientY - box.top, title, roll, ev: evRoll });
  }

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

  function clusterIds(start: string): string[] {
    let root = start;
    const seen = new Set<string>();
    while (!seen.has(root)) {
      seen.add(root);
      const node = graph.nodes.find((x) => x.id === root);
      if (node && (node.kind === "product" || node.kind === "glossary" || node.kind === "brand")) break;
      const up = graph.edges.find((e) => e.kind === "owns" && e.target === root);
      if (!up) break;
      root = up.source;
    }
    const ids = new Set<string>([root]);
    const walk = [root];
    while (walk.length) {
      const id = walk.pop()!;
      for (const e of graph.edges) {
        if (e.kind === "owns" && e.source === id && !ids.has(e.target)) {
          ids.add(e.target);
          walk.push(e.target);
        }
      }
    }
    return [...ids];
  }

  function applyClusterDrag(e: RE<SVGElement> | PointerEvent, captureEl?: EventTarget | null) {
    const cur = dragRef.current;
    if (!cur || cur.kind !== "node" || !cur.id) return;
    const s = clientToSvg(e as RE<SVGSVGElement>);
    const distPx = Math.hypot(e.clientX - cur.cx, e.clientY - cur.cy);
    const moved = cur.moved || distPx > 4;
    if (!moved) return;
    const capTarget = svgRef.current ?? captureEl;
    if (capTarget && "setPointerCapture" in capTarget) {
      try {
        (capTarget as SVGElement).setPointerCapture((e as PointerEvent).pointerId);
      } catch {
        /* already captured */
      }
    }
    const dx = s.x - cur.x;
    const dy = s.y - cur.y;
    const members = cur.group?.length ? cur.group : [cur.id];
    const nextOff = { ...offsetsRef.current };
    for (const id of members) {
      const o = cur.origins?.[id] ?? (id === cur.id ? { x: cur.ox, y: cur.oy } : nextOff[id] ?? { x: 0, y: 0 });
      nextOff[id] = { x: o.x + dx, y: o.y + dy };
    }
    offsetsRef.current = nextOff;
    setOffsets(nextOff);
    if (!cur.moved) {
      const next = { ...cur, moved: true };
      dragRef.current = next;
      setDrag(next);
    }
  }

    // Fit from layout positions only. Drag offsets must not retarget the
  // camera — otherwise a hull drag looks stationary (viewBox follows).
  // Fit (button, graph change) frames base + the drag offsets as they stand at that moment.
  const vb = useMemo(() => {
    const pts: Pt[] = [];
    const off = offsetsRef.current;
    for (const n of graph.nodes) {
      const p = base.get(n.id);
      if (!p) continue;
      const o = off[n.id];
      pts.push(o ? { x: p.x + o.x, y: p.y + o.y } : p);
    }
    for (const e of sevIndex.brandEdges) {
      const pa = base.get(`brand:${e.a}`);
      const pb = base.get(`brand:${e.b}`);
      const oa = off[`brand:${e.a}`] ?? { x: 0, y: 0 };
      const ob = off[`brand:${e.b}`] ?? { x: 0, y: 0 };
      const a = pa ? { x: pa.x + oa.x, y: pa.y + oa.y } : undefined;
      const b = pb ? { x: pb.x + ob.x, y: pb.y + ob.y } : undefined;
      if (a && b) pts.push({ ...brandArc(a, b).apex, y: brandArc(a, b).apex.y - 14 });
    }
    return fitView(pts, full ? 160 : 128);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes, base, full, fitTick, ready, sevIndex]);

  // Screen px per SVG unit, for zoom-aware Evidence tags (page tags appear once legible).
  const [pxPerUnit, setPxPerUnit] = useState(0.5);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const upd = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      setPxPerUnit(Math.min(r.width / (vb.w / zoom), r.height / (vb.h / zoom)));
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vb, zoom, ready]);
  /** Page-dot Evidence tags (text ≤ 14 units) appear once that reaches ~9px on screen (about 3 zoom-ins). */
  const pagesLegible = pxPerUnit * 14 >= 9;

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
    if (n.brand === "bills") return "var(--color-bills)";
    return "color-mix(in oklab, var(--color-fg) 18%, transparent)";
  }
  function nodeR(n: GraphNode) {
    if (n.kind === "parent") return 50;
    if (n.kind === "brand") return 44;
    if (n.kind === "page") return 9;
    if (n.kind === "issue") return 24;
    if (n.kind === "glossary") return 22;
    return 26;
  }

  function expandNode(n: GraphNode) {
    const now = Date.now();
    if (now - lastExpand.current < 350) return;
    lastExpand.current = now;
    if (n.kind === "page") return;
    if (n.kind === "product" || n.kind === "glossary" || n.kind === "brand") {
      const showing =
        n.kind === "brand"
          ? graph.nodes.some((x) => x.kind === "page" && x.brand === n.brand)
          : graph.nodes.some((x) => x.kind === "page" && x.brand === n.brand && x.product === n.product);
      toggleCluster(n.id, showing);
      selectNode(n.id);
      return;
    }
    pushGraphFocus(n.id);
    if (n.issueId) {
      openIssueDrawer({ issueId: n.issueId });
      setTab("issues");
    } else selectNode(n.id);
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
      <div
        className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-bg px-2 py-1.5"
        role="radiogroup"
        aria-label="Severity filter"
        data-testid="severity-bar"
      >
        <SevTotals totals={familyTotals} label="Open rules" testId="graph-sev-totals" />
        <span className="pl-2 pr-1 text-[10px] uppercase tracking-wide text-subtle">Filter</span>
        {SEV_CHIPS.map((c) => {
          const on = sevFilter === c.id;
          const swatches = c.id === "all" ? [] : c.id === "crit-high" ? (["critical", "high"] as const) : [c.id];
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-sev-chip={c.id}
              onClick={() => setSevFilter(c.id)}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] ${on ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
            >
              {swatches.map((s) => (
                <span
                  key={s}
                  className="inline-flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-[#0b0c0e]"
                  style={{ background: SEVERITY_COLOR[s as keyof typeof SEVERITY_COLOR] }}
                  aria-hidden
                >
                  {SEVERITY_GLYPH[s as keyof typeof SEVERITY_GLYPH]}
                </span>
              ))}
              {c.label}
            </button>
          );
        })}
        {showEvidence ? (
          <button
            type="button"
            role="radio"
            aria-checked={sevFilter === UNKNOWN_CHIP.id}
            data-sev-chip="unrated"
            onClick={() => setSevFilter(UNKNOWN_CHIP.id)}
            className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] ${sevFilter === "unrated" ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
          >
            <EvDiamond />
            {UNKNOWN_CHIP.label}
          </button>
        ) : null}
        <span className="ml-2 pr-1 text-[10px] uppercase tracking-wide text-subtle">Source</span>
        <span role="radiogroup" aria-label="Issue source" className="inline-flex gap-1" data-testid="source-bar">
          {SOURCE_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={source === c.id}
              data-source-chip={c.id}
              onClick={() => {
                setSource(c.id);
                if (c.id === "pantheon" && sevFilter === "unrated") setSevFilter("all");
              }}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] ${source === c.id ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
            >
              {c.id === "pantheon" ? (
                <span className="inline-block size-3 rounded-full border-2 border-current" aria-hidden />
              ) : c.id === "evidence" ? (
                <span className="inline-block size-3 rounded-[2px] border-2 border-current" aria-hidden />
              ) : null}
              {c.label}
            </button>
          ))}
        </span>
        {showEvidence && evDoc ? (
          <button
            type="button"
            data-testid="unmapped-toggle"
            aria-expanded={unmappedOpen}
            onClick={() => setUnmappedOpen((v) => !v)}
            className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] ${unmappedOpen ? "bg-accent text-accent-fg" : "bg-raised text-muted"}`}
            title="Evidence rows whose URL is not a node in this graph"
          >
            Unmapped {evIndex.unmapped.filter((i) => sevFilter === "all" || filterEvRollup({ worst: i.severity, count: 1, pages: 0, items: [i] }, sevFilter)).length}
          </button>
        ) : null}
        <span className="hidden pl-1 text-[10px] text-subtle xl:inline">
          Ring colour = worst open rule · pill = open rules per severity (C2 H1 = 2 critical + 1 high) · ◇ outlined tag = Evidence Brief rows (count · worst rated)
          {evDoc ? ` (brief ${evDoc.newestBrief.date})` : ""} · hubs and brands roll up their pages · brand arc = cross-brand L2
        </span>
      </div>
      {graph.nodes.some((n) => n.kind === "issue") ? (
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border bg-bg px-2 py-2">
          {graph.nodes
            .filter((n) => n.kind === "issue" && n.issueId)
            .map((n) => {
              const rule = RULES.find((r) => r.code === n.issueId);
              if (!rule) return null;
              const cite = rule.citations[0];
              const page = pagePath(cite?.url ?? rule.urls[0] ?? "");
              const section = cite?.location ?? "graph";
              const on = n.id === selectedNodeId;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`flex w-full flex-col rounded-lg bg-surface p-2.5 text-left shadow-[var(--shadow-border)] ${on ? "ring-1 ring-accent" : ""}`}
                  onClick={() => {
                    selectNode(n.id);
                    if (n.issueId) {
                      openIssueDrawer({ issueId: n.issueId });
                      setTab("issues");
                    }
                  }}
                >
                  <p className="text-[10px] uppercase tracking-wide text-subtle">
                    {rule.code} · {section}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted">{page}</p>
                  <p className="mt-1 text-sm text-fg">{rule.title}</p>
                  <div className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-muted">
                    <p>
                      <span className="text-subtle">Why </span>
                      {rule.reason}
                    </p>
                    <p>
                      <span className="text-subtle">Fix </span>
                      {rule.fix}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>
      ) : null}
      <div ref={canvasRef} className="relative min-h-0 flex-1" onPointerLeave={() => setSevHover(null)}>
      <GraphClickNote />
      {ready ? (
        <svg
          ref={svgRef}
          viewBox={`${r2(vb.x + (vb.w - vb.w / zoom) / 2)} ${r2(vb.y + (vb.h - vb.h / zoom) / 2)} ${r2(vb.w / zoom)} ${r2(vb.h / zoom)}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full touch-none select-none bg-bg"
          role="img"
          aria-label="Content graph. Double-click a node to load related nodes. Back undoes the last step."
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget && (e.target as Element).tagName !== "svg") return;
            const s = clientToSvg(e);
            e.currentTarget.setPointerCapture(e.pointerId);
            const panG = { kind: "pan" as const, x: s.x, y: s.y, cx: e.clientX, cy: e.clientY, ox: pan.x, oy: pan.y, moved: false };
            setDrag(panG);
            dragRef.current = panG;
          }}
          onPointerMove={(e) => {
            const cur = dragRef.current;
            if (!cur) return;
            if (sevHover) setSevHover(null);
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
            } else if (cur.id) {
              applyClusterDrag(e, e.currentTarget);
            }
          }}
          onPointerUp={(e) => {
            const cur = dragRef.current;
            if (cur?.kind === "node" && cur.moved) {
              window.localStorage.setItem("origin.graphOffsets", JSON.stringify(offsetsRef.current));
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
            {graph.nodes
              .filter((n) => n.kind === "product" || n.kind === "glossary" || n.kind === "brand")
              .map((hub) => {
                const members = clusterIds(hub.id)
                  .map((id) => ({ id, p: at(id), n: graph.nodes.find((x) => x.id === id) }))
                  .filter((m) => m.p && m.n?.kind === "page");
                if (members.length < 1) return null;
                const hp = at(hub.id);
                const pts = [...members.map((m) => m.p!), ...(hp ? [hp] : [])];
                const pad = 28;
                const minX = Math.min(...pts.map((p) => p.x)) - pad;
                const minY = Math.min(...pts.map((p) => p.y)) - pad;
                const maxX = Math.max(...pts.map((p) => p.x)) + pad;
                const maxY = Math.max(...pts.map((p) => p.y)) + pad;
                return (
                  <rect
                    key={`cluster:${hub.id}`}
                    x={minX}
                    y={minY}
                    width={maxX - minX}
                    height={maxY - minY}
                    rx={16}
                    fill="color-mix(in oklab, var(--color-raised) 55%, transparent)"
                    stroke="color-mix(in oklab, var(--color-fg) 18%, transparent)"
                    strokeWidth={1}
                    className="cursor-grab"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      if (ev.button !== 0) return;
                      const spt = clientToSvg(ev as unknown as RE<SVGSVGElement>);
                      const group = clusterIds(hub.id);
                      const snap = offsetsRef.current;
                      const origins: Record<string, Pt> = {};
                      for (const id of group) origins[id] = snap[id] ?? { x: 0, y: 0 };
                      const o = origins[hub.id] ?? { x: 0, y: 0 };
                      const gesture = {
                        kind: "node" as const,
                        id: hub.id,
                        group,
                        origins,
                        x: spt.x,
                        y: spt.y,
                        cx: ev.clientX,
                        cy: ev.clientY,
                        ox: o.x,
                        oy: o.y,
                        moved: false,
                      };
                      setSevHover(null);
                      dragRef.current = gesture;
                      setDrag(gesture);
                      // No pointer capture here: capturing on pointerdown retargets dblclick and
                      // contextmenu to the <svg>, which killed fold and the inspector. Capture starts
                      // once the pointer actually moves (applyClusterDrag).
                      selectNode(hub.id);
                    }}
                    onPointerMove={(ev) => {
                      ev.stopPropagation();
                      applyClusterDrag(ev, ev.currentTarget);
                    }}
                    onPointerUp={(ev) => {
                      ev.stopPropagation();
                      const cur = dragRef.current;
                      if (cur?.kind === "node" && cur.moved) {
                        window.localStorage.setItem("origin.graphOffsets", JSON.stringify(offsetsRef.current));
                      }
                      dragRef.current = null;
                      setDrag(null);
                      try {
                        ev.currentTarget.releasePointerCapture(ev.pointerId);
                      } catch {
                        /* not captured */
                      }
                    }}
                  />
                );
              })}
            {(showPantheon ? brandEdges : []).map((be) => {
              const a = at(`brand:${be.a}`);
              const b = at(`brand:${be.b}`);
              if (!a || !b) return null;
              const issues = be.issues.filter((i) => pMatch(i.impact));
              const dim = issues.length === 0;
              const worst = (issues[0] ?? be.issues[0])!.impact;
              const color = SEVERITY_COLOR[worst];
              const { c, apex } = brandArc(a, b);
              const shown = dim ? be.issues : issues;
              const tag = `L2 ${SEVERITIES.map((k) => [k, shown.filter((i) => i.impact === k).length] as const)
                .filter(([, c]) => c > 0)
                .map(([k, c]) => `${SEVERITY_GLYPH[k]}${c}`)
                .join(" ")}`;
              const roll: SevRollup = {
                worst,
                count: shown.length,
                pages: 0,
                issues: shown.map((i) => ({ ...i, pages: 0 })),
              };
              const title = `${nodeLabel(`brand:${be.a}`)} ↔ ${nodeLabel(`brand:${be.b}`)} · cross-brand L2`;
              return (
                <g
                  key={`brandsev:${be.a}:${be.b}`}
                  data-brand-edge={`${be.a}|${be.b}`}
                  data-sev={worst}
                  data-sev-count={shown.length}
                  opacity={dim ? 0.2 : 1}
                  className="cursor-pointer"
                  onPointerEnter={(ev) => showSev(ev, title, roll)}
                  onPointerMove={(ev) => showSev(ev, title, roll)}
                  onPointerLeave={() => setSevHover(null)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openIssueDrawer({ issueId: shown[0]!.code });
                    setTab("issues");
                  }}
                >
                  <path d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={worst === "critical" ? 3 : worst === "high" ? 2.4 : 1.8}
                    strokeDasharray={worst === "critical" ? undefined : worst === "high" ? "8 4" : "3 4"}
                    pointerEvents="stroke"
                  />
                  <g transform={`translate(${apex.x} ${apex.y})`}>
                    <rect x={-30} y={-10} width={60} height={20} rx={10} fill={color} />
                    <text
                      y={4}
                      textAnchor="middle"
                      fill="#0b0c0e"
                      fontSize={11}
                      fontWeight={700}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {tag}
                    </text>
                  </g>
                </g>
              );
            })}
            {graph.edges.map((e) => {
              const a = at(e.source);
              const b = at(e.target);
              if (!a || !b) return null;
              const srcN = graph.nodes.find((n) => n.id === e.source);
              const tgtN = graph.nodes.find((n) => n.id === e.target);
              if (e.kind === "suggests" || e.kind === "cites") return null;
              if (e.kind === "conflict" && e.issueId !== "S01") return null;
              if (e.kind === "sameAs" && e.issueId !== "S06") return null;
              const conflict = e.kind === "conflict";
              const sameAs = e.kind === "sameAs";
              const suggests = false;
              const cites = false;
              const idx = edgePairIndex.get(e.id) ?? 0;
              const c = controlPoint(a, b, idx, e.kind, explode);
              const issueNode = e.issueId ? graph.nodes.some((n) => n.id === `issue:${e.issueId}`) : false;
              const showLabel = Boolean(e.label) && (conflict || sameAs) && !issueNode;
              const pairTitle = `${nodeLabel(e.source)} ↔ ${nodeLabel(e.target)}${e.label ? ` · ${e.label}` : ""}`;
              const hovered = hoverEdgeId === e.id;
              return (
                <g
                  key={e.id}
                  className="cursor-pointer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (e.issueId) {
                      openIssueDrawer({ issueId: e.issueId });
                      setTab("issues");
                    }
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
            {/* Pages under hubs: hubs, brands and parent paint last so a page or its label never steals their drag. */}
            {[...graph.nodes]
              .sort((a, b) => (NODE_Z[a.kind] ?? 0) - (NODE_Z[b.kind] ?? 0))
              .map((n) => {
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
                        : n.brand === "bills"
                          ? "Bills"
                          : n.label
                    : n.kind === "page"
                      ? shortPageLabel(n)
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
              const sevAll = showPantheon ? (sevByNode.get(n.id) ?? null) : null;
              const sev = pRoll(sevAll);
              const evAll = showEvidence ? (evByNode.get(n.id) ?? null) : null;
              const evr = filterEvRollup(evAll, sevFilter);
              const sevDim = sevFilter !== "all" && !sev && !evr;
              // Page tags only once zoomed in enough to read; hubs/brands carry the roll-up until then.
              const evShow = !!evr && (n.kind !== "page" || pagesLegible);
              const evLbl = evShow ? evidenceLabel(evr!.items) : null;
              const evText = evLbl?.full ?? "";
              // Brand / parent: one line left of the node, "◇ Evidence 60 · 2 critical". Hubs / pages sit
              // ~45px apart at default zoom, so they get the compact form: "◇ 5" (5 rows, none rated) or a
              // two-line "◇ 3" over "1 crit" when a row is rated. Legend explains both.
              const evStack = n.kind !== "brand" && n.kind !== "parent";
              const evLines = !evLbl ? [] : evStack ? evLbl.compact : [evLbl.full];
              // ≥ ~10px text on screen at any zoom (world size grows as you zoom out), capped.
              const evFs = n.kind === "page" ? Math.min(14, Math.max(7.5, 9.5 / pxPerUnit)) : Math.min(30, Math.max(10, 10.5 / pxPerUnit));
              const evH = evFs * (evLines.length > 1 ? 2.75 : 1.7);
              // Mono ≈ 0.6em/char; the diamond sits on line 1 only (1.45em), later lines start at 0.45em.
              const evW =
                evFs * (Math.max(0, ...evLines.map((l, li) => (li === 0 ? 1.45 : 0.45) + l.length * 0.6)) + 0.45);
              // Tag box origin (top-left), node-local. Stacked tags sit just above the severity pill.
              const evX = evStack ? -evW / 2 : -r - evW - evFs * 0.6;
              const pillTop = n.kind === "glossary" ? -r * 1.15 - 8 : -r * 0.9 - (n.kind === "page" ? 5.5 : 8);
              const evY = evStack ? pillTop - evH - evFs * 0.25 : -evH / 2;
              const sevTitle =
                n.kind === "page"
                  ? pagePath(n.url ?? n.label)
                  : n.kind === "brand"
                    ? `${n.label} · all pages`
                    : n.kind === "parent"
                      ? `${n.label} · whole family`
                      : `${nodeLabel(`brand:${n.brand}`)} · ${n.label} · all pages`;
              const small = n.kind === "page";
              const badgeH = small ? 11 : 16;
              // Per-severity counts ("C2 H1" = 2 critical + 1 high), not worst-letter + total.
              const badgeText = sev
                ? SEVERITIES.map((k) => [k, sev.issues.filter((i) => i.impact === k).length] as const)
                    .filter(([, c]) => c > 0)
                    .map(([k, c]) => `${SEVERITY_GLYPH[k]}${c}`)
                    .join(" ")
                : "";
              const badgeW = small ? 6 + badgeText.length * 4.5 : 9 + badgeText.length * 6.3;
              const bx = n.kind === "glossary" ? r * 0.55 : r * 0.62;
              const by = n.kind === "glossary" ? -r * 1.15 : -r * 0.9;
              return (
                <g
                  key={n.id}
                  data-kind={n.kind}
                  data-url={n.url ?? ""}
                  data-node-id={n.id}
                  data-selected={on ? "true" : undefined}
                  data-sev={sev?.worst}
                  data-sev-count={sev?.count}
                  data-ev={evr?.worst}
                  data-ev-count={evr?.count}
                  data-ev-tag-text={evText || undefined}
                  opacity={sevDim ? 0.22 : 1}
                  transform={`translate(${p.x} ${p.y})`}
                  className="cursor-grab"
                  onPointerEnter={(ev) => showSev(ev, sevTitle, sev, evr)}
                  onPointerLeave={() => setSevHover(null)}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    if (ev.button !== 0) return;
                    downs.current = [...downs.current, { id: n.id, t: ev.timeStamp, x: ev.clientX, y: ev.clientY }].slice(-2);
                    const spt = clientToSvg(ev as unknown as RE<SVGSVGElement>);
                    const snap = offsetsRef.current;
                    const o = snap[n.id] ?? { x: 0, y: 0 };
                    const group = clusterIds(n.id);
                    const origins: Record<string, Pt> = {};
                    for (const id of group) origins[id] = snap[id] ?? { x: 0, y: 0 };
                    const gesture = {
                      kind: "node" as const,
                      id: n.id,
                      group,
                      origins,
                      x: spt.x,
                      y: spt.y,
                      cx: ev.clientX,
                      cy: ev.clientY,
                      ox: o.x,
                      oy: o.y,
                      moved: false,
                    };
                    setSevHover(null);
                    dragRef.current = gesture;
                    setDrag(gesture);
                    // Capture only after movement (see applyClusterDrag) so dblclick/contextmenu reach this node.
                    selectNode(n.id);
                    if (n.issueId) {
                      openIssueDrawer({ issueId: n.issueId });
                      setTab("issues");
                    }
                  }}
                  onPointerMove={(ev) => {
                    ev.stopPropagation();
                    applyClusterDrag(ev, ev.currentTarget);
                  }}
                  onPointerUp={(ev) => {
                    ev.stopPropagation();
                    const cur = dragRef.current;
                    if (cur?.kind === "node" && cur.moved) {
                      window.localStorage.setItem("origin.graphOffsets", JSON.stringify(offsetsRef.current));
                    }
                    dragRef.current = null;
                    setDrag(null);
                    try {
                      ev.currentTarget.releasePointerCapture(ev.pointerId);
                    } catch {
                      /* not captured */
                    }
                  }}
                  onClick={(ev) => ev.stopPropagation()}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    selectNode(n.id);
                    if (n.issueId) {
                      openIssueDrawer({ issueId: n.issueId });
                      setTab("issues");
                    } else {
                      setGraphInspectorOpen(true);
                    }
                  }}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    // Only a genuine double-click toggles: a native dblclick (detail 2) whose two presses
                    // landed on this node within 400ms and ~6px. Two separate left-clicks only select.
                    const [a, b] = downs.current;
                    const pair =
                      ev.detail >= 2 &&
                      !!a &&
                      !!b &&
                      a.id === n.id &&
                      b.id === n.id &&
                      b.t - a.t <= 400 &&
                      Math.hypot(b.x - a.x, b.y - a.y) <= 6;
                    downs.current = [];
                    if (pair) expandNode(n);
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
                      opacity={explode && n.kind === "page" ? 0.42 : 1}
                      stroke={on && n.kind === "page" ? "none" : nodeStroke(n)}
                      strokeWidth={on ? (n.kind === "page" ? 0 : 2.2) : n.kind === "brand" || n.kind === "parent" ? 2 : 1.4}
                    />
                  )}
                  {label ? (
                    <>
                      {n.kind === "parent" || n.kind === "brand" ? (
                        <text
                          y={5}
                          textAnchor="middle"
                          stroke="var(--color-bg)"
                          strokeWidth={5}
                          fill="var(--color-fg)"
                          paintOrder="stroke"
                          fontSize={13}
                          fontWeight={700}
                          fontFamily="IBM Plex Sans, sans-serif"
                        >
                          {label}
                        </text>
                      ) : (
                        <text
                          y={r + 12}
                          textAnchor="middle"
                          fill="var(--color-fg)"
                          stroke="var(--color-bg)"
                          strokeWidth={3}
                          paintOrder="stroke"
                          pointerEvents="none"
                          fontSize={8}
                          fontWeight={600}
                          fontFamily="IBM Plex Sans, sans-serif"
                        >
                          <title>{n.label}</title>
                          {n.kind === "page" || label.length <= 16 ? label : `${label.slice(0, 15)}…`}
                        </text>
                      )}
                      {(n.kind === "product" || n.kind === "glossary") && n.count && (n.shown ?? 0) < n.count ? (
                        <text
                          data-testid="hub-shown"
                          y={r + 21}
                          textAnchor="middle"
                          fill="var(--color-muted)"
                          stroke="var(--color-bg)"
                          strokeWidth={3}
                          paintOrder="stroke"
                          pointerEvents="none"
                          fontSize={7}
                          fontFamily="IBM Plex Sans, sans-serif"
                        >
                          {n.shown ? `${n.shown} of ${n.count.toLocaleString()} shown` : `${n.count.toLocaleString()} pages`}
                        </text>
                      ) : null}
                    </>
                  ) : null}
                  {sev ? (
                    <g pointerEvents="none" data-sev-marker={sev.worst} data-sev-badge={badgeText}>
                      <circle
                        r={r + (small ? 2.5 : 4)}
                        fill="none"
                        stroke="#0b0c0e"
                        strokeWidth={small ? 3.6 : 5}
                      />
                      <circle
                        r={r + (small ? 2.5 : 4)}
                        fill="none"
                        stroke={SEVERITY_COLOR[sev.worst]}
                        strokeWidth={small ? 2 : 3}
                        strokeDasharray={sev.worst === "critical" ? undefined : sev.worst === "high" ? "6 3" : "2 3"}
                      />
                      <rect
                        x={bx - 2}
                        y={by - badgeH / 2}
                        width={badgeW}
                        height={badgeH}
                        rx={badgeH / 2}
                        fill={SEVERITY_COLOR[sev.worst]}
                        stroke="var(--color-bg)"
                        strokeWidth={1.2}
                      />
                      <text
                        x={bx - 2 + badgeW / 2}
                        y={by + (small ? 2.6 : 3.6)}
                        textAnchor="middle"
                        fill="#0b0c0e"
                        fontSize={small ? 7.5 : 10}
                        fontWeight={700}
                        fontFamily="IBM Plex Sans, sans-serif"
                      >
                        {badgeText}
                      </text>
                    </g>
                  ) : null}
                  {evr && evLbl ? (
                    <g pointerEvents="none" data-ev-marker={evr.worst} data-ev-label={evText}>
                      {/* Neutral outline, square corners, hollow diamond: a row count, not a severity pill. */}
                      <rect x={evX} y={evY} width={evW} height={evH} fill={EV_TAG_FILL} stroke={EV_TAG_STROKE} strokeWidth={evFs / 9} />
                      <rect
                        x={evX + evFs * 0.55}
                        y={evY + evFs * 0.85 - evFs * 0.27}
                        width={evFs * 0.54}
                        height={evFs * 0.54}
                        fill="none"
                        stroke={EV_TAG_STROKE}
                        strokeWidth={evFs / 8}
                        transform={`rotate(45 ${evX + evFs * 0.82} ${evY + evFs * 0.85})`}
                      />
                      {evLines.map((line, li) => (
                        <text
                          key={li}
                          x={evX + evFs * (li === 0 ? 1.45 : 0.45)}
                          y={evY + evFs * 0.85 + evFs * 0.36 + li * evFs * 1.1}
                          fill={EV_TAG_STROKE}
                          fontSize={evFs}
                          fontWeight={500}
                          fontFamily="IBM Plex Mono, monospace"
                        >
                          {line}
                        </text>
                      ))}
                    </g>
                  ) : null}
                </g>
              );
            })}
            {graph.nodes
              .filter((n) => n.kind === "issue")
              .map((n) => {
                const p = at(n.id);
                if (!p) return null;
                const on = n.id === selectedNodeId;
                const r = on ? 30 : 24;
                const kind = TREE_SUGGESTIONS.find((t) => t.code === n.issueId)?.kind;
                const issueImpact = RULES.find((x) => x.code === n.issueId)?.impact;
                const issueDim = sevFilter !== "all" && !(issueImpact && pMatch(issueImpact));
                const stroke =
                  kind === "conflict" ? "var(--color-danger)" : kind === "sameAs" ? "var(--color-accent)" : "var(--color-achieve)";
                return (
                  <g
                    key={n.id}
                    data-kind="issue"
                    data-selected={on ? "true" : undefined}
                    opacity={issueDim ? 0.22 : 1}
                    transform={`translate(${p.x} ${p.y})`}
                    className="cursor-pointer"
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      if (ev.button === 0) {
                        selectNode(n.id);
                        if (n.issueId) {
                          openIssueDrawer({ issueId: n.issueId });
                          setTab("issues");
                        }
                      }
                    }}
                    onClick={(ev) => ev.stopPropagation()}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      selectNode(n.id);
                      if (n.issueId) {
                        openIssueDrawer({ issueId: n.issueId });
                        setTab("issues");
                      }
                    }}
                  >
                    <circle r={r + 8} fill="var(--color-bg)" stroke={stroke} strokeWidth={2.4} />
                    <circle r={r} fill="var(--color-raised)" stroke={stroke} strokeWidth={on ? 3 : 2} />
                    <text
                      y={4}
                      textAnchor="middle"
                      fill="var(--color-fg)"
                      fontSize={11}
                      fontWeight={700}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {n.label}
                    </text>
                    <text
                      y={r + 14}
                      textAnchor="middle"
                      fill="var(--color-fg)"
                      fontSize={9}
                      fontWeight={600}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {kind === "sameAs" ? "sameAs" : kind === "conflict" ? "twins" : kind ?? "issue"}
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>
      ) : (
        <div className="absolute inset-0 bg-bg" />
      )}
      {sevHover ? (
        <div
          role="tooltip"
          data-testid="severity-tooltip"
          className="pointer-events-none absolute z-40 w-[20rem] rounded-md border border-border bg-surface p-2.5 text-[11px] leading-snug text-fg shadow-[var(--shadow-border)]"
          style={{
            left: Math.max(8, Math.min(sevHover.x + 14, (canvasRef.current?.clientWidth ?? 9999) - 336)),
            top: Math.max(8, Math.min(sevHover.y + 14, (canvasRef.current?.clientHeight ?? 9999) - 320)),
          }}
        >
          <p className="flex items-center gap-1.5 font-medium">
            {sevHover.roll ? (
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-[#0b0c0e]"
                style={{ background: SEVERITY_COLOR[sevHover.roll.worst] }}
              >
                {SEVERITY_GLYPH[sevHover.roll.worst]}
              </span>
            ) : null}
            {sevHover.ev ? <EvTag text={evTagText(sevHover.ev, true)} /> : null}
            <span className="truncate">{sevHover.title}</span>
          </p>
          {sevHover.roll ? (
            <>
              <p className="mt-0.5 text-[10px] text-subtle">
                Pantheon · worst {SEVERITY_LABEL[sevHover.roll.worst]} · {sevHover.roll.count} issue
                {sevHover.roll.count === 1 ? "" : "s"}
                {sevHover.roll.pages > 1 ? ` on ${sevHover.roll.pages} pages` : ""}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {sevHover.roll.issues.slice(0, sevHover.ev ? 2 : 3).map((i) => (
                  <li key={i.code} className="border-t border-border pt-1.5">
                    <p className="font-medium">
                      <span style={{ color: SEVERITY_COLOR[i.impact] }}>{SEVERITY_LABEL[i.impact]}</span> · {i.code} ·{" "}
                      {i.title}
                      {i.pages > 1 ? <span className="text-subtle"> · {i.pages} pages</span> : null}
                    </p>
                    <p className="text-muted">
                      <span className="text-subtle">Why </span>
                      {clip(i.why, sevHover.ev ? 100 : 150)}
                    </p>
                    <p className="text-muted">
                      <span className="text-subtle">Fix </span>
                      {clip(i.fix, sevHover.ev ? 100 : 150)}
                    </p>
                  </li>
                ))}
              </ul>
              {sevHover.roll.issues.length > (sevHover.ev ? 2 : 3) ? (
                <p className="mt-1 text-[10px] text-subtle">
                  +{sevHover.roll.issues.length - (sevHover.ev ? 2 : 3)} more in Issues
                </p>
              ) : null}
            </>
          ) : null}
          {sevHover.ev ? (
            <div data-testid="severity-tooltip-evidence" className={sevHover.roll ? "mt-2 border-t-2 border-border pt-1.5" : ""}>
              <p className="mt-0.5 text-[10px] text-subtle">
                {evTagText(sevHover.ev)} (row count · worst rated severity)
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {sevHover.ev.items.slice(0, sevHover.roll ? 2 : 3).map((i) => (
                  <li key={i.id} className="border-t border-border pt-1">
                    <p className="font-medium">
                      <span style={{ color: EV_COLOR[i.severity] }}>{EV_LABEL[i.severity]}</span> ·{" "}
                      {i.row != null ? `Row ${i.row}` : i.id} · {i.title}
                    </p>
                    <p className="text-subtle">
                      {i.owner} · {i.status}
                      {i.daysOpen != null ? ` · ${i.daysOpen}d open` : ""}
                    </p>
                    {i.fix ? (
                      <p className="text-muted">
                        <span className="text-subtle">Fix </span>
                        {clip(i.fix, 110)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {sevHover.ev.items.length > (sevHover.roll ? 2 : 3) ? (
                <p className="mt-1 text-[10px] text-subtle">
                  +{sevHover.ev.items.length - (sevHover.roll ? 2 : 3)} more · right-click for the Inspector
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {unmappedOpen && showEvidence && evDoc ? (
        <div
          data-testid="unmapped-panel"
          className="absolute right-3 top-3 z-30 flex max-h-[calc(100%-4.5rem)] w-[22rem] flex-col rounded-lg border border-border bg-bg shadow-[var(--shadow-border)]"
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-subtle">Evidence Brief · unmapped</p>
              <p className="text-xs text-muted">URL not a node in this graph (off-sitemap, subdomain, Apply funnel or 404)</p>
            </div>
            <button type="button" className="rounded bg-raised px-2 py-1 text-xs text-muted" onClick={() => setUnmappedOpen(false)}>
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto p-2">
            {evIndex.unmapped
              .filter((i) => sevFilter === "all" || filterEvRollup({ worst: i.severity, count: 1, pages: 0, items: [i] }, sevFilter))
              .slice()
              .sort((a, b) => evRank(a.severity) - evRank(b.severity) || (a.row ?? 999) - (b.row ?? 999))
              .map((i) => (
                <EvidenceCard key={i.id} item={i} unmapped />
              ))}
          </div>
        </div>
      ) : null}
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
          data-testid="reset-layout"
          title="Clear dragged positions, restore the issues-only expansion and re-fit"
          onClick={() => {
            offsetsRef.current = {};
            setOffsets({});
            window.localStorage.removeItem("origin.graphOffsets");
            // Back to the default view: issues-only expansion, nothing manually collapsed.
            resetClusters();
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setFitTick((t) => t + 1);
          }}
          className="inline-flex h-8 items-center justify-center rounded-md bg-surface px-2 text-xs text-fg shadow-[var(--shadow-border)]"
        >
          Reset layout
        </button>
        <button
          type="button"
          title="Fit"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setFitTick((t) => t + 1);
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
          <span className="inline-block size-2 rounded-full bg-bills" /> Bills
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-3 bg-danger" /> Conflict
        </span>
        {showPantheon ? (
          <span className="flex items-center gap-1.5 normal-case tracking-normal" data-testid="legend-sev-pill">
            <span
              className="inline-flex h-4 items-center rounded-full px-1.5 text-[9px] font-bold text-[#0b0c0e]"
              style={{ background: SEVERITY_COLOR.critical }}
            >
              C2 H1
            </span>
            = open Pantheon rules per severity (fill = worst)
          </span>
        ) : null}
        {showEvidence && evDoc && legendFull ? (
          <span className="flex items-center gap-1.5 normal-case tracking-normal" data-testid="legend-evidence">
            <EvTag text={legendFull.full} /> = {legendFull.count} Evidence Brief rows,{" "}
            {legendFull.worst ? `worst rated: ${legendFull.worst.n} ${legendFull.worst.sev}` : "none rated"}
            {legendCompact ? (
              <>
                {" "}
                · <EvTag text={legendCompact.compact.join(" / ")} /> on products / pages ={" "}
                {legendCompact.worst
                  ? `${legendCompact.count} rows, ${legendCompact.worst.n} ${legendCompact.worst.sev}`
                  : `${legendCompact.count} rows, none rated`}
              </>
            ) : null}
            {pagesLegible ? "" : " · page tags show when zoomed in"}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">Double-click cluster = pages</span>
      </div>
      </div>
    </div>
  );

  if (full && ready) {
    return createPortal(shell, document.body);
  }
  return shell;
}
